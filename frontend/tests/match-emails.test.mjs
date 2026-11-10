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
  ...overrides,
});

const baseEnv = {
  SUPABASE_URL: 'https://database.example.test',
  SUPABASE_SERVICE_ROLE_KEY: 'test-service-key',
  RESEND_API_KEY: 'test-resend-key',
  FROM_EMAIL: 'HSF <noreply@example.test>',
  SITE_URL: 'https://hsf.example.test',
  MATCH_WEBHOOK_SECRET: SECRET,
};

function setup({ env = {}, app = application(), profiles = [], deliveries = [], backend: backendOptions = {} } = {}) {
  const backend = createBackend({
    tables: { applications: app ? [app] : [], posts: [project, otherProject], profiles, email_deliveries: deliveries },
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
// Delivery tracking: one row per email per application, with sent_at set once it has gone out.
const delivery = (backend, kind) => backend.rows('email_deliveries').find(row => row.application_id === APP_ID && row.kind === kind);
const sentKinds = backend => backend.rows('email_deliveries').filter(row => row.sent_at).map(row => row.kind).sort();
const noDeliveryRows = backend => assert.equal(backend.rows('email_deliveries').length, 0, 'no claim may be left behind');
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
  noDeliveryRows(backend);
  assert.equal(backend.rows('applications')[0].status, 'pending');
});

test('an approval that is reversed after the claim but before sending sends nothing and leaves no claim', async () => {
  // The application is approved when the function loads it, then rejected just as it claims the email.
  let reversed = false;
  const { backend, handler } = setup({
    app: application({ status: 'approved' }),
    backend: {
      beforeRequest: ({ method, url, rows }) => {
        if (method === 'POST' && url.pathname.endsWith('/email_deliveries') && !reversed) {
          reversed = true;
          rows.applications[0].status = 'rejected';
        }
      },
    },
  });
  await call(handler, event('UPDATE', application({ status: 'approved' }), application()));
  assert.ok(reversed);
  assert.equal(backend.emails.length, 0);
  noDeliveryRows(backend);
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
  assert.ok(delivery(backend, 'new_application_organization')?.sent_at);
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
  assert.deepEqual(sentKinds(backend), ['match_organization', 'match_volunteer']);
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

test('an email provider failure reports an error, and a retry sends only the email that did not go out', async () => {
  // The first email (to the volunteer) fails; the organization's email still goes out.
  const { backend, handler } = setup({ app: application({ status: 'approved' }), backend: { emailFailures: [0] } });
  const payload = event('UPDATE', application({ status: 'approved' }), application());
  assert.equal((await call(handler, payload)).status, 500);
  assert.deepEqual(recipients(backend), ['owner@example.test']);
  assert.deepEqual(sentKinds(backend), ['match_organization']);
  assert.equal(delivery(backend, 'match_volunteer'), undefined, 'the failed email keeps no claim');

  const retried = await call(handler, payload);
  assert.equal(retried.status, 200);
  assert.deepEqual(recipients(backend), ['owner@example.test', 'volunteer@example.test']);
  assert.deepEqual(sentKinds(backend), ['match_organization', 'match_volunteer']);
});

test('a failed new-application notification can be retried', async () => {
  const { backend, handler } = setup({ backend: { emailFailures: [0] } });
  assert.equal((await call(handler, event('INSERT', application()))).status, 500);
  noDeliveryRows(backend);
  assert.equal((await call(handler, event('INSERT', application()))).status, 200);
  assert.equal(backend.emails.length, 1);
  assert.deepEqual(sentKinds(backend), ['new_application_organization']);
});

test('delivery tracking never writes to the applications table, so it cannot echo back as new events', async () => {
  for (const emailFailures of [[], [0, 1]]) {
    const { backend, handler } = setup({ app: application({ status: 'approved' }), backend: { emailFailures } });
    await call(handler, event('UPDATE', application({ status: 'approved' }), application()));
    assert.deepEqual(backend.writes.filter(write => write.table === 'applications'), []);
  }
});

test('updates to an application that was already approved do not send approval emails again', async () => {
  const { backend, handler } = setup({ app: application({ status: 'approved' }) });
  const update = event('UPDATE', application({ status: 'approved', viewed_at: '2026-01-01T00:00:00Z' }), application({ status: 'approved' }));
  assert.equal((await call(handler, update)).status, 200);
  nothingHappened(backend);
});

test('an account lookup failure sends nothing, reports an error, and leaves no claim behind', async () => {
  const { backend, handler } = setup({ app: application({ status: 'approved' }), backend: { authFailures: [VOLUNTEER_ID] } });
  const response = await call(handler, event('UPDATE', application({ status: 'approved' }), application()));
  assert.equal(response.status, 500);
  assert.equal(backend.emails.length, 0);
  noDeliveryRows(backend);
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
const profile = (id, contact_email, share_contact_email) => ({ id, contact_email, share_contact_email });
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

test('a failed profile lookup sends nothing and leaves no claim, so a retry still works', async () => {
  const { backend, handler } = setup({ app: application({ status: 'approved' }), profiles: sharing(), backend: { tableFailures: ['profiles'] } });
  const response = await call(handler, event('UPDATE', application({ status: 'approved' }), application()));
  assert.equal(response.status, 500);
  assert.equal(backend.emails.length, 0);
  noDeliveryRows(backend);
});

test('a failed new-application notification, with sharing involved, is retried without repeating the one that went out', async () => {
  // The organization's email (first) fails; the volunteer's contact email (second) goes out.
  const { backend, handler } = setup({ profiles: sharing({ volunteer: true, owner: true }), backend: { emailFailures: [0] } });
  const insert = event('INSERT', application());
  assert.equal((await call(handler, insert)).status, 500);
  assert.deepEqual(recipients(backend), ['volunteer@example.test']);
  assert.equal((await call(handler, insert)).status, 200);
  assert.deepEqual(recipients(backend), ['owner@example.test', 'volunteer@example.test']);
});

test('repeating a new-application event does not repeat either notification', async () => {
  const { backend, handler } = setup({ profiles: sharing({ volunteer: true, owner: true }) });
  await call(handler, event('INSERT', application()));
  await call(handler, event('INSERT', application()));
  assert.equal(backend.emails.length, 2); // one to the owner, one to the volunteer
});



// ---- Delivery tracking (issue #72) ---------------------------------------------
// Every email is tracked on its own, so a failure, a retry or a repeated event can
// neither skip a notification nor send one twice.

const minutesAgo = minutes => new Date(Date.now() - minutes * 60 * 1000).toISOString();
const claim = (kind, { claimedMinutesAgo = 0, sent = false } = {}) => ({
  application_id: APP_ID, kind, claimed_at: minutesAgo(claimedMinutesAgo), sent_at: sent ? minutesAgo(claimedMinutesAgo) : null,
});
const approval = () => event('UPDATE', application({ status: 'approved' }), application());
const approvedSetup = (options = {}) => setup({ app: application({ status: 'approved' }), ...options });
const sentTo = (backend, address) => emailTo(backend, address).length;

test('a database error while claiming an email is reported as an error, never as "already sent"', async () => {
  for (const [name, options, payload] of [
    ['approval', { backend: { tableFailures: ['email_deliveries'] } }, approval()],
    ['new application', { app: application(), backend: { tableFailures: ['email_deliveries'] } }, event('INSERT', application())],
  ]) {
    const { backend, handler } = name === 'approval' ? approvedSetup(options) : setup(options);
    const response = await call(handler, payload);
    assert.equal(response.status, 500, name);
    assert.ok(!(await response.text()).includes('already'), name);
    assert.equal(backend.emails.length, 0, name);
  }
});

test('a database error while taking over a stale claim is also reported as an error', async () => {
  const { backend, handler } = approvedSetup({
    deliveries: [claim('match_volunteer', { claimedMinutesAgo: 30 }), claim('match_organization', { claimedMinutesAgo: 30 })],
    backend: { tableFailures: ['PATCH email_deliveries'] },
  });
  const response = await call(handler, approval());
  assert.equal(response.status, 500);
  assert.ok(!(await response.text()).includes('already'));
  assert.equal(backend.emails.length, 0);
});

test('when the volunteer email goes out and the organization email fails, a retry sends only the organization email', async () => {
  const failEmailsTo = new Set(['owner@example.test']);
  const { backend, handler } = approvedSetup({ backend: { failEmailsTo } });
  assert.equal((await call(handler, approval())).status, 500);
  assert.equal(sentTo(backend, 'volunteer@example.test'), 1);
  assert.deepEqual(sentKinds(backend), ['match_volunteer']);
  assert.equal(delivery(backend, 'match_organization'), undefined);

  failEmailsTo.delete('owner@example.test'); // delivery recovers
  assert.equal((await call(handler, approval())).status, 200);
  assert.equal(sentTo(backend, 'volunteer@example.test'), 1, 'the volunteer is not emailed again');
  assert.equal(sentTo(backend, 'owner@example.test'), 1);
  assert.deepEqual(sentKinds(backend), ['match_organization', 'match_volunteer']);
});

test('when the organization email goes out and the volunteer email fails, a retry sends only the volunteer email', async () => {
  const failEmailsTo = new Set(['volunteer@example.test']);
  const { backend, handler } = approvedSetup({ backend: { failEmailsTo } });
  assert.equal((await call(handler, approval())).status, 500);
  assert.equal(sentTo(backend, 'owner@example.test'), 1);
  failEmailsTo.clear();
  assert.equal((await call(handler, approval())).status, 200);
  assert.equal(sentTo(backend, 'owner@example.test'), 1, 'the organization is not emailed again');
  assert.equal(sentTo(backend, 'volunteer@example.test'), 1);
});

test('when both emails fail nothing is claimed, and a retry sends each one once', async () => {
  const failEmailsTo = new Set(LOGIN_ADDRESSES);
  const { backend, handler } = approvedSetup({ backend: { failEmailsTo } });
  assert.equal((await call(handler, approval())).status, 500);
  assert.equal(backend.emails.length, 0);
  noDeliveryRows(backend);
  failEmailsTo.clear();
  assert.equal((await call(handler, approval())).status, 200);
  assert.deepEqual(recipients(backend), LOGIN_ADDRESSES.slice().sort());
});

test('several failed retries still end with each email sent exactly once', async () => {
  const failEmailsTo = new Set(['owner@example.test']);
  const { backend, handler } = approvedSetup({ backend: { failEmailsTo } });
  for (let attempt = 0; attempt < 3; attempt++) assert.equal((await call(handler, approval())).status, 500);
  assert.equal(sentTo(backend, 'volunteer@example.test'), 1);
  failEmailsTo.clear();
  assert.equal((await call(handler, approval())).status, 200);
  assert.equal(sentTo(backend, 'volunteer@example.test'), 1);
  assert.equal(sentTo(backend, 'owner@example.test'), 1);
});

test('a new-application notification that half failed is retried without repeating the half that went out', async () => {
  const failEmailsTo = new Set(['volunteer@example.test']);
  const { backend, handler } = setup({ profiles: sharing({ volunteer: true, owner: true }), backend: { failEmailsTo } });
  const insert = event('INSERT', application());
  assert.equal((await call(handler, insert)).status, 500);
  assert.equal(sentTo(backend, 'owner@example.test'), 1);
  failEmailsTo.clear();
  assert.equal((await call(handler, insert)).status, 200);
  assert.equal(sentTo(backend, 'owner@example.test'), 1, 'the organization is not notified again');
  assert.equal(sentTo(backend, 'volunteer@example.test'), 1);
});

test('replaying events after everything was delivered sends nothing', async () => {
  const { backend, handler } = approvedSetup({ profiles: sharing({ volunteer: true, owner: true }) });
  await call(handler, event('INSERT', application()));
  await call(handler, approval());
  const total = backend.emails.length;
  assert.equal(total, 4); // two when applying, two when approved
  for (let replay = 0; replay < 3; replay++) {
    assert.equal((await call(handler, event('INSERT', application()))).status, 200);
    assert.equal((await call(handler, approval())).status, 200);
  }
  assert.equal(backend.emails.length, total);
});

test('the new-application and approval emails are tracked independently of each other', async () => {
  const { backend, handler } = approvedSetup();
  await call(handler, event('INSERT', application()));
  assert.deepEqual(sentKinds(backend), ['new_application_organization']);
  await call(handler, approval());
  assert.deepEqual(sentKinds(backend), ['match_organization', 'match_volunteer', 'new_application_organization']);
});

test('an email with nothing to send leaves no claim behind', async () => {
  const { backend, handler } = setup({ profiles: sharing({ volunteer: true, owner: false }) });
  await call(handler, event('INSERT', application()));
  assert.deepEqual(backend.rows('email_deliveries').map(row => row.kind), ['new_application_organization']);
});

test('simultaneous events send each email once, even when one of them is failing', async () => {
  const failEmailsTo = new Set(['owner@example.test']);
  const { backend, handler } = approvedSetup({ backend: { failEmailsTo } });
  await Promise.all([call(handler, approval()), call(handler, approval()), call(handler, approval())]);
  assert.equal(sentTo(backend, 'volunteer@example.test'), 1);
  failEmailsTo.clear();
  await Promise.all([call(handler, approval()), call(handler, approval())]);
  assert.equal(sentTo(backend, 'volunteer@example.test'), 1);
  assert.equal(sentTo(backend, 'owner@example.test'), 1);
});

test('deliveries recorded by the older single-flag tracking are not sent again', async () => {
  const { backend, handler } = approvedSetup({
    deliveries: [claim('match_volunteer', { claimedMinutesAgo: 600, sent: true }), claim('match_organization', { claimedMinutesAgo: 600, sent: true })],
  });
  assert.equal((await call(handler, approval())).status, 200);
  assert.equal(backend.emails.length, 0);
});

// A claim that was never completed (the function stopped mid-send) is not lost for good,
// but it is also not taken from a request that may still be sending.

test('a stale unfinished claim is taken over and delivered', async () => {
  const { backend, handler } = approvedSetup({ deliveries: [claim('match_volunteer', { claimedMinutesAgo: 30 })] });
  assert.equal((await call(handler, approval())).status, 200);
  assert.equal(sentTo(backend, 'volunteer@example.test'), 1);
  assert.deepEqual(sentKinds(backend), ['match_organization', 'match_volunteer']);
});

test('a recent claim is left alone, so an email that may be in flight is not sent twice', async () => {
  const { backend, handler } = approvedSetup({ deliveries: [claim('match_volunteer', { claimedMinutesAgo: 1 })] });
  assert.equal((await call(handler, approval())).status, 200);
  assert.equal(sentTo(backend, 'volunteer@example.test'), 0);
  assert.equal(sentTo(backend, 'owner@example.test'), 1);
  assert.equal(delivery(backend, 'match_volunteer').sent_at, null);
});

test('an old claim that was completed is never taken over', async () => {
  const { backend, handler } = approvedSetup({ deliveries: [claim('match_volunteer', { claimedMinutesAgo: 600, sent: true })] });
  await call(handler, approval());
  assert.equal(sentTo(backend, 'volunteer@example.test'), 0);
});

test('if giving up a claim fails after a failed send, the email is not repeated but becomes retryable once the claim expires', async () => {
  const failEmailsTo = new Set(['volunteer@example.test']);
  const { backend, handler } = approvedSetup({ backend: { failEmailsTo, tableFailures: ['DELETE email_deliveries'] } });
  assert.equal((await call(handler, approval())).status, 500);
  const stuck = delivery(backend, 'match_volunteer');
  assert.ok(stuck && stuck.sent_at === null, 'the unfinished claim is still recorded');

  failEmailsTo.clear();
  await call(handler, approval()); // too soon: the claim could still belong to a live request
  assert.equal(sentTo(backend, 'volunteer@example.test'), 0);

  stuck.claimed_at = minutesAgo(30); // the claim expires
  assert.equal((await call(handler, approval())).status, 200);
  assert.equal(sentTo(backend, 'volunteer@example.test'), 1);
});

test('if recording a sent email fails, the email is reported as an error but is never sent again', async () => {
  const { backend, handler } = approvedSetup({ backend: { tableFailures: ['PATCH email_deliveries'] } });
  assert.equal((await call(handler, approval())).status, 500);
  assert.deepEqual(recipients(backend), LOGIN_ADDRESSES.slice().sort());
  const before = backend.emails.length;
  await call(handler, approval());
  assert.equal(backend.emails.length, before, 'the unfinished claims are respected');
});

test('a failure of only the claim insert is still an error, not "already sent"', async () => {
  const { backend, handler } = approvedSetup({ backend: { tableFailures: ['POST email_deliveries'] } });
  const response = await call(handler, approval());
  assert.equal(response.status, 500);
  assert.ok(!(await response.text()).includes('already'));
  assert.equal(backend.emails.length, 0);
});