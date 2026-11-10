const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { PGlite } = require('@electric-sql/pglite');

const setupSql = fs.readFileSync(path.join(__dirname, '../supabase/email_deliveries.sql'), 'utf8');
const A1 = '20000000-0000-0000-0000-000000000001';
const A2 = '20000000-0000-0000-0000-000000000002';
const A3 = '20000000-0000-0000-0000-000000000003';

async function fixture(t) {
  const db = new PGlite();
  t.after(() => db.close());
  await db.exec(`
    CREATE ROLE anon NOLOGIN;
    CREATE ROLE authenticated NOLOGIN;
    CREATE TABLE public.applications (
      id uuid PRIMARY KEY,
      match_emailed_at timestamptz,
      poster_notified_at timestamptz
    );
    INSERT INTO public.applications VALUES
      ('${A1}', '2026-01-01T00:00:00Z', NULL),
      ('${A2}', NULL, '2026-01-02T00:00:00Z'),
      ('${A3}', NULL, NULL);
    GRANT USAGE ON SCHEMA public TO anon, authenticated;
    GRANT SELECT, INSERT, UPDATE, DELETE ON public.applications TO anon, authenticated;
  `);
  await db.exec(setupSql);
  return db;
}

const kinds = async (db, id) =>
  (await db.query('SELECT kind, sent_at IS NOT NULL AS sent FROM public.email_deliveries WHERE application_id = $1 ORDER BY kind', [id])).rows;

test('the script is safe to run twice', async t => {
  const db = await fixture(t);
  await db.exec(setupSql);
  const { rows } = await db.query('SELECT count(*)::int AS n FROM public.email_deliveries');
  assert.equal(rows[0].n, 3);
});

test('emails the older tracking recorded as sent are carried over as sent', async t => {
  const db = await fixture(t);
  assert.deepEqual(await kinds(db, A1), [
    { kind: 'match_organization', sent: true },
    { kind: 'match_volunteer', sent: true },
  ]);
  assert.deepEqual(await kinds(db, A2), [{ kind: 'new_application_organization', sent: true }]);
  assert.deepEqual(await kinds(db, A3), []);
});

test('an email can be claimed only once per application', async t => {
  const db = await fixture(t);
  await db.query("INSERT INTO public.email_deliveries (application_id, kind) VALUES ($1, 'match_volunteer')", [A3]);
  await assert.rejects(db.query("INSERT INTO public.email_deliveries (application_id, kind) VALUES ($1, 'match_volunteer')", [A3]));
  const ignored = await db.query(
    "INSERT INTO public.email_deliveries (application_id, kind) VALUES ($1, 'match_volunteer') ON CONFLICT DO NOTHING RETURNING kind", [A3]);
  assert.equal(ignored.rows.length, 0, 'a second claimant gets nothing back and must not send');
  await db.query("INSERT INTO public.email_deliveries (application_id, kind) VALUES ($1, 'match_organization')", [A3]);
});

test('only known email kinds are accepted', async t => {
  const db = await fixture(t);
  await assert.rejects(db.query("INSERT INTO public.email_deliveries (application_id, kind) VALUES ($1, 'anything')", [A3]));
});

test('deliveries disappear with their application', async t => {
  const db = await fixture(t);
  await db.query('DELETE FROM public.applications WHERE id = $1', [A1]);
  assert.deepEqual(await kinds(db, A1), []);
});

test('visitors and signed-in users cannot read or change deliveries', async t => {
  const db = await fixture(t);
  for (const role of ['anon', 'authenticated']) {
    await db.exec(`SET ROLE ${role}`);
    try {
      await assert.rejects(db.query('SELECT * FROM public.email_deliveries'), role);
      await assert.rejects(db.query("UPDATE public.email_deliveries SET sent_at = NULL"), role);
      await assert.rejects(db.query('DELETE FROM public.email_deliveries'), role);
      await assert.rejects(db.query("INSERT INTO public.email_deliveries (application_id, kind) VALUES ('" + A3 + "', 'match_volunteer')"), role);
    } finally {
      await db.exec('RESET ROLE');
    }
  }
});