const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { PGlite } = require('@electric-sql/pglite');

const read = name => fs.readFileSync(path.join(__dirname, '../supabase', name), 'utf8');
const applicationsSql = read('applications.sql');
const sharingSql = read('contact_sharing.sql');
const cleanupSql = read('contact_sharing_cleanup.sql');

const volunteer = '00000000-0000-0000-0000-000000000001';
const stranger = '00000000-0000-0000-0000-000000000002';
const owner = '00000000-0000-0000-0000-000000000003';
const otherOwner = '00000000-0000-0000-0000-000000000004';
const project = '10000000-0000-0000-0000-000000000001';
const otherProject = '10000000-0000-0000-0000-000000000002';
const resume = `${volunteer}/${project}/resume.pdf`;

// The shared contact addresses are deliberately different from anything that looks like a login email.
const VOLUNTEER_CONTACT = 'volunteer.contact@example.test';
const OWNER_CONTACT = 'owner.contact@example.test';

async function fixture(t) {
  const db = new PGlite();
  t.after(() => db.close());
  await db.exec(`
    CREATE ROLE anon NOLOGIN;
    CREATE ROLE authenticated NOLOGIN;
    CREATE SCHEMA auth;
    CREATE SCHEMA storage;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
      SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
    $$;
    CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$
      SELECT nullif(current_setting('request.jwt.claim.role', true), '')
    $$;
    CREATE FUNCTION storage.foldername(name text) RETURNS text[] LANGUAGE sql IMMUTABLE AS $$
      SELECT string_to_array(name, '/')
    $$;
    CREATE TABLE public.posts (id uuid PRIMARY KEY, user_id uuid, status text);
    CREATE TABLE public.profiles (id uuid PRIMARY KEY, role text);
    CREATE TABLE public.applications (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), project_id uuid, volunteer_id uuid,
      status text DEFAULT 'pending', resume_path text, created_at timestamptz DEFAULT now()
    );
    CREATE TABLE storage.buckets (id text PRIMARY KEY, name text, public boolean);
    CREATE TABLE storage.objects (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), bucket_id text, name text);
    ALTER TABLE public.posts ENABLE ROW LEVEL SECURITY;
    ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
    ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
    CREATE POLICY posts_read ON public.posts FOR SELECT TO authenticated
      USING (status = 'Active' OR user_id = auth.uid());
    -- The profile policies from supabase/profiles_signup.sql: people see and edit only their own row.
    CREATE POLICY profiles_select_own ON public.profiles FOR SELECT TO authenticated USING (auth.uid() = id);
    CREATE POLICY profiles_insert_own ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);
    CREATE POLICY profiles_update_own ON public.profiles FOR UPDATE TO authenticated
      USING (auth.uid() = id) WITH CHECK (auth.uid() = id);
    GRANT USAGE ON SCHEMA public, auth, storage TO authenticated, anon;
    GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public, storage TO authenticated;
    INSERT INTO public.posts VALUES ('${project}', '${owner}', 'Active'), ('${otherProject}', '${otherOwner}', 'Active');
    INSERT INTO public.profiles (id, role) VALUES
      ('${volunteer}', 'volunteer'), ('${stranger}', 'volunteer'), ('${owner}', 'nonprofit'), ('${otherOwner}', 'nonprofit');
  `);
  await db.exec(applicationsSql);
  await db.exec(sharingSql);
  return db;
}

async function asUser(db, id, run, role = 'authenticated') {
  await db.exec(`SET ROLE ${role}`);
  await db.query("SELECT set_config('request.jwt.claim.sub', $1, false), set_config('request.jwt.claim.role', $2, false)", [id ?? '', role]);
  try { return await run(); } finally {
    await db.exec('RESET ROLE');
    await db.exec("SELECT set_config('request.jwt.claim.sub', '', false), set_config('request.jwt.claim.role', '', false)");
  }
}

const apply = async (db, status = 'pending') => (await db.query(
  'INSERT INTO public.applications (project_id, volunteer_id, status, resume_path) VALUES ($1,$2,$3,$4) RETURNING id',
  [project, volunteer, status, resume],
)).rows[0].id;

const setContact = (db, id, email, share) =>
  db.query('UPDATE public.profiles SET contact_email=$2, share_contact=$3 WHERE id=$1', [id, email, share]);
const seen = async (db, user, applicationId) =>
  asUser(db, user, async () => (await db.query('SELECT public.get_shared_contact($1) AS contact', [applicationId])).rows[0].contact);

// ---- Neither, one, or both people sharing ------------------------------------

for (const [name, volunteerShares, ownerShares] of [
  ['neither person shares', false, false],
  ['only the volunteer shares', true, false],
  ['only the organization shares', false, true],
  ['both people share', true, true],
]) {
  for (const status of ['pending', 'approved']) {
    test(`${name} while the application is ${status}`, async t => {
      const db = await fixture(t);
      const application = await apply(db, status);
      await setContact(db, volunteer, VOLUNTEER_CONTACT, volunteerShares);
      await setContact(db, owner, OWNER_CONTACT, ownerShares);
      // The owner sees the volunteer's address; the volunteer sees the owner's. Each only if that person shares.
      assert.equal(await seen(db, owner, application), volunteerShares ? VOLUNTEER_CONTACT : null);
      assert.equal(await seen(db, volunteer, application), ownerShares ? OWNER_CONTACT : null);
    });
  }
}

test('a rejected application shares nothing', async t => {
  const db = await fixture(t);
  const application = await apply(db, 'pending');
  await setContact(db, volunteer, VOLUNTEER_CONTACT, true);
  await setContact(db, owner, OWNER_CONTACT, true);
  await db.query("UPDATE public.applications SET status='rejected' WHERE id=$1", [application]);
  assert.equal(await seen(db, owner, application), null);
  assert.equal(await seen(db, volunteer, application), null);
});

// ---- Changing, stopping and clearing -----------------------------------------

test('changing the address changes what the other person sees', async t => {
  const db = await fixture(t);
  const application = await apply(db);
  await setContact(db, volunteer, VOLUNTEER_CONTACT, true);
  assert.equal(await seen(db, owner, application), VOLUNTEER_CONTACT);
  await setContact(db, volunteer, 'new.address@example.test', true);
  assert.equal(await seen(db, owner, application), 'new.address@example.test');
});

test('stopping sharing hides the address without deleting it', async t => {
  const db = await fixture(t);
  const application = await apply(db);
  await setContact(db, volunteer, VOLUNTEER_CONTACT, true);
  await setContact(db, volunteer, VOLUNTEER_CONTACT, false);
  assert.equal(await seen(db, owner, application), null);
  const stored = (await db.query('SELECT contact_email, share_contact FROM public.profiles WHERE id=$1', [volunteer])).rows[0];
  assert.deepEqual(stored, { contact_email: VOLUNTEER_CONTACT, share_contact: false });
});

test('clearing the address hides it and turns sharing off, so a later address is not shared by surprise', async t => {
  const db = await fixture(t);
  const application = await apply(db);
  await setContact(db, volunteer, VOLUNTEER_CONTACT, true);
  await setContact(db, volunteer, null, true);
  assert.equal(await seen(db, owner, application), null);
  await db.query('UPDATE public.profiles SET contact_email=$2 WHERE id=$1', [volunteer, 'another@example.test']);
  assert.equal(await seen(db, owner, application), null);
});

test('addresses are trimmed and lower-cased, and a blank address means none', async t => {
  const db = await fixture(t);
  await setContact(db, volunteer, '  Someone@Example.TEST ', true);
  assert.deepEqual((await db.query('SELECT contact_email, share_contact FROM public.profiles WHERE id=$1', [volunteer])).rows[0],
    { contact_email: 'someone@example.test', share_contact: true });
  await setContact(db, volunteer, '   ', true);
  assert.deepEqual((await db.query('SELECT contact_email, share_contact FROM public.profiles WHERE id=$1', [volunteer])).rows[0],
    { contact_email: null, share_contact: false });
});

test('an address that is not an email address is rejected', async t => {
  const db = await fixture(t);
  for (const bad of ['not-an-email', 'a@b', 'two words@example.test', 'a@@example.test', `${'x'.repeat(250)}@example.test`]) {
    await assert.rejects(setContact(db, volunteer, bad, true), error => error.code === '23514', bad);
  }
  assert.equal((await db.query('SELECT contact_email FROM public.profiles WHERE id=$1', [volunteer])).rows[0].contact_email, null);
});

test('people have no sharing set up until they choose it', async t => {
  const db = await fixture(t);
  const rows = (await db.query('SELECT contact_email, share_contact FROM public.profiles')).rows;
  assert.ok(rows.every(row => row.contact_email === null && row.share_contact === false));
});

// ---- Who may look ------------------------------------------------------------

test('an unrelated account learns nothing, even when both people share', async t => {
  const db = await fixture(t);
  const application = await apply(db);
  await setContact(db, volunteer, VOLUNTEER_CONTACT, true);
  await setContact(db, owner, OWNER_CONTACT, true);
  assert.equal(await seen(db, stranger, application), null);
  assert.equal(await seen(db, otherOwner, application), null);
});

test('signed-out callers cannot ask at all', async t => {
  const db = await fixture(t);
  const application = await apply(db);
  await setContact(db, volunteer, VOLUNTEER_CONTACT, true);
  await assert.rejects(
    asUser(db, null, () => db.query('SELECT public.get_shared_contact($1)', [application]), 'anon'),
    error => error.code === '42501',
  );
});

test('asking about an application that does not exist returns nothing', async t => {
  const db = await fixture(t);
  assert.equal(await seen(db, owner, '99999999-9999-9999-9999-999999999999'), null);
});

test('profiles stay private: nobody can read or change someone else\'s contact settings directly', async t => {
  const db = await fixture(t);
  await apply(db);
  await setContact(db, volunteer, VOLUNTEER_CONTACT, true);
  await asUser(db, owner, async () => {
    assert.equal((await db.query('SELECT contact_email FROM public.profiles WHERE id=$1', [volunteer])).rows.length, 0);
    const changed = await db.query("UPDATE public.profiles SET contact_email='x@example.test', share_contact=true WHERE id=$1 RETURNING id", [volunteer]);
    assert.equal(changed.rows.length, 0);
  });
  await asUser(db, stranger, async () => {
    assert.equal((await db.query('SELECT contact_email FROM public.profiles WHERE id=$1', [owner])).rows.length, 0);
  });
});

test('people can set and clear their own contact settings', async t => {
  const db = await fixture(t);
  await asUser(db, volunteer, async () => {
    const saved = await db.query("UPDATE public.profiles SET contact_email='mine@example.test', share_contact=true WHERE id=$1 RETURNING contact_email, share_contact", [volunteer]);
    assert.deepEqual(saved.rows[0], { contact_email: 'mine@example.test', share_contact: true });
    const cleared = await db.query('UPDATE public.profiles SET contact_email=NULL WHERE id=$1 RETURNING contact_email, share_contact', [volunteer]);
    assert.deepEqual(cleared.rows[0], { contact_email: null, share_contact: false });
  });
});

// ---- The old automatic disclosure --------------------------------------------

test('the setup script can be run again without changing anything', async t => {
  const db = await fixture(t);
  await setContact(db, volunteer, VOLUNTEER_CONTACT, true);
  await db.exec(sharingSql);
  await db.exec(sharingSql);
  assert.deepEqual((await db.query('SELECT contact_email, share_contact FROM public.profiles WHERE id=$1', [volunteer])).rows[0],
    { contact_email: VOLUNTEER_CONTACT, share_contact: true });
});

test('the clean-up clears stored login emails, blocks new ones, and keeps decisions working', async t => {
  const db = await fixture(t);
  // An application stored the old way, with the applicant's login email on it.
  const old = (await db.query(
    "INSERT INTO public.applications (project_id, volunteer_id, status, resume_path, applicant_email) VALUES ($1,$2,'pending',$3,'login@example.test') RETURNING id",
    [project, volunteer, resume],
  )).rows[0].id;
  assert.equal((await db.query('SELECT applicant_email FROM public.applications WHERE id=$1', [old])).rows[0].applicant_email, 'login@example.test');

  await db.exec(cleanupSql);
  await db.exec(cleanupSql);
  assert.equal((await db.query('SELECT applicant_email FROM public.applications WHERE id=$1', [old])).rows[0].applicant_email, null);

  // A client that still tries to store the login email gets nothing stored.
  await asUser(db, stranger, () => db.query(
    "INSERT INTO public.applications (project_id, volunteer_id, status, resume_path, applicant_email) VALUES ($1,$2,'pending',$3,'login2@example.test')",
    [project, stranger, `${stranger}/${project}/resume.pdf`],
  ));
  const fresh = (await db.query('SELECT applicant_email FROM public.applications WHERE volunteer_id=$1', [stranger])).rows[0];
  assert.equal(fresh.applicant_email, null);

  // The owner can still decide, and the application is still protected from other edits.
  await asUser(db, owner, async () => {
    const approved = await db.query("UPDATE public.applications SET status='approved' WHERE id=$1 RETURNING status", [old]);
    assert.equal(approved.rows[0].status, 'approved');
    await assert.rejects(db.query("UPDATE public.applications SET resume_path='x' WHERE id=$1", [old]), error => error.code === '42501');
  });
});

test('the project owner can no longer read an applicant login email through the application', async t => {
  const db = await fixture(t);
  await db.exec(cleanupSql);
  await apply(db);
  await asUser(db, volunteer, () => db.query("UPDATE public.applications SET applicant_email='forced@example.test'").catch(() => null));
  await asUser(db, owner, async () => {
    const rows = (await db.query('SELECT applicant_email FROM public.applications')).rows;
    assert.ok(rows.length > 0);
    assert.ok(rows.every(row => row.applicant_email === null));
  });
});