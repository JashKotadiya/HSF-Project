const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { PGlite } = require('@electric-sql/pglite');

const sql = (name) => fs.readFileSync(path.join(__dirname, '../supabase', name), 'utf8');
const volunteer = '00000000-0000-0000-0000-000000000001';
const peerA = '00000000-0000-0000-0000-000000000002';
const peerB = '00000000-0000-0000-0000-000000000003';
const peerC = '00000000-0000-0000-0000-000000000004';
const owner = '00000000-0000-0000-0000-000000000005';
const outsider = '00000000-0000-0000-0000-000000000006';

async function fixture(t) {
  const db = new PGlite();
  t.after(() => db.close());
  await db.exec(`
    create role anon; create role authenticated;
    create schema auth;
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
    $$;
    create table auth.users (id uuid primary key, raw_user_meta_data jsonb);
    create table public.profiles (
      id uuid primary key,
      role text,
      full_name text,
      technical_skills jsonb default '[]'::jsonb
    );
    create table public.posts (
      id text primary key,
      user_id uuid,
      title text,
      content text,
      status text,
      cause text,
      skills_needed jsonb,
      created_at timestamptz,
      organization_name text,
      location text
    );
    create table public.applications (
      id uuid primary key default gen_random_uuid(),
      project_id text,
      volunteer_id uuid,
      status text default 'pending',
      created_at timestamptz default now()
    );
    grant usage on schema public, auth to anon, authenticated;
    grant select, insert, update, delete on all tables in schema public to authenticated;
    grant select on public.posts to anon;

    insert into public.profiles values
      ('${volunteer}', 'volunteer', 'Ada', '["React", "TypeScript"]'),
      ('${peerA}', 'volunteer', 'Peer A', '["React"]'),
      ('${peerB}', 'volunteer', 'Peer B', '["React", "Python"]'),
      ('${peerC}', 'volunteer', 'Peer C', '["React"]'),
      ('${owner}', 'nonprofit', 'Org', '[]'),
      ('${outsider}', 'volunteer', 'Other skills', '["Go"]');

    insert into public.posts values
      ('edu-react', '${owner}', 'Education site', 'Build a site', 'Active', 'Education', '["React", "CSS"]', '2026-02-01', 'Org', 'Amherst'),
      ('env-python', '${owner}', 'Climate tools', 'Data work', 'Active', 'Environment', '["Python"]', '2026-02-02', 'Org', 'Amherst'),
      ('health-none', '${owner}', 'Clinic intake', 'Forms', 'Active', 'Health', '["Excel"]', '2026-02-03', 'Org', 'Amherst'),
      ('edu-closed', '${owner}', 'Closed edu', 'Done', 'Closed', 'Education', '["React"]', '2026-02-04', 'Org', 'Amherst'),
      ('edu-draft', '${owner}', 'Draft edu', 'Soon', 'Draft', 'Education', '["React"]', '2026-02-05', 'Org', 'Amherst'),
      ('edu-applied', '${owner}', 'Already applied', 'Skip', 'Active', 'Education', '["React"]', '2026-02-06', 'Org', 'Amherst'),
      ('edu-peer', '${owner}', 'Peer joined', 'Popular', 'Active', 'Education', '["React"]', '2026-01-15', 'Org', 'Amherst');
  `);
  await db.exec(sql('interests.sql'));
  await db.exec(sql('recommend_projects.sql'));
  return db;
}

async function asUser(db, id, run) {
  await db.exec(id ? 'set role authenticated' : 'set role anon');
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [id || '']);
  try {
    return await run();
  } finally {
    await db.exec('reset role');
    await db.query("select set_config('request.jwt.claim.sub', '', false)", []);
  }
}

test('recommendations rank by cause and skills and exclude applied or unavailable listings', async (t) => {
  const db = await fixture(t);
  await asUser(db, volunteer, async () => {
    await db.query(`select * from public.save_my_interests(array['Education'])`);
    await db.query(
      `insert into public.applications (project_id, volunteer_id, status) values ('edu-applied', $1, 'pending')`,
      [volunteer],
    );

    const rows = (
      await db.query(
        `select id, score, cause_score, skill_score, peer_score, ranking_mode, reasons
         from public.recommend_projects(20, 0)`,
      )
    ).rows;

    // edu-peer has a tighter React-only skill overlap than edu-react (React+CSS).
    assert.deepEqual(
      rows.map((row) => row.id),
      ['edu-peer', 'edu-react', 'health-none', 'env-python'],
    );
    assert.equal(rows[0].ranking_mode, 'personalized');
    assert.ok(Number(rows[0].cause_score) === 50);
    assert.ok(Number(rows[0].skill_score) > Number(rows[1].skill_score));
    assert.ok(rows[0].reasons.some((reason) => /interest in Education/i.test(reason)));
    assert.ok(rows[0].reasons.some((reason) => /skills/i.test(reason)));
    assert.ok(!rows.some((row) => ['edu-applied', 'edu-closed', 'edu-draft'].includes(row.id)));
  });
});

test('peer participation boosts only with a private cohort of similar approved volunteers', async (t) => {
  const db = await fixture(t);
  await asUser(db, volunteer, async () => {
    await db.query(`select * from public.save_my_interests(array['Education'])`);
  });
  for (const peer of [peerA, peerB, peerC]) {
    await asUser(db, peer, async () => {
      await db.query(`select * from public.save_my_interests(array['Education'])`);
      await db.query(
        `insert into public.applications (project_id, volunteer_id, status) values ('edu-peer', $1, 'approved')`,
        [peer],
      );
    });
  }

  await asUser(db, volunteer, async () => {
    const rows = (
      await db.query(
        `select id, peer_score, reasons from public.recommend_projects(20, 0)`,
      )
    ).rows;
    const peerProject = rows.find((row) => row.id === 'edu-peer');
    assert.ok(peerProject);
    assert.equal(Number(peerProject.peer_score), 10);
    assert.ok(peerProject.reasons.some((reason) => /similar profiles/i.test(reason)));
    assert.ok(!JSON.stringify(rows).includes(peerA));
  });
});

test('cold-start callers get honest general guidance and stable pagination', async (t) => {
  const db = await fixture(t);
  await asUser(db, outsider, async () => {
    const signals = (await db.query(`select * from public.get_my_recommendation_signals()`)).rows[0];
    assert.equal(signals.cold_start, false);
    assert.equal(signals.has_interests, false);
    assert.equal(signals.has_skills, true);

    await db.query(`update public.profiles set technical_skills = '[]'::jsonb where id = $1`, [outsider]);
    const cold = (await db.query(`select * from public.get_my_recommendation_signals()`)).rows[0];
    assert.equal(cold.cold_start, true);

    const page1 = (
      await db.query(`select id, ranking_mode, reasons from public.recommend_projects(2, 0)`)
    ).rows;
    const page2 = (
      await db.query(`select id, ranking_mode, reasons from public.recommend_projects(2, 2)`)
    ).rows;
    assert.equal(page1.length, 2);
    assert.equal(page2.length, 2);
    assert.equal(new Set([...page1, ...page2].map((row) => row.id)).size, 4);
    assert.ok(page1.every((row) => row.ranking_mode === 'cold_start'));
    assert.ok(page1[0].reasons[0].includes('add skills and interests'));
  });
});

test('anonymous callers are rejected and the script is safe to re-run', async (t) => {
  const db = await fixture(t);
  await db.exec(sql('recommend_projects.sql'));
  await asUser(db, null, async () => {
    await assert.rejects(
      db.query(`select * from public.recommend_projects()`),
      (error) => error.code === '42501',
    );
    await assert.rejects(
      db.query(`select * from public.get_my_recommendation_signals()`),
      (error) => error.code === '42501',
    );
  });
});
