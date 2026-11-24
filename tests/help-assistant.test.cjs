const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { PGlite } = require('@electric-sql/pglite');

const setupSql = fs.readFileSync(path.join(__dirname, '../supabase/help_assistant.sql'), 'utf8');

async function fixture(t) {
  const db = new PGlite();
  t.after(() => db.close());
  await db.exec(`
    CREATE ROLE anon NOLOGIN;
    CREATE ROLE authenticated NOLOGIN;
    CREATE ROLE service_role NOLOGIN;
    GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
  `);
  await db.exec(setupSql);
  return db;
}

const take = async (db, scope, limit) =>
  (await db.query('select public.help_assistant_take($1, $2) as allowed', [scope, limit])).rows[0].allowed;
const count = async (db, scope) =>
  (await db.query('select count from public.help_assistant_usage where scope = $1', [scope])).rows[0]?.count;

test('the script is safe to run twice and keeps existing counts', async t => {
  const db = await fixture(t);
  assert.equal(await take(db, 'user:a:2026-11-20', 5), true);
  await db.exec(setupSql);
  assert.equal(await count(db, 'user:a:2026-11-20'), 1);
});

test('uses are allowed up to the limit and refused after it', async t => {
  const db = await fixture(t);
  const results = [];
  for (let i = 0; i < 5; i++) results.push(await take(db, 'user:a:2026-11-20', 3));
  assert.deepEqual(results, [true, true, true, false, false]);
  assert.equal(await count(db, 'user:a:2026-11-20'), 3, 'refused attempts are not counted');
});

test('each scope has its own count, so people and days do not affect each other', async t => {
  const db = await fixture(t);
  assert.equal(await take(db, 'user:a:2026-11-20', 1), true);
  assert.equal(await take(db, 'user:a:2026-11-20', 1), false);
  assert.equal(await take(db, 'user:b:2026-11-20', 1), true);
  assert.equal(await take(db, 'user:a:2026-11-21', 1), true);
  assert.equal(await take(db, 'global:2026-11-20', 1), true);
});

test('a limit of zero, a negative limit, or no limit refuses everything and records nothing', async t => {
  const db = await fixture(t);
  for (const limit of [0, -5, null]) assert.equal(await take(db, 'user:a:2026-11-20', limit), false);
  assert.equal(await count(db, 'user:a:2026-11-20'), undefined);
});

test('simultaneous uses cannot go past the limit', async t => {
  const db = await fixture(t);
  const results = await Promise.all(Array.from({ length: 12 }, () => take(db, 'global:2026-11-20', 4)));
  assert.equal(results.filter(Boolean).length, 4);
  assert.equal(await count(db, 'global:2026-11-20'), 4);
});

test('only counters are stored: no question, answer, or user details', async t => {
  const db = await fixture(t);
  const columns = (await db.query(`select column_name from information_schema.columns where table_name = 'help_assistant_usage' order by column_name`)).rows.map(row => row.column_name);
  assert.deepEqual(columns, ['count', 'created_at', 'scope']);
});

test('visitors and signed-in users cannot read, change, or use the counter; only the service role can', async t => {
  const db = await fixture(t);
  for (const role of ['anon', 'authenticated']) {
    await db.exec(`SET ROLE ${role}`);
    try {
      await assert.rejects(db.query('select * from public.help_assistant_usage'), role);
      await assert.rejects(db.query(`insert into public.help_assistant_usage (scope, count) values ('x', 0)`), role);
      await assert.rejects(db.query(`update public.help_assistant_usage set count = 0`), role);
      await assert.rejects(db.query(`select public.help_assistant_take('user:x:2026-11-20', 100)`), role);
    } finally {
      await db.exec('RESET ROLE');
    }
  }
  await db.exec('SET ROLE service_role');
  try {
    assert.equal((await db.query(`select public.help_assistant_take('user:x:2026-11-20', 100) as allowed`)).rows[0].allowed, true);
  } finally {
    await db.exec('RESET ROLE');
  }
});
