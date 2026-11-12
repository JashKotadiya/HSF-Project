const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { PGlite } = require('@electric-sql/pglite');

const setupSql = fs.readFileSync(path.join(__dirname, '../supabase/conversations.sql'), 'utf8');
const volunteer = '00000000-0000-0000-0000-000000000001';
const other = '00000000-0000-0000-0000-000000000002';
const owner = '00000000-0000-0000-0000-000000000003';
const active = '10000000-0000-0000-0000-000000000001';
const closed = '10000000-0000-0000-0000-000000000002';
const clientA = '20000000-0000-0000-0000-000000000001';
const clientB = '20000000-0000-0000-0000-000000000002';
const clientC = '20000000-0000-0000-0000-000000000003';
const clientD = '20000000-0000-0000-0000-000000000004';
const clientE = '20000000-0000-0000-0000-000000000005';

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
    CREATE TABLE public.posts (
      id uuid PRIMARY KEY,
      user_id uuid,
      status text,
      title text,
      organization_name text
    );
    CREATE TABLE public.applications (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      project_id uuid,
      volunteer_id uuid,
      status text DEFAULT 'pending',
      created_at timestamptz DEFAULT now()
    );
    ALTER TABLE public.posts ENABLE ROW LEVEL SECURITY;
    ALTER TABLE public.applications ENABLE ROW LEVEL SECURITY;
    CREATE POLICY posts_read ON public.posts FOR SELECT TO authenticated
      USING (status = 'Active' OR user_id = auth.uid());
    CREATE POLICY applications_select_own ON public.applications FOR SELECT TO authenticated
      USING (volunteer_id = auth.uid());
    CREATE POLICY applications_select_owner ON public.applications FOR SELECT TO authenticated
      USING (EXISTS (
        SELECT 1 FROM public.posts p
        WHERE p.id = applications.project_id AND p.user_id = auth.uid()
      ));
    GRANT USAGE ON SCHEMA public, auth TO authenticated, anon;
    GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
    INSERT INTO public.posts VALUES
      ('${active}', '${owner}', 'Active', 'Food Bank App', 'Helping Hands'),
      ('${closed}', '${owner}', 'Closed', 'Closed Project', 'Helping Hands');
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

async function createApplication(db, { status = 'pending', project = active, user = volunteer } = {}) {
  const result = await db.query(
    'INSERT INTO public.applications (project_id, volunteer_id, status) VALUES ($1,$2,$3) RETURNING *',
    [project, user, status]
  );
  return result.rows[0];
}

function send(db, applicationId, body, clientMessageId) {
  return db.query(
    'SELECT * FROM public.send_application_message($1, $2, $3)',
    [applicationId, body, clientMessageId]
  );
}

function forbidden(error) {
  return error.code === '42501';
}

test('volunteer and owner can send while pending or approved and reuse one conversation', async t => {
  const db = await fixture(t);
  const app = await createApplication(db);
  const app2 = await createApplication(db, { user: other });

  const first = await asUser(db, volunteer, () => send(db, app.id, 'Hello from volunteer', clientA));
  assert.equal(first.rows[0].sender_id, volunteer);
  assert.equal(first.rows[0].body, 'Hello from volunteer');

  const second = await asUser(db, owner, () => send(db, app.id, 'Hello from owner', clientB));
  assert.equal(second.rows[0].conversation_id, first.rows[0].conversation_id);
  assert.equal(second.rows[0].sender_id, owner);

  await db.query("UPDATE public.applications SET status = 'approved' WHERE id = $1", [app.id]);
  const third = await asUser(db, volunteer, () => send(db, app.id, 'Still approved', clientC));
  assert.equal(third.rows[0].conversation_id, first.rows[0].conversation_id);

  const otherFirst = await asUser(db, other, () => send(db, app2.id, 'Other application', clientA));
  assert.notEqual(otherFirst.rows[0].conversation_id, first.rows[0].conversation_id);

  const conversations = (await db.query('SELECT application_id FROM public.conversations ORDER BY application_id')).rows;
  assert.equal(conversations.length, 2);
});

test('unrelated users and direct table writes are rejected', async t => {
  const db = await fixture(t);
  const app = await createApplication(db);
  const sent = await asUser(db, volunteer, () => send(db, app.id, 'Private', clientA));
  const conversationId = sent.rows[0].conversation_id;
  const messageId = sent.rows[0].id;

  await asUser(db, other, async () => {
    await assert.rejects(() => send(db, app.id, 'Intruder', clientB), forbidden);
    await assert.rejects(
      () => db.query('SELECT * FROM public.list_messages($1)', [conversationId]),
      forbidden
    );
    await assert.rejects(
      () => db.query('SELECT * FROM public.get_application_conversation($1)', [app.id]),
      forbidden
    );
    await assert.rejects(
      () => db.query('SELECT * FROM public.mark_conversation_read($1, $2)', [conversationId, messageId]),
      forbidden
    );
    const listed = await db.query('SELECT * FROM public.list_conversations()');
    assert.equal(listed.rows.length, 0);
    assert.equal(
      (await db.query('SELECT id FROM public.messages WHERE id = $1', [messageId])).rows.length,
      0
    );
  });

  await asUser(db, volunteer, async () => {
    await assert.rejects(
      () => db.query(
        'INSERT INTO public.messages (conversation_id, sender_id, body, client_message_id) VALUES ($1,$2,$3,$4)',
        [conversationId, other, 'forged', clientD]
      ),
      forbidden
    );
    await assert.rejects(
      () => db.query("UPDATE public.messages SET body = 'changed' WHERE id = $1", [messageId]),
      forbidden
    );
    await assert.rejects(
      () => db.query('DELETE FROM public.messages WHERE id = $1', [messageId]),
      forbidden
    );
  });

  await asUser(db, other, async () => {
    await assert.rejects(() => send(db, app.id, '', clientE), forbidden);
  });
});

test('rejected applications are read-only and closed projects stay usable when approved', async t => {
  const db = await fixture(t);
  const app = await createApplication(db);
  const sent = await asUser(db, volunteer, () => send(db, app.id, 'Before reject', clientA));
  const conversationId = sent.rows[0].conversation_id;

  await db.query("UPDATE public.applications SET status = 'rejected' WHERE id = $1", [app.id]);

  await asUser(db, volunteer, async () => {
    await assert.rejects(
      () => send(db, app.id, 'After reject', clientB),
      error => error.message.includes('read-only')
    );
    const history = await db.query('SELECT * FROM public.list_messages($1)', [conversationId]);
    assert.equal(history.rows.length, 1);
    const marked = await db.query(
      'SELECT * FROM public.mark_conversation_read($1, $2)',
      [conversationId, sent.rows[0].id]
    );
    assert.equal(marked.rows[0].last_read_message_id, sent.rows[0].id);
    const context = await db.query('SELECT * FROM public.get_application_conversation($1)', [app.id]);
    assert.equal(context.rows[0].can_send, false);
  });

  const closedApp = await createApplication(db, { status: 'approved', project: closed });
  const closedSend = await asUser(db, volunteer, () => send(db, closedApp.id, 'Closed project ok', clientC));
  assert.equal(closedSend.rows[0].body, 'Closed project ok');
  const closedContext = await asUser(db, volunteer, () =>
    db.query('SELECT * FROM public.get_application_conversation($1)', [closedApp.id])
  );
  assert.equal(closedContext.rows[0].can_send, true);
  assert.equal(closedContext.rows[0].project_title, 'Closed Project');
});

test('empty oversized and idempotent sends behave as specified', async t => {
  const db = await fixture(t);
  const app = await createApplication(db);
  const app2 = await createApplication(db, { user: other });
  const secondApp = await createApplication(db, { user: volunteer });

  await asUser(db, volunteer, async () => {
    await assert.rejects(() => send(db, app.id, '', clientA), error => error.code === '23514');
    await assert.rejects(() => send(db, app.id, '   ', clientB), error => error.code === '23514');
    await assert.rejects(
      () => send(db, app.id, 'x'.repeat(4001), clientC),
      error => error.code === '23514'
    );
    const max = await send(db, app.id, 'y'.repeat(4000), clientD);
    assert.equal(max.rows[0].body.length, 4000);

    const first = await send(db, app.id, 'Retry me', clientE);
    const retry = await send(db, app.id, 'Retry me', clientE);
    assert.equal(retry.rows[0].id, first.rows[0].id);
    assert.equal(
      (await db.query(
        'SELECT count(*)::int AS n FROM public.messages WHERE sender_id = $1 AND client_message_id = $2',
        [volunteer, clientE]
      )).rows[0].n,
      1
    );

    await assert.rejects(
      () => send(db, app.id, 'Different body', clientE),
      error => error.code === '23505'
    );

    // Same sender cannot reuse the client id on another application.
    await assert.rejects(
      () => send(db, secondApp.id, 'Retry me', clientE),
      error => error.code === '23505'
    );
  });

  // A different sender may reuse the same client_message_id value.
  const otherSend = await asUser(db, other, () => send(db, app2.id, 'Other sender same client id', clientE));
  assert.equal(otherSend.rows[0].sender_id, other);
  assert.equal(otherSend.rows[0].client_message_id, clientE);
});

const whitespaceOnlyBodies = ['\n\t\r\n', '\t\t', '\r\n', ' \n ', '\v\f'];

function clientId(n) {
  return `30000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
}

function insertMessageDirectly(db, conversationId, body, clientMessageId) {
  return db.query(
    'INSERT INTO public.messages (conversation_id, sender_id, body, client_message_id) VALUES ($1, $2, $3, $4)',
    [conversationId, volunteer, body, clientMessageId]
  );
}

async function messageCount(db) {
  return (await db.query('SELECT count(*)::int AS n FROM public.messages')).rows[0].n;
}

async function bodyCheckIsValidated(db) {
  return (await db.query(
    "SELECT convalidated FROM pg_constraint WHERE conrelid = 'public.messages'::regclass AND conname = 'messages_body_check'"
  )).rows[0].convalidated;
}

test('whitespace-only bodies are rejected while multiline text is kept', async t => {
  const db = await fixture(t);
  const app = await createApplication(db);

  await asUser(db, volunteer, async () => {
    for (const [i, body] of whitespaceOnlyBodies.entries()) {
      await assert.rejects(
        () => send(db, app.id, body, clientId(i)),
        error => error.code === '23514',
        `expected ${JSON.stringify(body)} to be rejected`
      );
    }
  });
  assert.equal(await messageCount(db), 0);

  const multiline = await asUser(db, volunteer, () => send(db, app.id, 'Line one\n\nLine two', clientA));
  assert.equal(multiline.rows[0].body, 'Line one\n\nLine two');

  const padded = await asUser(db, volunteer, () => send(db, app.id, '\n\tHello\r\n', clientB));
  assert.equal(padded.rows[0].body, '\n\tHello\r\n');

  // The table constraint rejects whitespace-only bodies even when the RPC is bypassed.
  const conversationId = multiline.rows[0].conversation_id;
  for (const [i, body] of whitespaceOnlyBodies.entries()) {
    await assert.rejects(
      () => insertMessageDirectly(db, conversationId, body, clientId(100 + i)),
      error => error.code === '23514',
      `expected direct insert of ${JSON.stringify(body)} to be rejected`
    );
  }
  assert.equal(await messageCount(db), 2);
  assert.equal(await bodyCheckIsValidated(db), true);
});

test('message pages are ordered and cursors do not skip or repeat', async t => {
  const db = await fixture(t);
  const app = await createApplication(db);
  const conversationId = (
    await asUser(db, volunteer, () => send(db, app.id, 'seed', '30000000-0000-0000-0000-000000000099'))
  ).rows[0].conversation_id;

  // Keep seed older than the equal-timestamp batch so pagination is deterministic.
  await db.query(
    `UPDATE public.messages SET created_at = '2025-12-31T12:00:00.000Z'::timestamptz
     WHERE conversation_id = $1 AND body = 'seed'`,
    [conversationId]
  );

  const stamp = '2026-01-01T12:00:00.000Z';
  for (let i = 0; i < 5; i += 1) {
    const id = `40000000-0000-0000-0000-00000000000${i}`;
    await db.query(
      `INSERT INTO public.messages (id, conversation_id, sender_id, body, created_at, client_message_id)
       VALUES ($1, $2, $3, $4, $5::timestamptz, $6)`,
      [id, conversationId, owner, `m${i}`, stamp, `50000000-0000-0000-0000-00000000000${i}`]
    );
  }

  await asUser(db, volunteer, async () => {
    await assert.rejects(
      () => db.query(
        'SELECT * FROM public.list_messages($1, $2::timestamptz, NULL, 2)',
        [conversationId, stamp]
      ),
      error => error.code === '22023'
    );

    const page1 = await db.query(
      'SELECT * FROM public.list_messages($1, NULL, NULL, 3)',
      [conversationId]
    );
    assert.deepEqual(
      page1.rows.map(row => row.body),
      ['m2', 'm3', 'm4']
    );

    const oldest = page1.rows[0];
    const page2 = await db.query(
      'SELECT * FROM public.list_messages($1, $2::timestamptz, $3, 3)',
      [conversationId, oldest.created_at, oldest.id]
    );
    assert.deepEqual(
      page2.rows.map(row => row.body),
      ['seed', 'm0', 'm1']
    );
    const overlap = page1.rows.map(row => row.id).filter(id => page2.rows.some(row => row.id === id));
    assert.deepEqual(overlap, []);
  });
});

test('read cursors stay independent and only move forward', async t => {
  const db = await fixture(t);
  const app = await createApplication(db);

  const volunteerMsg = await asUser(db, volunteer, () => send(db, app.id, 'From volunteer', clientA));
  const ownerMsg = await asUser(db, owner, () => send(db, app.id, 'From owner', clientB));
  const conversationId = volunteerMsg.rows[0].conversation_id;

  await asUser(db, volunteer, async () => {
    const listed = await db.query('SELECT * FROM public.list_conversations()');
    assert.equal(listed.rows.length, 1);
    assert.equal(Number(listed.rows[0].unread_count), 1);
    assert.equal(listed.rows[0].last_message_body, 'From owner');
    assert.equal(listed.rows[0].caller_role, 'volunteer');

    await db.query(
      'SELECT * FROM public.mark_conversation_read($1, $2)',
      [conversationId, ownerMsg.rows[0].id]
    );
    const after = await db.query('SELECT * FROM public.list_conversations()');
    assert.equal(Number(after.rows[0].unread_count), 0);

    const rewind = await db.query(
      'SELECT * FROM public.mark_conversation_read($1, $2)',
      [conversationId, volunteerMsg.rows[0].id]
    );
    assert.equal(rewind.rows[0].last_read_message_id, ownerMsg.rows[0].id);

    assert.equal(
      (await db.query(
        'SELECT * FROM public.conversation_reads WHERE conversation_id = $1 AND user_id = $2',
        [conversationId, owner]
      )).rows.length,
      0
    );
  });

  await asUser(db, owner, async () => {
    const listed = await db.query('SELECT * FROM public.list_conversations()');
    assert.equal(Number(listed.rows[0].unread_count), 1);
    await db.query('SELECT * FROM public.mark_conversation_read($1, NULL)', [conversationId]);
    const after = await db.query('SELECT * FROM public.list_conversations()');
    assert.equal(Number(after.rows[0].unread_count), 0);
  });
});

test('setup rerun preserves conversations messages and read cursors', async t => {
  const db = await fixture(t);
  const app = await createApplication(db);
  const sent = await asUser(db, volunteer, () => send(db, app.id, 'Keep me', clientA));
  await asUser(db, owner, () =>
    db.query('SELECT * FROM public.mark_conversation_read($1, $2)', [
      sent.rows[0].conversation_id,
      sent.rows[0].id,
    ])
  );

  const before = {
    conversations: (await db.query('SELECT * FROM public.conversations ORDER BY id')).rows,
    messages: (await db.query('SELECT * FROM public.messages ORDER BY id')).rows,
    reads: (await db.query('SELECT * FROM public.conversation_reads ORDER BY user_id')).rows,
  };

  await db.exec(setupSql);
  await db.exec(setupSql);

  const after = {
    conversations: (await db.query('SELECT * FROM public.conversations ORDER BY id')).rows,
    messages: (await db.query('SELECT * FROM public.messages ORDER BY id')).rows,
    reads: (await db.query('SELECT * FROM public.conversation_reads ORDER BY user_id')).rows,
  };

  assert.deepEqual(after, before);
});

test('setup rerun keeps legacy whitespace-only messages and still enforces the body rule', async t => {
  const db = await fixture(t);
  const app = await createApplication(db);
  const sent = await asUser(db, volunteer, () => send(db, app.id, 'Real message', clientA));
  const conversationId = sent.rows[0].conversation_id;

  // Simulate a row stored before the stricter rule existed.
  await db.exec('ALTER TABLE public.messages DROP CONSTRAINT messages_body_check');
  await insertMessageDirectly(db, conversationId, '\n\t\r\n', clientB);

  await db.exec(setupSql);

  assert.equal(await messageCount(db), 2);
  assert.equal(await bodyCheckIsValidated(db), false);
  await assert.rejects(
    () => asUser(db, volunteer, () => send(db, app.id, '\t\r\n', clientC)),
    error => error.code === '23514'
  );
  await assert.rejects(
    () => insertMessageDirectly(db, conversationId, '\t\r\n', clientD),
    error => error.code === '23514'
  );

  // Once the legacy row is gone, the next rerun validates the constraint.
  await db.query('DELETE FROM public.messages WHERE client_message_id = $1', [clientB]);
  await db.exec(setupSql);
  assert.equal(await bodyCheckIsValidated(db), true);
});
