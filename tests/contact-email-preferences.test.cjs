const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { PGlite } = require('@electric-sql/pglite');

const setupSql = fs.readFileSync(
  path.join(__dirname, '../supabase/contact_email_preferences.sql'),
  'utf8'
);
const volunteer = '00000000-0000-0000-0000-000000000001';
const other = '00000000-0000-0000-0000-000000000002';
const owner = '00000000-0000-0000-0000-000000000003';
const projectId = '10000000-0000-0000-0000-000000000001';

async function fixture(t) {
  const db = new PGlite();
  t.after(() => db.close());
  await db.exec(`
    CREATE ROLE anon NOLOGIN;
    CREATE ROLE authenticated NOLOGIN;
    CREATE SCHEMA auth;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
      SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
    $$;
    CREATE TABLE public.profiles (
      id uuid PRIMARY KEY,
      role text,
      contact_email text,
      share_contact_email boolean DEFAULT false
    );
    CREATE TABLE public.posts (
      id uuid PRIMARY KEY,
      user_id uuid,
      status text
    );
    CREATE TABLE public.applications (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      project_id uuid,
      volunteer_id uuid,
      status text DEFAULT 'pending',
      applicant_email text,
      created_at timestamptz DEFAULT now()
    );
    GRANT USAGE ON SCHEMA public, auth TO authenticated, anon;
    GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
    INSERT INTO public.profiles (id, role) VALUES
      ('${volunteer}', 'volunteer'),
      ('${owner}', 'nonprofit'),
      ('${other}', 'volunteer');
    INSERT INTO public.posts VALUES ('${projectId}', '${owner}', 'Active');
  `);
  await db.exec(setupSql);
  await db.exec(setupSql);
  return db;
}

async function asUser(db, id, run) {
  await db.exec('SET ROLE authenticated');
  await db.query(
    "SELECT set_config('request.jwt.claim.sub', $1, false), set_config('request.jwt.claim.role', 'authenticated', false)",
    [id]
  );
  try {
    return await run();
  } finally {
    await db.exec('RESET ROLE');
    await db.exec(
      "SELECT set_config('request.jwt.claim.sub', '', false), set_config('request.jwt.claim.role', '', false)"
    );
  }
}

async function createApplication(db, status = 'pending') {
  const result = await db.query(
    `INSERT INTO public.applications (project_id, volunteer_id, status, applicant_email)
     VALUES ($1, $2, $3, 'login@example.test') RETURNING *`,
    [projectId, volunteer, status]
  );
  return result.rows[0];
}

test('neither side sharing returns null for both participants', async t => {
  const db = await fixture(t);
  const app = await createApplication(db);

  await asUser(db, owner, async () => {
    const result = await db.query(
      'SELECT * FROM public.get_application_contact_email($1)',
      [app.id]
    );
    assert.equal(result.rows[0]?.contact_email ?? null, null);
  });

  await asUser(db, volunteer, async () => {
    const result = await db.query(
      'SELECT * FROM public.get_application_contact_email($1)',
      [app.id]
    );
    assert.equal(result.rows[0]?.contact_email ?? null, null);
  });
});

test('either side can share independently while pending', async t => {
  const db = await fixture(t);
  const app = await createApplication(db, 'pending');

  await db.query(
    `UPDATE public.profiles
     SET contact_email = 'vol@example.test', share_contact_email = true
     WHERE id = $1`,
    [volunteer]
  );

  await asUser(db, owner, async () => {
    const result = await db.query(
      'SELECT * FROM public.get_application_contact_email($1)',
      [app.id]
    );
    assert.equal(result.rows[0].contact_email, 'vol@example.test');
  });

  await asUser(db, volunteer, async () => {
    const result = await db.query(
      'SELECT * FROM public.get_application_contact_email($1)',
      [app.id]
    );
    assert.equal(result.rows[0]?.contact_email ?? null, null);
  });

  await db.query(
    `UPDATE public.profiles
     SET contact_email = 'org@example.test', share_contact_email = true
     WHERE id = $1`,
    [owner]
  );

  await asUser(db, volunteer, async () => {
    const result = await db.query(
      'SELECT * FROM public.get_application_contact_email($1)',
      [app.id]
    );
    assert.equal(result.rows[0].contact_email, 'org@example.test');
  });
});

test('both sides can share at the same time', async t => {
  const db = await fixture(t);
  const app = await createApplication(db, 'approved');

  await db.query(
    `UPDATE public.profiles SET contact_email = 'vol@example.test', share_contact_email = true WHERE id = $1`,
    [volunteer]
  );
  await db.query(
    `UPDATE public.profiles SET contact_email = 'org@example.test', share_contact_email = true WHERE id = $1`,
    [owner]
  );

  await asUser(db, owner, async () => {
    const result = await db.query(
      'SELECT * FROM public.get_application_contact_email($1)',
      [app.id]
    );
    assert.equal(result.rows[0].contact_email, 'vol@example.test');
  });

  await asUser(db, volunteer, async () => {
    const result = await db.query(
      'SELECT * FROM public.get_application_contact_email($1)',
      [app.id]
    );
    assert.equal(result.rows[0].contact_email, 'org@example.test');
  });
});

test('rejected applications and unrelated accounts cannot read contacts', async t => {
  const db = await fixture(t);
  const app = await createApplication(db, 'rejected');

  await db.query(
    `UPDATE public.profiles SET contact_email = 'vol@example.test', share_contact_email = true WHERE id = $1`,
    [volunteer]
  );
  await db.query(
    `UPDATE public.profiles SET contact_email = 'org@example.test', share_contact_email = true WHERE id = $1`,
    [owner]
  );

  await asUser(db, owner, async () => {
    const result = await db.query(
      'SELECT * FROM public.get_application_contact_email($1)',
      [app.id]
    );
    assert.equal(result.rows.length, 0);
  });

  await asUser(db, other, async () => {
    const result = await db.query(
      'SELECT * FROM public.get_application_contact_email($1)',
      [app.id]
    );
    assert.equal(result.rows.length, 0);
  });
});

test('setup leaves applicant_email readable and never returns login email as contact', async t => {
  const db = await fixture(t);
  const app = await createApplication(db, 'pending');

  const columns = await db.query(
    `SELECT column_name FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'applications' AND column_name = 'applicant_email'`
  );
  assert.equal(columns.rows.length, 1);

  await asUser(db, owner, async () => {
    const stored = await db.query(
      'SELECT applicant_email FROM public.applications WHERE id = $1',
      [app.id]
    );
    assert.equal(stored.rows[0].applicant_email, 'login@example.test');

    const contact = await db.query(
      'SELECT * FROM public.get_application_contact_email($1)',
      [app.id]
    );
    assert.equal(contact.rows[0]?.contact_email ?? null, null);
  });
});
