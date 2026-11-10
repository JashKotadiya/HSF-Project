const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { PGlite } = require('@electric-sql/pglite');
const sql = name => fs.readFileSync(path.join(__dirname, '../supabase', name), 'utf8');
const volunteer = '00000000-0000-0000-0000-000000000001';
const other = '00000000-0000-0000-0000-000000000002';
const owner = '00000000-0000-0000-0000-000000000003';

async function fixture(t) {
  const db = new PGlite(); t.after(() => db.close());
  await db.exec(`
    create role anon; create role authenticated;
    create schema auth;
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    create table auth.users (id uuid primary key, raw_user_meta_data jsonb);
    create table public.profiles (id uuid primary key, role text, full_name text, technical_skills jsonb);
    create table public.posts (id text primary key, user_id uuid, title text, content text, status text, cause text, skills_needed jsonb, created_at timestamptz, organization_name text, location text);
    grant usage on schema public, auth to anon, authenticated;
    grant select, insert, update on public.profiles to authenticated;
    grant select on public.posts to anon, authenticated;
    grant insert, update on public.posts to authenticated;
    alter table public.posts enable row level security;
    create policy posts_read on public.posts for select to anon, authenticated using (status = 'Active' or user_id = auth.uid());
    create policy posts_write on public.posts for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
    insert into public.profiles values ('${volunteer}', 'volunteer', 'First Volunteer', '["React"]'), ('${other}', 'volunteer', 'Other Volunteer', '[]'), ('${owner}', 'nonprofit', 'Organization', '[]');
    insert into public.posts
    select 'project-' || i, '${owner}', 'Project ' || lpad(i::text, 2, '0'), 'Community service', 'Active',
      case when i = 24 then 'Environment' else 'Education' end, '["React", "Python"]',
      '2026-01-01'::timestamptz + (i - 1) * interval '1 day', 'Helpful Org', 'Springfield'
    from generate_series(1,24) i;
    insert into public.posts values ('draft', '${owner}', 'Private draft', '', 'Draft', ' Legacy Services ', '[]', now(), '', '');
    -- Both previously deployed overloads must be replaced on upgrade.
    create function public.search_projects(p_keyword text default null, p_status text default 'Active', p_tech_stack text[] default null, p_limit integer default 20, p_offset integer default 0)
    returns setof public.posts language sql as $$ select * from public.posts limit p_limit offset p_offset $$;
    create function public.search_projects(p_keyword text default null, p_status text default 'Active', p_tech_stack text[] default null, p_causes text[] default null, p_limit integer default 20, p_offset integer default 0)
    returns setof public.posts language sql as $$ select * from public.posts limit p_limit offset p_offset $$;
  `);
  await db.exec(sql('profiles_signup.sql'));
  await db.exec(sql('interests.sql'));
  await db.exec(sql('search_projects.sql'));
  return db;
}
async function asUser(db, id, run) {
  await db.exec(id ? 'set role authenticated' : 'set role anon');
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [id || '']);
  try { return await run(); } finally { await db.exec('reset role'); }
}
const search = (db, causes = null, sort = 'newest', offset = 0) => db.query(`select id from public.search_projects(p_keyword => null, p_status => 'Active', p_tech_stack => null, p_causes => $1, p_sort => $2, p_limit => 12, p_offset => $3)`, [causes, sort, offset]);

test('search sorts all matches before paging with stable next/previous results', async t => {
  const db = await fixture(t);
  await asUser(db, null, async () => {
    const newest = (await search(db)).rows;
    const next = (await search(db, null, 'newest', 12)).rows;
    assert.equal(newest[0].id, 'project-24');
    assert.equal(next[0].id, 'project-12');
    assert.equal(new Set([...newest, ...next].map(row => row.id)).size, 24);
    assert.equal((await search(db, null, 'oldest')).rows[0].id, 'project-1');
    assert.deepEqual((await search(db, ['environment'])).rows, [{ id: 'project-24' }]);
  });
});

test('keyword, skill, status, and causes combine case-insensitively and respect row visibility', async t => {
  const db = await fixture(t);
  await asUser(db, volunteer, async () => {
    const rows = await db.query(`select id from public.search_projects(p_keyword => 'Helpful Org', p_status => 'active', p_tech_stack => array['react', 'PYTHON'], p_causes => array[' environment '], p_sort => 'newest')`);
    assert.deepEqual(rows.rows, [{ id: 'project-24' }]);
    assert.equal((await db.query(`select id from public.search_projects(p_keyword => 'Springfield', p_status => null)`)).rows.length, 20);
    assert.equal((await db.query(`select id from public.search_projects(p_tech_stack => array['React', 'Rust'])`)).rows.length, 0);
    assert.equal((await db.query(`select id from public.search_projects(p_status => 'Draft')`)).rows.length, 0);
  });
  await asUser(db, owner, async () => {
    assert.deepEqual((await db.query(`select id from public.search_projects(p_status => 'Draft')`)).rows, [{ id: 'draft' }]);
  });
});

test('SQL upgrades rerun with one signature and preserve legacy named and positional callers', async t => {
  const db = await fixture(t);
  await db.exec(sql('search_projects.sql')); await db.exec(sql('search_projects.sql'));
  assert.equal((await db.query(`select count(*)::int n from pg_proc where proname = 'search_projects'`)).rows[0].n, 1);
  await asUser(db, null, async () => {
    assert.equal((await db.query(`select id from public.search_projects(p_keyword => null, p_status => 'Active', p_tech_stack => null, p_limit => 13, p_offset => 0)`)).rows.length, 13);
    assert.equal((await db.query(`select id from public.search_projects(null, 'Active', null, 13, 0)`)).rows.length, 13);
    assert.equal((await db.query(`select id from public.search_projects(p_causes => array['Environment'])`)).rows[0].id, 'project-24');
  });
});

test('interest saves replace selections atomically, reject unknown categories, and support clearing', async t => {
  const db = await fixture(t);
  await asUser(db, volunteer, async () => {
    const saved = await db.query(`select cause from public.save_my_interests(array['Education', ' Environment ', 'Education'])`);
    assert.deepEqual(saved.rows, [{ cause: 'Education' }, { cause: 'Environment' }]);
    await assert.rejects(db.query(`select * from public.save_my_interests(array['Unknown category'])`), error => error.code === '23503');
    assert.equal((await db.query('select * from public.volunteer_interests')).rows.length, 2);
    await db.query(`select * from public.save_my_interests('{}'::text[])`);
    assert.equal((await db.query('select * from public.volunteer_interests')).rows.length, 0);
  });
});

test('preferences are private and only volunteers can change their own selections', async t => {
  const db = await fixture(t);
  await asUser(db, volunteer, () => db.query(`select * from public.save_my_interests(array['Education'])`));
  await asUser(db, other, async () => {
    assert.equal((await db.query('select * from public.volunteer_interests')).rows.length, 0);
    assert.equal((await db.query(`delete from public.volunteer_interests where volunteer_id = '${volunteer}' returning *`)).rows.length, 0);
    await assert.rejects(db.query(`insert into public.volunteer_interests values ('${volunteer}', 'Environment')`), error => error.code === '42501');
  });
  await asUser(db, owner, async () => {
    await assert.rejects(db.query(`select * from public.save_my_interests(array['Education'])`), error => error.code === '42501');
    await assert.rejects(db.query(`insert into public.volunteer_interests values ('${owner}', 'Education')`), error => error.code === '42501');
  });
  await asUser(db, null, async () => {
    await assert.rejects(db.query('select * from public.volunteer_interests'), error => error.code === '42501');
    await assert.rejects(db.query(`select * from public.save_my_interests(array['Education'])`), error => error.code === '42501');
    assert.ok((await db.query('select name from public.cause_categories')).rows.length > 0);
  });
  assert.equal((await db.query('select * from public.volunteer_interests')).rows[0].volunteer_id, volunteer);
});

test('interest setup preserves profiles, preferences and legacy projects across reruns', async t => {
  const db = await fixture(t);
  const before = (await db.query('select * from public.profiles order by id')).rows;
  await asUser(db, volunteer, () => db.query(`select * from public.save_my_interests(array['Education'])`));
  await db.exec(sql('interests.sql')); await db.exec(sql('interests.sql'));
  assert.deepEqual((await db.query('select * from public.profiles order by id')).rows, before);
  assert.deepEqual((await db.query('select cause from public.volunteer_interests')).rows, [{ cause: 'Education' }]);
  assert.equal((await db.query(`select cause from public.posts where id = 'draft'`)).rows[0].cause, ' Legacy Services ');
  assert.equal((await db.query(`select name from public.cause_categories where name = 'Legacy Services'`)).rows.length, 1);
  await asUser(db, owner, () => db.query(`update public.posts set cause = 'New Local Cause' where id = 'draft'`));
  assert.equal((await db.query(`select name from public.cause_categories where name = 'New Local Cause'`)).rows.length, 1);
});


const categoryNames = async db => (await db.query('select name from public.cause_categories order by name collate "C"')).rows.map(row => row.name);
const insertPost = (db, id, cause, status = 'Active') =>
  db.query(`insert into public.posts values ($1, '${owner}', 'Project', '', $2, $3, '[]', now(), '', '')`, [id, status, cause]);

test('categories that differ only by letter case are one category for projects and for saved interests', async t => {
  const db = await fixture(t);
  const before = await categoryNames(db);
  await asUser(db, owner, async () => {
    await insertPost(db, 'lower', 'education');
    await insertPost(db, 'upper', 'ENVIRONMENT');
    await insertPost(db, 'spaced', '  human services  ');
  });
  assert.deepEqual(await categoryNames(db), before, 'no duplicate categories were added');
  // The projects keep exactly what their owners typed.
  const causes = (await db.query(`select id, cause from public.posts where id in ('lower', 'upper', 'spaced') order by id`)).rows;
  assert.deepEqual(causes, [{ id: 'lower', cause: 'education' }, { id: 'spaced', cause: '  human services  ' }, { id: 'upper', cause: 'ENVIRONMENT' }]);
  // A genuinely new cause is still registered, once, whatever its case.
  await asUser(db, owner, async () => {
    await insertPost(db, 'new-1', 'Wildlife Rescue');
    await insertPost(db, 'new-2', 'wildlife rescue');
  });
  assert.equal((await categoryNames(db)).filter(name => name.toLowerCase() === 'wildlife rescue').length, 1);

  await asUser(db, volunteer, async () => {
    const saved = await db.query(`select cause from public.save_my_interests(array['education', 'ENVIRONMENT', 'Education', ' environment '])`);
    assert.deepEqual(saved.rows, [{ cause: 'Education' }, { cause: 'Environment' }], 'saved under the standard spelling, once each');
    await assert.rejects(db.query(`select * from public.save_my_interests(array['Not a category'])`), error => error.code === '23503');
  });
});

test('categories cannot be created twice with different letter case', async t => {
  const db = await fixture(t);
  await assert.rejects(db.query(`insert into public.cause_categories values ('EDUCATION')`), error => error.code === '23505');
});

test('setup merges categories that already differ only by case, moving saved interests and keeping projects', async t => {
  const db = await fixture(t);
  // Recreate a database set up by the earlier version of interests.sql, which allowed duplicates.
  await db.exec(`
    drop index public.cause_categories_name_lower_key;
    insert into public.cause_categories values ('education'), ('EDUCATION'), ('wildlife'), ('Wildlife');
    insert into public.posts values ('old-lower', '${owner}', 'Old', '', 'Active', 'education', '[]', now(), '', '');
    insert into public.volunteer_interests values
      ('${volunteer}', 'education'), ('${volunteer}', 'EDUCATION'),
      ('${other}', 'Education'), ('${other}', 'wildlife');
  `);
  await db.exec(sql('interests.sql'));
  await db.exec(sql('interests.sql'));

  const names = await categoryNames(db);
  assert.equal(names.filter(name => name.toLowerCase() === 'education').length, 1);
  assert.ok(names.includes('Education'), 'the standard spelling is kept');
  assert.ok(names.includes('Wildlife') && !names.includes('wildlife'), 'otherwise the first spelling alphabetically is kept');
  assert.deepEqual((await db.query(`select cause from public.volunteer_interests where volunteer_id = '${volunteer}' order by cause`)).rows, [{ cause: 'Education' }]);
  assert.deepEqual((await db.query(`select cause from public.volunteer_interests where volunteer_id = '${other}' order by cause`)).rows, [{ cause: 'Education' }, { cause: 'Wildlife' }]);
  assert.equal((await db.query(`select cause from public.posts where id = 'old-lower'`)).rows[0].cause, 'education');
  await assert.rejects(db.query(`insert into public.cause_categories values ('EDUCATION')`), error => error.code === '23505');
});