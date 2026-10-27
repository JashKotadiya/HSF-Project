const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { PGlite } = require('@electric-sql/pglite');

const setupSql = fs.readFileSync(path.join(__dirname, '../supabase/applications.sql'), 'utf8');
const volunteer = '00000000-0000-0000-0000-000000000001';
const other = '00000000-0000-0000-0000-000000000002';
const owner = '00000000-0000-0000-0000-000000000003';
const active = '10000000-0000-0000-0000-000000000001';
const closed = '10000000-0000-0000-0000-000000000002';
const draft = '10000000-0000-0000-0000-000000000003';
const ownResume = `${volunteer}/${active}/resume.pdf`;
const otherResume = `${other}/private/resume.pdf`;

async function fixture(t, legacyEnum = false) {
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
    ${legacyEnum ? "CREATE TYPE application_status AS ENUM ('pending', 'accepted', 'rejected');" : ''}
    CREATE TABLE public.applications (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), project_id uuid, volunteer_id uuid,
      status ${legacyEnum ? 'application_status' : 'text'} DEFAULT 'pending',
      resume_path text, created_at timestamptz DEFAULT now()
    );
    CREATE TABLE storage.buckets (id text PRIMARY KEY, name text, public boolean);
    CREATE TABLE storage.objects (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), bucket_id text, name text);
    ALTER TABLE public.posts ENABLE ROW LEVEL SECURITY;
    ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
    CREATE POLICY posts_read ON public.posts FOR SELECT TO authenticated
      USING (status = 'Active' OR user_id = auth.uid());
    -- Model main's existing insert policy before this PR is applied.
    ALTER TABLE public.applications ENABLE ROW LEVEL SECURITY;
    CREATE POLICY applications_insert_own ON public.applications FOR INSERT TO authenticated
      WITH CHECK (volunteer_id = auth.uid());
    GRANT USAGE ON SCHEMA public, auth, storage TO authenticated;
    GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public, storage TO authenticated;
    INSERT INTO public.posts VALUES
      ('${active}', '${owner}', 'Active'),
      ('${closed}', '${owner}', 'Closed'),
      ('${draft}', '${owner}', 'Draft');
    INSERT INTO storage.objects (bucket_id, name) VALUES
      ('resumes', '${ownResume}'), ('resumes', '${otherResume}');
  `);
  return db;
}

async function asUser(db, id, run) {
  await db.exec('SET ROLE authenticated');
  await db.query("SELECT set_config('request.jwt.claim.sub', $1, false), set_config('request.jwt.claim.role', 'authenticated', false)", [id]);
  try { return await run(); } finally {
    await db.exec('RESET ROLE');
    await db.exec("SELECT set_config('request.jwt.claim.sub', '', false), set_config('request.jwt.claim.role', '', false)");
  }
}

function insert(db, status = 'pending', project = active, user = volunteer) {
  return db.query('INSERT INTO public.applications (project_id, volunteer_id, status, resume_path) VALUES ($1,$2,$3,$4) RETURNING *', [project, user, status, ownResume]);
}

test('setup reruns with existing policies, decisions, viewed times, and resumes', async t => {
  const db = await fixture(t);
  await db.exec(setupSql);
  const app = (await asUser(db, volunteer, () => insert(db))).rows[0];
  await asUser(db, owner, () => db.query("UPDATE public.applications SET status='approved', viewed_at='2026-01-01T12:00:00Z' WHERE id=$1", [app.id]));
  const before = (await db.query('SELECT * FROM public.applications WHERE id=$1', [app.id])).rows;
  await db.exec(setupSql);
  await db.exec(setupSql);
  const after = (await db.query('SELECT * FROM public.applications WHERE id=$1', [app.id])).rows;
  assert.deepEqual(after, before);
  assert.equal(after[0].status, 'approved');
  assert.equal(after[0].resume_path, ownResume);
  await asUser(db, owner, async () => {
    const changed = await db.query("UPDATE public.applications SET status='rejected' WHERE id=$1 RETURNING status", [app.id]);
    assert.equal(changed.rows[0].status, 'rejected');
  });
});

test('legacy enum status and its typed default migrate to text and remain rerunnable', async t => {
  const db = await fixture(t, true);
  const existing = (await insert(db, 'accepted')).rows[0];
  await db.exec(setupSql);
  await db.exec(setupSql);
  const migrated = (await db.query('SELECT status, pg_typeof(status)::text AS type FROM public.applications WHERE id=$1', [existing.id])).rows[0];
  assert.deepEqual(migrated, { status: 'approved', type: 'text' });
  const next = await asUser(db, other, () => db.query('INSERT INTO public.applications (project_id, volunteer_id) VALUES ($1,$2) RETURNING status', [active, other]));
  assert.equal(next.rows[0].status, 'pending');
});

test('repeated setup retains the fixes for application status, project eligibility, and resume access', async t => {
  const db = await fixture(t);
  await db.exec(setupSql);
  await db.exec(setupSql);
  const forbidden = error => error.code === '42501';
  await asUser(db, volunteer, async () => {
    for (const status of ['approved', 'rejected', null]) {
      await assert.rejects(insert(db, status), forbidden);
    }
    for (const project of [closed, draft]) {
      await assert.rejects(insert(db, 'pending', project), forbidden);
    }
    await assert.rejects(insert(db, 'pending', active, other), forbidden);
  });
  const app = (await asUser(db, volunteer, () => insert(db))).rows[0];
  await asUser(db, volunteer, async () => {
    const update = await db.query("UPDATE public.applications SET status='approved' WHERE id=$1 RETURNING id", [app.id]);
    assert.equal(update.rows.length, 0);
  });
  await asUser(db, owner, async () => {
    await assert.rejects(db.query('UPDATE public.applications SET resume_path=$1 WHERE id=$2', [otherResume, app.id]), forbidden);
    const approved = await db.query("UPDATE public.applications SET status='approved', viewed_at=now() WHERE id=$1 RETURNING status", [app.id]);
    assert.equal(approved.rows[0].status, 'approved');
    assert.equal((await db.query('SELECT name FROM storage.objects WHERE name=$1', [ownResume])).rows.length, 1);
    assert.equal((await db.query('SELECT name FROM storage.objects WHERE name=$1', [otherResume])).rows.length, 0);
  });
  await asUser(db, other, async () => {
    assert.equal((await db.query('SELECT id FROM public.applications WHERE id=$1', [app.id])).rows.length, 0);
    assert.equal((await db.query("UPDATE public.applications SET status='rejected' WHERE id=$1 RETURNING id", [app.id])).rows.length, 0);
  });
});
