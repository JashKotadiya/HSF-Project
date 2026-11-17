import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { createClient } from '@supabase/supabase-js';

function setup(t, response, context) {
  const requests = [], opened = [];
  const client = createClient('https://database.example.test', 'test-key', {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: async input => {
      const url = new URL(input); requests.push(url);
      return new Response(JSON.stringify(response.body), { status: response.status ?? 200, headers: { 'Content-Type': 'application/json' } });
    } },
  });
  t.after(() => client.auth.stopAutoRefresh());
  const exports = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(new URL('../src/lib/messageRecipients.ts', import.meta.url), 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText, {
    exports, Error, require(id) {
      if (id === '@/lib/supabase') return { __esModule: true, default: client };
      if (id === '@/lib/messaging') return { messagingAPI: { open: async id => { opened.push(id); if (context instanceof Error) throw context; return context; } } };
      throw new Error(id);
    },
  });
  return { ...exports, requests, opened };
}
const application = { id: 'application-1', applicant_name: 'Morgan', status: 'pending', posts: { title: 'Community website', organization_name: 'Community Center', user_id: 'owner' } };

test('volunteer picker scopes applications to the account without hiding closed projects', async t => {
  const api = setup(t, { body: [application] });
  const rows = await api.listMessageRecipients('volunteer', 'volunteer');
  const query = api.requests[0].searchParams;
  assert.equal(query.get('volunteer_id'), 'eq.volunteer');
  assert.equal(query.get('status'), 'in.(pending,approved)');
  assert.equal(query.get('limit'), '30'); assert.equal(query.get('offset'), '0');
  assert.ok(!query.get('select').includes('!inner')); assert.ok(!query.get('select').includes('email'));
  assert.equal(rows[0].name, 'Community Center'); assert.equal(rows[0].id, 'application-1');
});
test('organization picker filters by project ownership and paginates deterministically', async t => {
  const api = setup(t, { body: [application] });
  const rows = await api.listMessageRecipients('owner', 'nonprofit', 30);
  const query = api.requests[0].searchParams;
  assert.equal(query.get('posts.user_id'), 'eq.owner'); assert.ok(query.get('select').includes('posts!inner'));
  assert.equal(query.get('offset'), '30'); assert.equal(query.get('order'), 'created_at.desc,id.desc');
  assert.equal(rows[0].name, 'Morgan');
});
test('closed project context comes from the participant-authorized messaging RPC', async t => {
  const api = setup(t, { body: [{ ...application, posts: null }] }, { participant_name: 'Closed project organization', project_title: 'Closed opportunity', application_status: 'approved' });
  const rows = await api.listMessageRecipients('volunteer', 'volunteer');
  assert.deepEqual(api.opened, ['application-1']); assert.equal(rows[0].project, 'Closed opportunity'); assert.equal(rows[0].status, 'approved');
});
test('failed application queries expose a retryable error rather than an empty picker', async t => {
  const api = setup(t, { status: 403, body: { message: 'private SQL details' } });
  await assert.rejects(api.listMessageRecipients('volunteer', 'volunteer'), /Couldn't load available applications/);
});
test('empty candidate lists work and a revoked conversation cannot be synthesized', async t => {
  const empty = setup(t, { body: [] });
  assert.equal((await empty.listMessageRecipients('volunteer', 'volunteer')).length, 0);
  const revoked = setup(t, { body: [{ ...application, posts: null }] }, new Error('Conversation unavailable'));
  await assert.rejects(revoked.listMessageRecipients('volunteer', 'volunteer'), /Conversation unavailable/);
});
