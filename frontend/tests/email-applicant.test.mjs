import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mount, json, deferred } from './helpers/components.mjs';

const FUNCTION_PATH = '/functions/v1/send-custom-email';
const isEmailRequest = request => request.url.pathname === FUNCTION_PATH;
const emails = ui => ui.requests.filter(isEmailRequest);

// The form on its own, with the Edge Function replaced by a mocked HTTP response.
async function setupForm(t, respond = () => json({ ok: true })) {
  const ui = mount(t, 'components/applications/EmailApplicantForm.tsx', {
    auth: { user: { id: 'org-1' }, role: 'nonprofit', loading: false },
    props: { applicationId: 'application-1' },
    fetch: request => respond(request),
  });
  await ui.settle();
  return ui;
}

const subjectField = ui => ui.find(node => node.type === 'input' && node.props.placeholder === 'Subject');
const messageField = ui => ui.find(node => node.type === 'textarea');

async function open(ui) {
  await ui.click('Email applicant');
  await ui.settle();
}
async function write(ui, subject, message) {
  subjectField(ui).props.onChange({ target: { value: subject } });
  messageField(ui).props.onChange({ target: { value: message } });
  await ui.settle();
}
const draft = ui => ({ subject: subjectField(ui).props.value, message: messageField(ui).props.value });

test('the form stays closed until the poster asks to email the applicant', async t => {
  const ui = await setupForm(t);
  assert.equal(subjectField(ui), undefined);
  assert.equal(messageField(ui), undefined);
  await open(ui);
  assert.ok(subjectField(ui));
  assert.ok(messageField(ui));
  assert.equal(emails(ui).length, 0);
});

test('sending posts the typed subject and message for this application, then clears the draft', async t => {
  const ui = await setupForm(t);
  await open(ui);
  await write(ui, 'Interview next week', 'Thanks for applying!\nCan you meet Tuesday?');
  await ui.click('Send');
  await ui.settle();

  assert.equal(emails(ui).length, 1);
  const [request] = emails(ui);
  assert.equal(request.method, 'POST');
  assert.deepEqual(request.body, {
    application_id: 'application-1',
    subject: 'Interview next week',
    message: 'Thanks for applying!\nCan you meet Tuesday?',
  });
  assert.ok(ui.text().includes('Email sent.'));
  assert.deepEqual(draft(ui), { subject: '', message: '' });
});

test('Send stays disabled until both a subject and a message are written', async t => {
  const ui = await setupForm(t);
  await open(ui);
  assert.equal(ui.button('Send').props.disabled, true);

  await write(ui, 'Hello', '');
  assert.equal(ui.button('Send').props.disabled, true);

  await write(ui, '', 'Hello there');
  assert.equal(ui.button('Send').props.disabled, true);

  await write(ui, '   ', '   ');
  assert.equal(ui.button('Send').props.disabled, true);

  await write(ui, 'Hello', 'Hello there');
  assert.equal(ui.button('Send').props.disabled, false);
  assert.equal(emails(ui).length, 0);
});

test('while a send is in flight the button is disabled and shows progress', async t => {
  const pending = deferred();
  const ui = await setupForm(t, () => pending.promise);
  await open(ui);
  await write(ui, 'Hello', 'Hello there');

  const sending = ui.click('Send');
  await ui.settle();
  assert.ok(ui.button('Sending…'));
  assert.equal(ui.button('Sending…').props.disabled, true);
  assert.ok(!ui.text().includes('Email sent.'));

  pending.resolve(json({ ok: true }));
  await sending;
  await ui.settle();
  assert.equal(emails(ui).length, 1);
  assert.ok(ui.text().includes('Email sent.'));
  assert.ok(ui.button('Send'));
});

for (const [name, response, expected] of [
  ['the poster does not own the project', json({ error: 'You can only email applicants to your own projects.' }, 403), 'You can only email applicants to your own projects.'],
  ['the function rejects the message', json({ error: 'That message is too long.' }, 400), 'That message is too long.'],
  ['the email provider fails', json({ error: "Couldn't send the email. Please try again." }, 500), "Couldn't send the email. Please try again."],
  ['the failure has no readable message', new Response('Bad gateway', { status: 502 }), "Couldn't send the email. Please try again."],
]) {
  test(`failed send (${name}) shows the error, reports no success, and allows a retry`, async t => {
    let failing = true;
    const ui = await setupForm(t, () => failing ? response : json({ ok: true }));
    await open(ui);
    await write(ui, 'Hello', 'Hello there');
    await ui.click('Send');
    await ui.settle();

    assert.ok(ui.text().includes(expected));
    assert.ok(!ui.text().includes('Email sent.'));
    assert.equal(ui.button('Send').props.disabled, false);

    failing = false;
    await ui.click('Send');
    await ui.settle();
    assert.equal(emails(ui).length, 2);
    assert.ok(ui.text().includes('Email sent.'));
    assert.ok(!ui.text().includes(expected));
  });
}

test('a network failure shows the generic error and keeps the draft', async t => {
  let failing = true;
  const ui = await setupForm(t, () => {
    if (failing) throw new TypeError('Failed to fetch');
    return json({ ok: true });
  });
  await open(ui);
  await write(ui, 'Hello', 'Hello there');
  await ui.click('Send');
  await ui.settle();

  assert.ok(ui.text().includes("Couldn't send the email. Please try again."));
  assert.ok(!ui.text().includes('Email sent.'));
  assert.deepEqual(draft(ui), { subject: 'Hello', message: 'Hello there' });

  failing = false;
  await ui.click('Send');
  await ui.settle();
  assert.ok(ui.text().includes('Email sent.'));
});

test('a failed send keeps the subject and message so nothing has to be retyped', async t => {
  const ui = await setupForm(t, () => json({ error: 'Please sign in again.' }, 401));
  await open(ui);
  await write(ui, 'Interview next week', 'Can you meet Tuesday?');
  await ui.click('Send');
  await ui.settle();

  assert.ok(ui.text().includes('Please sign in again.'));
  assert.deepEqual(draft(ui), { subject: 'Interview next week', message: 'Can you meet Tuesday?' });
  assert.equal(emails(ui).length, 1);
});

test('closing and reopening the form keeps an unsent draft', async t => {
  const ui = await setupForm(t);
  await open(ui);
  await write(ui, 'Draft subject', 'Draft message');

  await ui.click('Close');
  await ui.settle();
  assert.equal(subjectField(ui), undefined);

  await open(ui);
  assert.deepEqual(draft(ui), { subject: 'Draft subject', message: 'Draft message' });
  assert.equal(emails(ui).length, 0);
});

test('an error from a failed send is cleared by the next successful send', async t => {
  let failing = true;
  const ui = await setupForm(t, () => failing ? json({ error: 'Application not found.' }, 404) : json({ ok: true }));
  await open(ui);
  await write(ui, 'Hello', 'Hello there');
  await ui.click('Send');
  await ui.settle();
  assert.ok(ui.text().includes('Application not found.'));

  failing = false;
  await ui.click('Send');
  await ui.settle();
  assert.ok(!ui.text().includes('Application not found.'));
  assert.ok(ui.text().includes('Email sent.'));
  assert.deepEqual(draft(ui), { subject: '', message: '' });
});

test('after a send the poster is told when the applicant cannot reply by email', async t => {
  const ui = await setupForm(t, () => json({ ok: true, reply_enabled: false }));
  await open(ui);
  await write(ui, 'Hello', 'Hello there');
  await ui.click('Send');
  await ui.settle();
  assert.ok(ui.text().includes('Email sent.'));
  assert.ok(ui.text().includes("can't reply by email"));
  assert.ok(ui.text().includes('Contact sharing'));
});

test('no reply warning is shown when a contact email is shared', async t => {
  const ui = await setupForm(t, () => json({ ok: true, reply_enabled: true }));
  await open(ui);
  await write(ui, 'Hello', 'Hello there');
  await ui.click('Send');
  await ui.settle();
  assert.ok(ui.text().includes('Email sent.'));
  assert.ok(!ui.text().includes("can't reply by email"));
});

test('an older function response with no reply information shows no warning', async t => {
  const ui = await setupForm(t, () => json({ ok: true }));
  await open(ui);
  await write(ui, 'Hello', 'Hello there');
  await ui.click('Send');
  await ui.settle();
  assert.ok(!ui.text().includes("can't reply by email"));
});


// The form as the applicant page renders it, next to the decision buttons.
const application = { id: 'application-1', project_id: 'project-1', volunteer_id: 'volunteer-1', status: 'pending', applicant_name: 'Review Volunteer', created_at: '2026-01-01T00:00:00Z' };
async function setupPage(t, respondToEmail = () => json({ ok: true })) {
  const ui = mount(t, 'app/nonprofit/dashboard/applicants/page.tsx', {
    auth: { user: { id: 'org-1' }, role: 'nonprofit', loading: false },
    fetch: request => {
      if (isEmailRequest(request)) return respondToEmail(request);
      if (request.url.pathname.endsWith('/posts')) return json([{ id: 'project-1', title: 'Community website' }]);
      if (request.method === 'GET') return json([application]);
      if (request.body.viewed_at) return json(null);
      return json({ id: application.id, status: request.body.status });
    },
  });
  await ui.settle();
  ui.find(node => node.type === 'button' && ui.text(node).includes('Review Volunteer')).props.onClick();
  await ui.settle();
  return ui;
}
const decisions = ui => ui.requests.filter(request => request.method === 'PATCH' && request.body.status);

test('the applicant page offers the email form for the selected applicant', async t => {
  const ui = await setupPage(t);
  assert.ok(ui.button('Email applicant'));
  assert.ok(ui.button('Approve'));
  assert.ok(ui.button('Reject'));
});

test('emailing the selected applicant sends that application and leaves the decision untouched', async t => {
  const ui = await setupPage(t);
  await open(ui);
  await write(ui, 'A question', 'Do you have a portfolio?');
  await ui.click('Send');
  await ui.settle();

  assert.equal(emails(ui).length, 1);
  assert.equal(emails(ui)[0].body.application_id, 'application-1');
  assert.equal(decisions(ui).length, 0);
  assert.ok(ui.text().includes('Under review'));
  assert.ok(!ui.text().includes('Decision saved'));
  assert.equal(ui.confirmations.length, 0);
});

test('a failed email does not block approving the applicant', async t => {
  const ui = await setupPage(t, () => json({ error: "Couldn't send the email. Please try again." }, 500));
  await open(ui);
  await write(ui, 'A question', 'Do you have a portfolio?');
  await ui.click('Send');
  await ui.settle();
  assert.ok(ui.text().includes("Couldn't send the email. Please try again."));

  await ui.click('Approve');
  await ui.settle();
  assert.equal(decisions(ui).length, 1);
  assert.ok(ui.text().includes('Decision saved for Review Volunteer: Approved.'));
});