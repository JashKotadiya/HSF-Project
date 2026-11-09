import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadFunction, createBackend } from './helpers/edge-function.mjs';

const SECRET = 'test-webhook-secret-value';
const APP_ID = '11111111-1111-4111-8111-111111111111';
const PROJECT_ID = '22222222-2222-4222-8222-222222222222';
const OWNER_ID = '33333333-3333-4333-8333-333333333333';
const VOLUNTEER_ID = '44444444-4444-4444-8444-444444444444';
const OTHER_PROJECT_ID = '55555555-5555-4555-8555-555555555555';
const OTHER_OWNER_ID = '66666666-6666-4666-8666-666666666666';
const ATTACKER = 'attacker@evil.example.test';

const users = {
  [OWNER_ID]: 'owner@example.test',
  [VOLUNTEER_ID]: 'volunteer@example.test',
  [OTHER_OWNER_ID]: 'other-owner@example.test',
};
const project = { id: PROJECT_ID, title: 'Community website', user_id: OWNER_ID, organization_name: 'Helping Hands', poster_name: null };
const otherProject = { id: OTHER_PROJECT_ID, title: 'Unrelated project', user_id: OTHER_OWNER_ID, organization_name: 'Other Org', poster_name: null };
const application = (overrides = {}) => ({
  id: APP_ID, project_id: PROJECT_ID, volunteer_id: VOLUNTEER_ID, status: 'pending',
  applicant_name: 'Real Volunteer', applicant_email: 'volunteer@example.test',
  match_emailed_at: null, poster_notified_at: null, ...overrides,
});

const baseEnv = {
  SUPABASE_URL: 'https://database.example.test',
  SUPABASE_SERVICE_ROLE_KEY: 'test-service-key',
  RESEND_API_KEY: 'test-resend-key',
  FROM_EMAIL: 'HSF <noreply@example.test>',
  SITE_URL: 'https://hsf.example.test',
  MATCH_WEBHOOK_SECRET: SECRET,
};

function setup({ env = {}, app = application(), profiles = [], backend: backendOptions = {} } = {}) {
  const backend = createBackend({
    tables: { applications: app ? [app] : [], posts: [project, otherProject], profiles },
    users,
    ...backendOptions,
  });
  const handler = loadFunction('send-match-emails', { env: { ...baseEnv, ...env }, fetch: backend.fetch });
  return { backend, handler };
}

const event = (type, record, old_record = null) => ({ type, table: 'applications', schema: 'public', record, old_record });
const call = (handler, payload, { headers = { 'x-webhook-secret': SECRET }, method = 'POST', raw } = {}) =>
  handler(new Request('https://functions.example.test/send-match-emails', {
    method,
    headers: { 'Content-Type': 'application/json', ...headers },
    body: method === 'GET' ? undefined : raw ?? JSON.stringify(payload),
  }));
const recipients = backend => backend.emails.map(email => email.to).sort();
const nothingHappened = backend => {
  assert.equal(backend.emails.length, 0, 'no email may be sent');
  assert.equal(backend.writes.length, 0, 'nothing may be written');
};

// ---- Who may call the function --------------------------------------------

test('a caller without the webhook secret is rejected before the database or email provider is contacted', async () => {
  const { backend, handler } = setup({ app: application({ status: 'approved' }) });
  const response = await call(handler, event('UPDATE', application({ status: 'approved' }), application()), { headers: {} });
  assert.equal(response.status, 401);
  assert.equal(backend.requests.length, 0);
});

test('a signed-in user with a valid gateway token but no webhook secret is rejected', async () => {
  const { backend, handler } = setup({ app: application({ status: 'approved' }) });
  const response = await call(handler, event('UPDATE', application({ status: 'approved' }), application()), {
    headers: { Authorization: 'Bearer a-valid-user-jwt', apikey: 'anon-key' },
  });
  assert.equal(response.status, 401);
  assert.equal(backend.requests.length, 0);
});

for (const [name, secret] of [['a wrong secret', 'not-the-secret'], ['a prefix of the secret', SECRET.slice(0, 10)], ['the secret with extra characters', `${SECRET}x`], ['an empty secret', '']]) {
  test(`${name} is rejected`, async () => {
    const { backend, handler } = setup({ app: application({ status: 'approved' }) });
    const response = await call(handler, event('UPDATE', application({ status: 'approved' }), application()), { headers: { 'x-webhook-secret': secret } });
    assert.equal(response.status, 401);
    assert.equal(backend.requests.length, 0);
  });
}

test('the function refuses every request when no webhook secret is configured', async () => {
  const { backend, handler } = setup({ env: { MATCH_WEBHOOK_SECRET: undefined }, app: application({ status: 'approved' }) });
  for (const headers of [{}, { 'x-webhook-secret': '' }, { 'x-webhook-secret': 'undefined' }]) {
    const response = await call(handler, event('UPDATE', application({ status: 'approved' }), application()), { headers });
    assert.equal(response.status, 503);
  }
  assert.equal(backend.requests.length, 0);
});

test('only POST requests are accepted', async () => {
  const { backend, handler } = setup();
  const response = await call(handler, null, { method: 'GET' });
  assert.equal(response.status, 405);
  assert.equal(backend.requests.length, 0);
});

// ---- What an event must look like -----------------------------------------

test('a body that is not JSON is rejected', async () => {
  const { backend, handler } = setup();
  const response = await call(handler, null, { raw: '{not json' });
  assert.equal(response.status, 400);
  assert.equal(backend.requests.length, 0);
});

for (const [name, payload] of [
  ['an event for another table', { ...event('UPDATE', application()), table: 'posts' }],
  ['an event for another schema', { ...event('UPDATE', application()), schema: 'private' }],
  ['a DELETE event', event('DELETE', application())],
  ['an event with no record', event('UPDATE', null)],
  ['a record with no id', event('UPDATE', { status: 'approved' })],
  ['a record whose id is not a UUID', event('UPDATE', { id: "1' or '1'='1" })],
  ['a record whose id is not a string', event('UPDATE', { id: { eq: APP_ID } })],
]) {
  test(`${name} is rejected without touching the database`, async () => {
    const { backend, handler } = setup({ app: application({ status: 'approved' }) });
    const response = await call(handler, payload);
    assert.equal(response.status, 400);
    assert.equal(backend.requests.length, 0);
  });
}

// ---- Events must match what is actually stored -----------------------------

test('an INSERT event for an application that does not exist sends nothing', async () => {
  const { backend, handler } = setup({ app: null });
  const response = await call(handler, event('INSERT', application({ applicant_name: 'Invented Person', applicant_email: ATTACKER })));
  assert.equal(response.status, 404);
  nothingHappened(backend);
});

test('an UPDATE event claiming approval for a still-pending application sends nothing and records nothing', async () => {
  const { backend, handler } = setup({ app: application({ status: 'pending' }) });
  const forged = application({ status: 'approved', applicant_email: ATTACKER });
  await call(handler, event('UPDATE', forged, application({ status: 'pending' })));
  nothingHappened(backend);
  assert.equal(backend.rows('applications')[0].match_emailed_at, null);
  assert.equal(backend.rows('applications')[0].status, 'pending');
});

test('an approval that is reversed before the delivery claim sends nothing', async () => {
  // The application is approved when the function loads it, then rejected before it records delivery.
  let reversed = false;
  const { backend, handler } = setup({
    app: application({ status: 'approved' }),
    backend: {
      beforeRequest: ({ method, rows }) => {
        if (method === 'PATCH' && !reversed) {
          reversed = true;
          rows.applications[0].status = 'rejected';
        }
      },
    },
  });
  await call(handler, event('UPDATE', application({ status: 'approved' }), application()));
  assert.ok(reversed);
  assert.equal(backend.emails.length, 0);
  assert.equal(backend.rows('applications')[0].match_emailed_at, null);
});

test('a rejected application never produces approval emails', async () => {
  const { backend, handler } = setup({ app: application({ status: 'rejected' }) });
  await call(handler, event('UPDATE', application({ status: 'approved' }), application()));
  nothingHappened(backend);
});

test('forged recipient, volunteer, project and name fields on an approval are ignored', async () => {
  const { backend, handler } = setup({ app: application({ status: 'approved' }) });
  const forged = application({
    status: 'approved', applicant_email: ATTACKER, volunteer_id: OTHER_OWNER_ID,
    project_id: OTHER_PROJECT_ID, applicant_name: '<b>Forged Name</b>',
  });
  const response = await call(handler, event('UPDATE', forged, application()));
  assert.equal(response.status, 200);
  assert.deepEqual(recipients(backend), ['owner@example.test', 'volunteer@example.test']);
  const everything = JSON.stringify(backend.emails);
  assert.ok(!everything.includes(ATTACKER));
  assert.ok(!everything.includes('other-owner@example.test'));
  assert.ok(!everything.includes('Unrelated project'));
  assert.ok(!everything.includes('Forged Name'));
  assert.ok(everything.includes('Community website'));
  assert.ok(everything.includes('Real Volunteer'));
});

test('forged fields on a new-application event cannot redirect the notification or change its contents', async () => {
  const { backend, handler } = setup();
  const forged = application({ applicant_email: ATTACKER, project_id: OTHER_PROJECT_ID, applicant_name: 'Forged Name' });
  const response = await call(handler, event('INSERT', forged));
  assert.equal(response.status, 200);
  assert.deepEqual(recipients(backend), ['owner@example.test']);
  const everything = JSON.stringify(backend.emails);
  assert.ok(!everything.includes(ATTACKER));
  assert.ok(!everything.includes('Unrelated project'));
  assert.ok(!everything.includes('Forged Name'));
  assert.ok(everything.includes('Real Volunteer'));
  assert.ok(everything.includes('Community website'));
});

test('the volunteer address comes from the account record, not from applicant_email on the application', async () => {
  // applicant_email is typed in by the applicant, so even the stored value is not a trusted address.
  const stored = application({ status: 'approved', applicant_email: ATTACKER });
  const { backend, handler } = setup({ app: stored });
  await call(handler, event('UPDATE', stored, application()));
  assert.deepEqual(recipients(backend), ['owner@example.test', 'volunteer@example.test']);
  assert.ok(!JSON.stringify(backend.emails).includes(ATTACKER));
});

test('HTML in stored names and titles is escaped', async () => {
  const { backend, handler } = setup({ app: application({ applicant_name: '<script>alert(1)</script>' }) });
  await call(handler, event('INSERT', application()));
  const html = backend.emails[0].html;
  assert.ok(!html.includes('<script>'));
  assert.ok(html.includes('&lt;script&gt;'));
});

// ---- Legitimate events ------------------------------------------------------

test('a real new application notifies the project owner once, with a link to review it', async () => {
  const { backend, handler } = setup();
  const response = await call(handler, event('INSERT', application()));
  assert.equal(response.status, 200);
  assert.equal(backend.emails.length, 1);
  const [email] = backend.emails;
  assert.equal(email.to, 'owner@example.test');
  assert.equal(email.subject, 'New applicant for Community website');
    assert.equal(email.reply_to, undefined);
  assert.ok(!email.html.includes('volunteer@example.test'));
  assert.ok(email.html.includes("hasn't shared a contact email"));
  assert.ok(email.html.includes(`https://hsf.example.test/nonprofit/dashboard/applicants?project=${PROJECT_ID}`));
  assert.ok(backend.rows('applications')[0].poster_notified_at);
});

test('a real approval emails both parties and records that it was sent', async () => {
  const { backend, handler } = setup({ app: application({ status: 'approved' }) });
  const response = await call(handler, event('UPDATE', application({ status: 'approved' }), application()));
  assert.equal(response.status, 200);
  assert.deepEqual(recipients(backend), ['owner@example.test', 'volunteer@example.test']);
  const toVolunteer = backend.emails.find(email => email.to === 'volunteer@example.test');
  const toOwner = backend.emails.find(email => email.to === 'owner@example.test');
  assert.ok(!toVolunteer.html.includes('owner@example.test'));
  assert.ok(!toOwner.html.includes('volunteer@example.test'));
  assert.ok(toVolunteer.html.includes("hasn't shared a contact email"));
  assert.ok(toOwner.html.includes("hasn't shared a contact email"));
  assert.ok(backend.rows('applications')[0].match_emailed_at);
});

test('updates that are not approvals (such as a first view) send nothing', async () => {
  const { backend, handler } = setup({ app: application({ status: 'pending' }) });
  const response = await call(handler, event('UPDATE', application({ viewed_at: '2026-01-01T00:00:00Z' }), application()));
  assert.equal(response.status, 200);
  nothingHappened(backend);
});

test('test mode still redirects every email to the override address', async () => {
  const { backend, handler } = setup({ env: { TEST_EMAIL_OVERRIDE: 'tester@example.test' }, app: application({ status: 'approved' }) });
  await call(handler, event('UPDATE', application({ status: 'approved' }), application()));
  assert.deepEqual(recipients(backend), ['tester@example.test', 'tester@example.test']);
  assert.ok(backend.emails.every(email => email.html.includes('Test mode: intended for')));
});

// ---- Retries and duplicates -------------------------------------------------

test('delivering the same approval event twice sends one pair of emails', async () => {
  const { backend, handler } = setup({ app: application({ status: 'approved' }) });
  const payload = event('UPDATE', application({ status: 'approved' }), application());
  assert.equal((await call(handler, payload)).status, 200);
  assert.equal((await call(handler, payload)).status, 200);
  assert.equal(backend.emails.length, 2);
});

test('delivering the same new-application event twice notifies the owner once', async () => {
  const { backend, handler } = setup();
  await call(handler, event('INSERT', application()));
  await call(handler, event('INSERT', application()));
  assert.equal(backend.emails.length, 1);
});

test('simultaneous duplicate approval events still send only one pair of emails', async () => {
  const { backend, handler } = setup({ app: application({ status: 'approved' }) });
  const payload = event('UPDATE', application({ status: 'approved' }), application());
  await Promise.all([call(handler, payload), call(handler, payload), call(handler, payload)]);
  assert.equal(backend.emails.length, 2);
});

test('an email provider failure reports an error, releases the claim, and a retry then succeeds', async () => {
  const { backend, handler } = setup({ app: application({ status: 'approved' }), backend: { emailFailures: [0] } });
  const payload = event('UPDATE', application({ status: 'approved' }), application());
  const failed = await call(handler, payload);
  assert.equal(failed.status, 500);
  assert.equal(backend.emails.length, 0);
  assert.equal(backend.rows('applications')[0].match_emailed_at, null);

  const retried = await call(handler, payload);
  assert.equal(retried.status, 200);
  assert.equal(backend.emails.length, 2);
  assert.ok(backend.rows('applications')[0].match_emailed_at);
});

test('a failed new-application notification can be retried', async () => {
  const { backend, handler } = setup({ backend: { emailFailures: [0] } });
  assert.equal((await call(handler, event('INSERT', application()))).status, 500);
  assert.equal(backend.rows('applications')[0].poster_notified_at, null);
  assert.equal((await call(handler, event('INSERT', application()))).status, 200);
  assert.equal(backend.emails.length, 1);
});

// The function updates the application itself (to record delivery), and the database
// webhook reports those updates back to the function as new UPDATE events.
async function deliverOwnWrites(handler, events, rounds = 8) {
  for (let round = 0; round < rounds && events.length; round++) {
    for (const own of events.splice(0)) await call(handler, own);
  }
}

test('the function\'s own delivery bookkeeping does not set off another delivery after a failed send', async () => {
  const events = [];
  const { backend, handler } = setup({
    app: application({ status: 'approved' }),
    backend: {
      emailFailures: Array.from({ length: 50 }, (_, attempt) => attempt),
      onChange: ({ old, record }) => events.push(event('UPDATE', record, old)),
    },
  });
  const approval = event('UPDATE', application({ status: 'approved' }), application());
  assert.equal((await call(handler, approval)).status, 500);
  await deliverOwnWrites(handler, events);
  assert.equal(backend.emailAttempts(), 1, 'one failed attempt, not a loop of retries');
  assert.equal(backend.rows('applications')[0].match_emailed_at, null);
});

test('updates to an application that was already approved do not send approval emails again', async () => {
  const { backend, handler } = setup({ app: application({ status: 'approved' }) });
  const bookkeeping = event('UPDATE', application({ status: 'approved', poster_notified_at: '2026-01-01T00:00:00Z' }), application({ status: 'approved' }));
  assert.equal((await call(handler, bookkeeping)).status, 200);
  nothingHappened(backend);
});

test('an account lookup failure sends nothing, reports an error, and releases the claim', async () => {
  const { backend, handler } = setup({ app: application({ status: 'approved' }), backend: { authFailures: [VOLUNTEER_ID] } });
  const response = await call(handler, event('UPDATE', application({ status: 'approved' }), application()));
  assert.equal(response.status, 500);
  assert.equal(backend.emails.length, 0);
  assert.equal(backend.rows('applications')[0].match_emailed_at, null);
});

test('error responses do not reveal internal details', async () => {
  const { handler } = setup({ app: application({ status: 'approved' }), backend: { emailFailures: [0] } });
  const response = await call(handler, event('UPDATE', application({ status: 'approved' }), application()));
  const text = await response.text();
  assert.ok(!text.includes('provider down'));
  assert.ok(!text.includes('test-resend-key'));
  assert.ok(!text.includes('test-service-key'));
});


// ---- Optional contact sharing -------------------------------------------------
// Login emails are used only to deliver notifications. What a person chooses to share
// is a separate address, and nothing is passed on unless they turned sharing on.

const VOLUNTEER_CONTACT = 'volunteer.contact@example.test';
const OWNER_CONTACT = 'owner.contact@example.test';
const LOGIN_ADDRESSES = ['owner@example.test', 'volunteer@example.test'];
const profile = (id, contact_email, share_contact) => ({ id, contact_email, share_contact });
const sharing = ({ volunteer = false, owner = false } = {}) => [
  profile(VOLUNTEER_ID, VOLUNTEER_CONTACT, volunteer),
  profile(OWNER_ID, OWNER_CONTACT, owner),
];
const emailTo = (backend, address) => backend.emails.filter(email => email.to === address);
// Login addresses must never appear inside a message or as a reply address.
const leakedLogins = backend => backend.emails.flatMap(email =>
  LOGIN_ADDRESSES.filter(login => JSON.stringify({ html: email.html, reply_to: email.reply_to }).includes(login)));

const cases = [
  ['neither person shares', { volunteer: false, owner: false }],
  ['only the volunteer shares', { volunteer: true, owner: false }],
  ['only the organization shares', { volunteer: false, owner: true }],
  ['both people share', { volunteer: true, owner: true }],
];

for (const [name, choice] of cases) {
  test(`new application, pending: ${name}`, async () => {
    const { backend, handler } = setup({ profiles: sharing(choice) });
    assert.equal((await call(handler, event('INSERT', application()))).status, 200);

    // The owner is always told; the volunteer's address is included only if they chose to share it.
    const [toOwner, ...extra] = emailTo(backend, 'owner@example.test');
    assert.equal(extra.length, 0);
    assert.equal(toOwner.html.includes(VOLUNTEER_CONTACT), choice.volunteer);
    assert.equal(toOwner.reply_to, choice.volunteer ? VOLUNTEER_CONTACT : undefined);
    assert.equal(toOwner.html.includes("hasn't shared a contact email"), !choice.volunteer);

    // The volunteer hears from this function only when the organization shared an address.
    const toVolunteer = emailTo(backend, 'volunteer@example.test');
    assert.equal(toVolunteer.length, choice.owner ? 1 : 0);
    if (choice.owner) {
      assert.ok(toVolunteer[0].html.includes(OWNER_CONTACT));
      assert.equal(toVolunteer[0].reply_to, OWNER_CONTACT);
    }
    assert.deepEqual(leakedLogins(backend), []);
  });

  test(`approval: ${name}`, async () => {
    const { backend, handler } = setup({ app: application({ status: 'approved' }), profiles: sharing(choice) });
    assert.equal((await call(handler, event('UPDATE', application({ status: 'approved' }), application()))).status, 200);

    // Approving works and both people are notified whatever they chose to share.
    assert.deepEqual(recipients(backend), LOGIN_ADDRESSES.slice().sort());
    const toVolunteer = emailTo(backend, 'volunteer@example.test')[0];
    const toOwner = emailTo(backend, 'owner@example.test')[0];

    // Each message carries the other person's shared address only if they shared one.
    assert.equal(toVolunteer.html.includes(OWNER_CONTACT), choice.owner);
    assert.equal(toVolunteer.reply_to, choice.owner ? OWNER_CONTACT : undefined);
    assert.equal(toOwner.html.includes(VOLUNTEER_CONTACT), choice.volunteer);
    assert.equal(toOwner.reply_to, choice.volunteer ? VOLUNTEER_CONTACT : undefined);
    assert.deepEqual(leakedLogins(backend), []);
  });
}

test('sharing without a profile row means nothing is shared', async () => {
  const { backend, handler } = setup({ app: application({ status: 'approved' }), profiles: [] });
  await call(handler, event('UPDATE', application({ status: 'approved' }), application()));
  assert.equal(backend.emails.length, 2);
  assert.deepEqual(leakedLogins(backend), []);
  assert.ok(backend.emails.every(email => email.reply_to === undefined));
});

test('an address with sharing turned off stays hidden', async () => {
  const { backend, handler } = setup({ app: application({ status: 'approved' }), profiles: sharing({ volunteer: false, owner: false }) });
  await call(handler, event('UPDATE', application({ status: 'approved' }), application()));
  const everything = JSON.stringify(backend.emails);
  assert.ok(!everything.includes(VOLUNTEER_CONTACT));
  assert.ok(!everything.includes(OWNER_CONTACT));
});

test('sharing turned on with a blank address shares nothing, not the login email', async () => {
  const { backend, handler } = setup({
    app: application({ status: 'approved' }),
    profiles: [profile(VOLUNTEER_ID, '   ', true), profile(OWNER_ID, null, true)],
  });
  await call(handler, event('UPDATE', application({ status: 'approved' }), application()));
  assert.equal(backend.emails.length, 2);
  assert.deepEqual(leakedLogins(backend), []);
  assert.ok(backend.emails.every(email => email.reply_to === undefined));
});

test('a changed address is the one used, and a cleared address is no longer shared', async () => {
  // Shared when the person applied...
  const first = setup({ profiles: sharing({ volunteer: true }) });
  await call(first.handler, event('INSERT', application()));
  assert.ok(emailTo(first.backend, 'owner@example.test')[0].html.includes(VOLUNTEER_CONTACT));

  // ...then they change it before the approval...
  const changed = setup({ app: application({ status: 'approved' }), profiles: [profile(VOLUNTEER_ID, 'changed@example.test', true), profile(OWNER_ID, null, false)] });
  await call(changed.handler, event('UPDATE', application({ status: 'approved' }), application()));
  const toOwner = emailTo(changed.backend, 'owner@example.test')[0];
  assert.ok(toOwner.html.includes('changed@example.test'));
  assert.ok(!toOwner.html.includes(VOLUNTEER_CONTACT));

  // ...or clear it, and nothing is shared.
  const cleared = setup({ app: application({ status: 'approved' }), profiles: [profile(VOLUNTEER_ID, null, false), profile(OWNER_ID, null, false)] });
  await call(cleared.handler, event('UPDATE', application({ status: 'approved' }), application()));
  const clearedText = JSON.stringify(cleared.backend.emails);
  for (const gone of [VOLUNTEER_CONTACT, 'changed@example.test']) assert.ok(!clearedText.includes(gone), `${gone} must not be shared`);
  assert.deepEqual(leakedLogins(cleared.backend), []);
});

test('a shared address is only ever shown, never used as the place a notification is delivered', async () => {
  const { backend, handler } = setup({ app: application({ status: 'approved' }), profiles: sharing({ volunteer: true, owner: true }) });
  await call(handler, event('UPDATE', application({ status: 'approved' }), application()));
  assert.deepEqual(recipients(backend), LOGIN_ADDRESSES.slice().sort());
});

test('an applicant-supplied address on the application is neither delivered to nor shared', async () => {
  const stored = application({ status: 'approved', applicant_email: ATTACKER });
  const { backend, handler } = setup({ app: stored, profiles: sharing({ volunteer: true, owner: true }) });
  await call(handler, event('UPDATE', stored, application()));
  assert.ok(!JSON.stringify(backend.emails).includes(ATTACKER));
  assert.deepEqual(recipients(backend), LOGIN_ADDRESSES.slice().sort());
});

test('a failed profile lookup sends nothing and releases the claim, so a retry still works', async () => {
  const { backend, handler } = setup({ app: application({ status: 'approved' }), profiles: sharing(), backend: { tableFailures: ['profiles'] } });
  const response = await call(handler, event('UPDATE', application({ status: 'approved' }), application()));
  assert.equal(response.status, 500);
  assert.equal(backend.emails.length, 0);
  assert.equal(backend.rows('applications')[0].match_emailed_at, null);
});

test('a failed new-application notification still releases its claim when sharing is involved', async () => {
  const { backend, handler } = setup({ profiles: sharing({ volunteer: true, owner: true }), backend: { emailFailures: [0] } });
  assert.equal((await call(handler, event('INSERT', application()))).status, 500);
  assert.equal(backend.rows('applications')[0].poster_notified_at, null);
  assert.equal((await call(handler, event('INSERT', application()))).status, 200);
});

test('repeating a new-application event does not repeat either notification', async () => {
  const { backend, handler } = setup({ profiles: sharing({ volunteer: true, owner: true }) });
  await call(handler, event('INSERT', application()));
  await call(handler, event('INSERT', application()));
  assert.equal(backend.emails.length, 2); // one to the owner, one to the volunteer
});