import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { createClient } from '@supabase/supabase-js';

// Load the production state machine and adapter. HTTP is isolated from hosted data.
function loadModules(client) {
  const modules = new Map();
  function load(name) {
    if (modules.has(name)) return modules.get(name);
    const exported = {};
    const compiled = ts.transpileModule(fs.readFileSync(new URL(`../src/lib/${name}.ts`, import.meta.url), 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
    }).outputText;
    vm.runInNewContext(compiled, { exports: exported, Error, Array, Number, Map, Set, JSON, console, require(id) {
      if (id === '@/lib/supabase') return { __esModule: true, default: client };
      if (id === '@/lib/messaging') return load('messaging');
      if (id === '@/lib/conversations') {
        return {
          CONVERSATION_RPCS: {
            send: 'send_application_message',
            list: 'list_conversations',
            messages: 'list_messages',
            get: 'get_application_conversation',
            markRead: 'mark_conversation_read',
          },
        };
      }
      if (id === '@/lib/applications') return {};
      throw new Error(`Unexpected import: ${id}`);
    } });
    modules.set(name, exported);
    return exported;
  }
  return { ...load('messaging'), ...load('conversationStore') };
}
const { ConversationStore, mergeMessages, MESSAGE_LIMIT, MESSAGE_PAGE_SIZE } = loadModules(null);
const conversation = {
  id: 'conversation-1',
  application_id: 'application-1',
  project_id: 'project-1',
  project_title: 'Website support',
  participant_name: 'Community Center',
  application_status: 'pending',
  can_send: true,
  unread_count: 1,
  last_message: 'Hello',
  updated_at: '2026-11-05T12:00:00Z',
};
const stamp = (n) => `2026-11-05T12:${String(n).padStart(2, '0')}:00Z`;
const message = (n, sender = 'other', clientId = `client-${n}`) => ({
  id: `message-${n}`,
  conversation_id: conversation.id,
  sender_id: sender,
  client_id: clientId,
  body: `Message ${n}`,
  created_at: stamp(n),
});
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
function storage() {
  const values = new Map();
  return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) };
}
function setup(overrides = {}, options = {}) {
  const calls = { sends: [], reads: [] };
  const api = {
    open: async () => conversation,
    history: async () => ({ messages: [message(1)], has_more: false }),
    send: async (applicationId, body, clientId) => {
      calls.sends.push({ applicationId, body, clientId });
      return { ...message(2, 'me', clientId), body };
    },
    read: async (id, messageId) => { calls.reads.push({ id, messageId }); },
    ...overrides,
  };
  let serial = 0;
  const saved = options.storage ?? storage();
  const store = new ConversationStore(
    options.user ?? 'me',
    options.application ?? 'application-1',
    api,
    saved,
    () => `outgoing-${++serial}`,
    options.onRead,
    options.visible,
  );
  return { store, calls, saved, api };
}
const ids = store => Array.from(store.getSnapshot().messages, value => value.id);

test('failed sends keep text and reuse the idempotency key on retry', async () => {
  let attempts = 0;
  const keys = [];
  const { store } = setup({ send: async (applicationId, body, clientId) => {
    keys.push(clientId);
    if (++attempts === 1) throw new Error('Network interrupted');
    return { ...message(2, 'me', clientId), body };
  } });
  await store.start(); store.setDraft('  My reply  '); await store.send();
  assert.equal(store.getSnapshot().outgoing[0].body, 'My reply');
  assert.equal(store.getSnapshot().outgoing[0].state, 'failed');
  await store.retry(keys[0]);
  assert.equal(keys[1], keys[0]);
  assert.equal(store.getSnapshot().outgoing.length, 0);
  assert.equal(store.getSnapshot().messages.filter(value => value.client_id === keys[0]).length, 1);
});

test('pending sends cannot be duplicated and do not erase the next draft', async () => {
  const pending = deferred(); let count = 0;
  const { store } = setup({ send: async (applicationId, body, clientId) => {
    count++; await pending.promise; return { ...message(2, 'me', clientId), body };
  } });
  await store.start(); store.setDraft('First reply'); const sending = store.send();
  store.setDraft('Next draft'); await store.send();
  pending.resolve(); await sending;
  assert.equal(count, 1); assert.equal(store.getSnapshot().draft, 'Next draft');
});

test('polling reconciles a successful send whose HTTP response was lost', async () => {
  let sent;
  const { store } = setup({
    send: async (applicationId, body, clientId) => {
      sent = { ...message(2, 'me', clientId), body };
      throw new Error('Lost response');
    },
    history: async () => ({ messages: sent ? [message(1), sent] : [message(1)], has_more: false }),
  });
  await store.start(); store.setDraft('Do not duplicate'); await store.send(); await store.refresh();
  assert.equal(store.getSnapshot().outgoing.length, 0); assert.deepEqual(ids(store), ['message-1', 'message-2']);
});

test('refresh walks older pages until known history overlaps', async () => {
  const beforeCursors = [];
  let mode = 'start';
  const { store, calls } = setup({
    history: async (id, before) => {
      if (mode === 'start') return { messages: [message(1)], has_more: false };
      if (!before) return { messages: [message(4), message(5)], has_more: true };
      beforeCursors.push(before);
      if (before.id === 'message-4') return { messages: [message(2), message(3)], has_more: true };
      return { messages: [message(1), message(2)], has_more: false };
    },
  });
  await store.start();
  assert.deepEqual(calls.reads.map(value => value.messageId), ['message-1']);
  mode = 'refresh';
  await store.refresh();
  assert.deepEqual(beforeCursors.map(value => value.id), ['message-4', 'message-2']);
  assert.deepEqual(ids(store), ['message-1', 'message-2', 'message-3', 'message-4', 'message-5']);
  assert.deepEqual(calls.reads.map(value => value.messageId), ['message-1', 'message-5']);
});

test('older history stays ordered and deduplicated; failed pages can be retried', async () => {
  let failed = false;
  const { store } = setup({ history: async (id, before) => {
    if (!before) return { messages: [message(3), message(4)], has_more: true };
    if (!failed) { failed = true; throw new Error('Offline'); }
    assert.equal(before.id, 'message-3');
    return { messages: [message(1), message(2), message(3)], has_more: false };
  } });
  await store.start(); await store.loadOlder();
  assert.deepEqual(ids(store), ['message-3', 'message-4']); assert.equal(store.getSnapshot().hasOlder, true);
  await store.loadOlder(); assert.deepEqual(ids(store), ['message-1', 'message-2', 'message-3', 'message-4']);
  assert.equal(store.getSnapshot().hasOlder, false); assert.equal(store.getSnapshot().error, null);
});

test('hidden conversations do not mark messages read; read failures remain retryable', async () => {
  let visible = false, attempts = 0, changes = 0;
  const { store } = setup({ read: async () => { if (++attempts === 1) throw new Error('Offline'); } }, { visible: () => visible, onRead: () => changes++ });
  await store.start(); assert.equal(attempts, 0);
  visible = true; await store.markRead(); assert.equal(store.getSnapshot().readError, true);
  await store.markRead(); assert.equal(store.getSnapshot().readError, false); assert.equal(changes, 1);
  await store.markRead(); assert.equal(attempts, 2);
});

test('retrying an old send does not skip the gap before the loaded history window', async () => {
  const saved = storage();
  saved.setItem('hsf-message-draft:me:application-1', JSON.stringify({ draft: '', outgoing: [{ clientId: 'old-send', body: 'Old reply', state: 'failed' }] }));
  const beforeCursors = [];
  const { store } = setup({
    history: async (id, before) => {
      if (!before) return { messages: [message(5), message(6)], has_more: true };
      beforeCursors.push(before);
      return { messages: [message(3), message(4)], has_more: true };
    },
    send: async () => message(1, 'me', 'old-send'),
  }, { storage: saved });
  await store.start(); await store.retry('old-send'); await store.loadOlder();
  assert.deepEqual(beforeCursors.map(value => value.id), ['message-5']);
  assert.deepEqual(ids(store), ['message-1', 'message-3', 'message-4', 'message-5', 'message-6']);
});

test('refresh keeps already merged pages after an interruption', async () => {
  let interrupt = true;
  let mode = 'start';
  const beforeCursors = [];
  const { store } = setup({ history: async (id, before) => {
    if (mode === 'start') return { messages: [message(1)], has_more: false };
    if (!before) return { messages: [message(3)], has_more: true };
    beforeCursors.push(before.id);
    if (before.id === 'message-3') return { messages: [message(2)], has_more: true };
    if (interrupt) { interrupt = false; throw new Error('Network interrupted'); }
    return { messages: [message(1)], has_more: false };
  } });
  await store.start();
  mode = 'refresh';
  await store.refresh();
  assert.equal(store.getSnapshot().error, 'Network interrupted');
  assert.deepEqual(ids(store), ['message-1', 'message-2', 'message-3']);
  await store.refresh();
  assert.deepEqual(beforeCursors, ['message-3', 'message-2']);
  assert.deepEqual(ids(store), ['message-1', 'message-2', 'message-3']);
  assert.equal(store.getSnapshot().error, null);
});

test('drafts and failed sends survive remount and remain scoped to account and application', async () => {
  const saved = storage(); const failed = async () => { throw new Error('Offline'); };
  const first = setup({ send: failed }, { storage: saved });
  await first.store.start(); first.store.setDraft('Unsent reply'); await first.store.send(); first.store.setDraft('Next draft'); first.store.stop();
  const next = setup({}, { storage: saved }); await next.store.start();
  assert.equal(next.store.getSnapshot().draft, 'Next draft'); assert.equal(next.store.getSnapshot().outgoing[0].body, 'Unsent reply');
  for (const options of [{ user: 'someone-else' }, { application: 'application-2' }]) {
    const other = setup({}, { storage: saved, ...options }); await other.store.start();
    assert.equal(other.store.getSnapshot().draft, ''); assert.equal(other.store.getSnapshot().outgoing.length, 0);
  }
});

test('late sends after navigation cannot overwrite persisted drafts', async () => {
  const pending = deferred(); const saved = storage();
  const { store } = setup({ send: async () => pending.promise }, { storage: saved });
  await store.start(); store.setDraft('Pending'); const sending = store.send(); store.setDraft('Keep this'); store.stop();
  const snapshot = store.getSnapshot(); pending.resolve(message(2, 'me', 'outgoing-1')); await sending;
  assert.equal(store.getSnapshot(), snapshot);
  const next = setup({}, { storage: saved }); await next.store.start();
  assert.equal(next.store.getSnapshot().draft, 'Keep this'); assert.equal(next.store.getSnapshot().outgoing.length, 1);
});

test('obsolete initial loads cannot populate a restarted view', async () => {
  const pending = deferred(); let count = 0;
  const { store } = setup({ open: async () => ++count === 1 ? pending.promise : { ...conversation, participant_name: 'Current participant' } });
  const old = store.start(); store.stop(); await store.start(); pending.resolve({ ...conversation, participant_name: 'Obsolete' }); await old;
  assert.equal(store.getSnapshot().conversation.participant_name, 'Current participant');
});

test('rejected conversations retain history and drafts while blocking sends and retries', async () => {
  const { store, calls } = setup({ open: async () => ({ ...conversation, can_send: false, application_status: 'rejected' }) });
  await store.start(); store.setDraft('Keep for reference'); await store.refresh(); await store.send(); await store.retry('missing');
  assert.equal(calls.sends.length, 0); assert.equal(store.getSnapshot().draft, 'Keep for reference'); assert.deepEqual(ids(store), ['message-1']);
});

test('empty and oversized messages are blocked and unavailable storage does not break sending', async () => {
  const { store, calls } = setup({}, { storage: { getItem() { throw new Error('Blocked'); }, setItem() { throw new Error('Blocked'); }, removeItem() { throw new Error('Blocked'); } } });
  await store.start(); store.setDraft('  '); await store.send(); store.setDraft('x'.repeat(MESSAGE_LIMIT + 1)); await store.send();
  assert.equal(calls.sends.length, 0); store.setDraft('Valid'); await store.send(); assert.equal(calls.sends.length, 1);
});

test('initial failures provide an error and can be retried without discarding the draft', async () => {
  let count = 0;
  const { store } = setup({ open: async () => { if (++count === 1) throw new Error('Unavailable'); return conversation; } });
  store.setDraft('Saved'); await store.start(); assert.equal(store.getSnapshot().status, 'error');
  await store.start(); assert.equal(store.getSnapshot().status, 'ready'); assert.equal(store.getSnapshot().draft, 'Saved');
});

test('threads without a conversation row yet stay empty until the first send', async () => {
  const { store, calls } = setup({
    open: async () => ({ ...conversation, id: null, last_message: null, unread_count: 0 }),
    history: async () => { throw new Error('should not load history without a conversation id'); },
    send: async (applicationId, body, clientId) => {
      calls.sends.push({ applicationId, body, clientId });
      return { ...message(1, 'me', clientId), body };
    },
  });
  await store.start();
  assert.equal(store.getSnapshot().messages.length, 0);
  store.setDraft('First hello'); await store.send();
  assert.equal(store.getSnapshot().conversation.id, 'conversation-1');
  assert.deepEqual(ids(store), ['message-1']);
  assert.equal(calls.sends[0].applicationId, 'application-1');
});

test('ordering uses created_at then id', () => {
  const later = { ...message(1), id: 'message-b', created_at: '2026-11-05T12:00:01Z' };
  const earlier = { ...message(1), id: 'message-a', created_at: '2026-11-05T12:00:00Z' };
  const result = mergeMessages([later], [earlier, later]);
  assert.deepEqual(Array.from(result, value => value.id), ['message-a', 'message-b']);
});

test('production RPC adapter uses authenticated Supabase calls with the merged contract', async t => {
  const requests = []; let failure = null;
  const client = createClient('https://database.example.test', 'test-anon-key', {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: async (url, init) => {
      requests.push({ name: new URL(url).pathname.split('/').at(-1), args: JSON.parse(init.body) });
      const name = requests.at(-1).name;
      if (failure) return new Response(JSON.stringify(failure), { status: 400, headers: { 'Content-Type': 'application/json' } });
      if (name === 'list_conversations') {
        return new Response(JSON.stringify([{
          conversation_id: 'conversation-1', application_id: 'application-1', application_status: 'pending',
          project_id: 'project-1', project_title: 'Website', organization_name: 'Org', volunteer_id: 'vol',
          owner_id: 'owner', caller_role: 'volunteer', can_send: true, last_message_id: null,
          last_message_body: null, last_message_created_at: null, last_message_sender_id: null,
          last_read_message_id: null, last_read_at: null, unread_count: 0,
        }]), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      if (name === 'get_application_conversation') {
        return new Response(JSON.stringify([{
          conversation_id: 'conversation-1', application_id: 'app', application_status: 'pending',
          project_id: 'project-1', project_title: 'Website', organization_name: 'Org', volunteer_id: 'vol',
          owner_id: 'owner', caller_role: 'volunteer', can_send: true,
        }]), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      if (name === 'list_messages') {
        return new Response(JSON.stringify([{
          id: 'message-1', conversation_id: 'conv', sender_id: 'me', client_message_id: 'client-1',
          body: 'Hello', created_at: '2026-11-05T12:00:00Z',
        }]), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      if (name === 'send_application_message') {
        return new Response(JSON.stringify({
          id: 'message-2', conversation_id: 'conv', sender_id: 'me', client_message_id: 'same-key',
          body: 'Hello', created_at: '2026-11-05T12:00:01Z',
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    } },
  });
  t.after(() => client.auth.stopAutoRefresh());
  const { messagingAPI, messageLink } = loadModules(client);
  await messagingAPI.list(); await messagingAPI.open('app');
  await messagingAPI.history('conv', { created_at: '2026-11-05T12:00:00Z', id: 'message-1' });
  await messagingAPI.send('app', 'Hello', 'same-key'); await messagingAPI.read('conv', 'message-12');
  assert.deepEqual(requests, [
    { name: 'list_conversations', args: {} },
    { name: 'get_application_conversation', args: { p_application_id: 'app' } },
    {
      name: 'list_messages',
      args: {
        p_conversation_id: 'conv',
        p_before_created_at: '2026-11-05T12:00:00Z',
        p_before_id: 'message-1',
        p_page_size: MESSAGE_PAGE_SIZE,
      },
    },
    { name: 'send_application_message', args: { p_application_id: 'app', p_body: 'Hello', p_client_message_id: 'same-key' } },
    { name: 'mark_conversation_read', args: { p_conversation_id: 'conv', p_message_id: 'message-12' } },
  ]);
  failure = { code: 'PGRST202', message: 'function missing' }; await assert.rejects(messagingAPI.list(), /not available yet/);
  failure = { code: '42501', message: 'private detail' }; await assert.rejects(messagingAPI.open('foreign'), /unavailable for your account/);
  failure = { code: 'XX000', message: 'internal detail' }; await assert.rejects(messagingAPI.list(), /Couldn't complete/);
  assert.equal(messageLink('app&other=1'), '/messages?application=app%26other%3D1');
});
