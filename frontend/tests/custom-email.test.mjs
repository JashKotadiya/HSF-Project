import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadFunction, createBackend } from './helpers/edge-function.mjs';

const APP_ID = '11111111-1111-4111-8111-111111111111';
const PROJECT_ID = '22222222-2222-4222-8222-222222222222';
const OWNER_ID = '33333333-3333-4333-8333-333333333333';
const VOLUNTEER_ID = '44444444-4444-4444-8444-444444444444';
const OTHER_OWNER_ID = '66666666-6666-4666-8666-666666666666';
const OWNER_TOKEN = 'owner-session-token';
const OTHER_TOKEN = 'other-owner-session-token';
const ATTACKER = 'attacker@evil.example.test';
const OWNER_CONTACT = 'owner.contact@example.test';

const users = {
  [OWNER_ID]: 'owner@example.test',
  [VOLUNTEER_ID]: 'volunteer@example.test',
  [OTHER_OWNER_ID]: 'other-owner@example.test',
};
const sessions = {
  [OWNER_TOKEN]: { id: OWNER_ID, email: 'owner@example.test' },
  [OTHER_TOKEN]: { id: OTHER_OWNER_ID, email: 'other-owner@example.test' },
};
const project = { id: PROJECT_ID, title: 'Community website', user_id: OWNER_ID, organization_name: 'Helping Hands' };
const application = (overrides = {}) => ({
  id: APP_ID, project_id: PROJECT_ID, volunteer_id: VOLUNTEER_ID, status: 'pending',
  applicant_name: 'Real Volunteer', applicant_email: null, ...overrides,
});
const env = {
  SUPABASE_URL: 'https://database.example.test',
  SUPABASE_SERVICE_ROLE_KEY: 'test-service-key',
  RESEND_API_KEY: 'test-resend-key',
  FROM_EMAIL: 'HSF <noreply@example.test>',
};

function setup({ app = application(), profiles = [], backend: backendOptions = {}, extraEnv = {} } = {}) {
  const backend = createBackend({ tables: { applications: [app], posts: [project], profiles }, users, sessions, ...backendOptions });
  const handler = loadFunction('send-custom-email', { env: { ...env, ...extraEnv }, fetch: backend.fetch });
  return { backend, handler };
}
const send = (handler, body = { application_id: APP_ID, subject: 'A question', message: 'Do you have a portfolio?' }, { token = OWNER_TOKEN, method = 'POST' } = {}) =>
  handler(new Request('https://functions.example.test/send-custom-email', {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: method === 'POST' ? JSON.stringify(body) : undefined,
  }));
const sharing = (contact_email, share_contact) => [{ id: OWNER_ID, contact_email, share_contact }];

// ---- Who may send ------------------------------------------------------------

test('a request with no sign-in is rejected before anything is read or sent', async () => {
  const { backend, handler } = setup();
  const response = await send(handler, undefined, { token: null });
  assert.equal(response.status, 401);
  assert.equal(backend.requests.length, 0);
});

test('an invalid sign-in token is rejected', async () => {
  const { backend, handler } = setup();
  const response = await send(handler, undefined, { token: 'forged-token' });
  assert.equal(response.status, 401);
  assert.equal(backend.emails.length, 0);
});

test('a signed-in organization cannot email applicants to someone else\'s project', async () => {
  const { backend, handler } = setup();
  const response = await send(handler, undefined, { token: OTHER_TOKEN });
  assert.equal(response.status, 403);
  assert.equal(backend.emails.length, 0);
});

test('an unknown application is not found', async () => {
  const { backend, handler } = setup();
  const response = await send(handler, { application_id: '99999999-9999-4999-8999-999999999999', subject: 'Hi', message: 'Hello' });
  assert.equal(response.status, 404);
  assert.equal(backend.emails.length, 0);
});

test('browser preflight requests are answered', async () => {
  const { backend, handler } = setup();
  const response = await send(handler, undefined, { method: 'OPTIONS', token: null });
  assert.equal(response.status, 200);
  assert.ok(response.headers.get('Access-Control-Allow-Headers').includes('authorization'));
  assert.equal(backend.requests.length, 0);
});

for (const [name, body] of [
  ['no subject', { application_id: APP_ID, subject: '  ', message: 'Hello' }],
  ['no message', { application_id: APP_ID, subject: 'Hi', message: '' }],
  ['no application', { subject: 'Hi', message: 'Hello' }],
  ['an overlong subject', { application_id: APP_ID, subject: 'x'.repeat(151), message: 'Hello' }],
  ['an overlong message', { application_id: APP_ID, subject: 'Hi', message: 'x'.repeat(3001) }],
]) {
  test(`${name} is rejected`, async () => {
    const { backend, handler } = setup();
    assert.equal((await send(handler, body)).status, 400);
    assert.equal(backend.emails.length, 0);
  });
}

// ---- The organization's login email stays private ------------------------------

test('without a shared contact address the message has no reply address and never shows the login email', async () => {
  const { backend, handler } = setup();
  const response = await send(handler);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true, reply_enabled: false });
  const [email] = backend.emails;
  assert.equal(email.to, 'volunteer@example.test');
  assert.equal(email.reply_to, undefined);
  assert.ok(!JSON.stringify(email).includes('owner@example.test'));
  assert.ok(!email.html.includes('Reply to this email'));
  assert.ok(email.html.includes('Do you have a portfolio?'));
});

test('with a shared contact address, replies go to that address and not the login email', async () => {
  const { backend, handler } = setup({ profiles: sharing(OWNER_CONTACT, true) });
  const response = await send(handler);
  assert.deepEqual(await response.json(), { ok: true, reply_enabled: true });
  const [email] = backend.emails;
  assert.equal(email.reply_to, OWNER_CONTACT);
  assert.ok(email.html.includes(`Reply to this email to respond to ${OWNER_CONTACT}`));
  assert.ok(!JSON.stringify(email).includes('owner@example.test'));
});

test('an address with sharing turned off is not used', async () => {
  const { backend, handler } = setup({ profiles: sharing(OWNER_CONTACT, false) });
  assert.deepEqual(await (await send(handler)).json(), { ok: true, reply_enabled: false });
  assert.equal(backend.emails[0].reply_to, undefined);
  assert.ok(!JSON.stringify(backend.emails[0]).includes(OWNER_CONTACT));
});

test('sharing turned on with a blank address is not used, and the login email is not substituted', async () => {
  for (const blank of ['', '   ', null]) {
    const { backend, handler } = setup({ profiles: sharing(blank, true) });
    assert.deepEqual(await (await send(handler)).json(), { ok: true, reply_enabled: false });
    assert.equal(backend.emails[0].reply_to, undefined);
    assert.ok(!JSON.stringify(backend.emails[0]).includes('owner@example.test'));
  }
});

test('a changed address is used for the next message, and a cleared one is not', async () => {
  const changed = setup({ profiles: sharing('changed@example.test', true) });
  await send(changed.handler);
  assert.equal(changed.backend.emails[0].reply_to, 'changed@example.test');

  const cleared = setup({ profiles: sharing(null, false) });
  await send(cleared.handler);
  assert.equal(cleared.backend.emails[0].reply_to, undefined);
});

// ---- The applicant's address ---------------------------------------------------

test('the message is delivered to the applicant\'s account email, not to an address stored on the application', async () => {
  const { backend, handler } = setup({ app: application({ applicant_email: ATTACKER }) });
  await send(handler);
  assert.deepEqual(backend.emails.map(email => email.to), ['volunteer@example.test']);
  assert.ok(!JSON.stringify(backend.emails).includes(ATTACKER));
});

test('the applicant\'s address is never shown to the organization in the response', async () => {
  const { handler } = setup();
  const text = await (await send(handler)).text();
  assert.ok(!text.includes('volunteer@example.test'));
});

test('an applicant with no account email cannot be emailed', async () => {
  const { backend, handler } = setup({ app: application({ volunteer_id: '77777777-7777-4777-8777-777777777777' }) });
  assert.equal((await send(handler)).status, 400);
  assert.equal(backend.emails.length, 0);
});

// ---- Failures ------------------------------------------------------------------

test('an email provider failure reports a generic error', async () => {
  const { backend, handler } = setup({ backend: { emailFailures: [0] } });
  const response = await send(handler);
  assert.equal(response.status, 500);
  const text = await response.text();
  assert.ok(!text.includes('provider down'));
  assert.ok(!text.includes('test-resend-key'));
  assert.equal(backend.emails.length, 0);
});

test('a failed profile lookup sends nothing', async () => {
  const { backend, handler } = setup({ backend: { tableFailures: ['profiles'] } });
  assert.equal((await send(handler)).status, 500);
  assert.equal(backend.emails.length, 0);
});

test('an account lookup failure sends nothing', async () => {
  const { backend, handler } = setup({ backend: { authFailures: [VOLUNTEER_ID] } });
  assert.equal((await send(handler)).status, 500);
  assert.equal(backend.emails.length, 0);
});

test('test mode still redirects the message to the override address', async () => {
  const { backend, handler } = setup({ extraEnv: { TEST_EMAIL_OVERRIDE: 'tester@example.test' } });
  await send(handler);
  assert.equal(backend.emails[0].to, 'tester@example.test');
  assert.ok(backend.emails[0].html.includes('Test mode: intended for'));
});