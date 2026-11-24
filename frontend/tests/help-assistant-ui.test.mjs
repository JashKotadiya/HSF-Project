import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mount, json, deferred } from './helpers/components.mjs';

const FUNCTION_PATH = '/functions/v1/help-assistant';
const isHelpRequest = request => request.url.pathname === FUNCTION_PATH;
const helpRequests = ui => ui.requests.filter(isHelpRequest);

const volunteer = { user: { id: 'volunteer-1' }, role: 'volunteer', loading: false };
const nonprofit = { user: { id: 'org-1' }, role: 'nonprofit', loading: false };
const signedOut = { user: null, role: null, loading: false };

async function setup(t, { auth = volunteer, respond = () => json({ ok: true, supported: true, answer: 'Open Browse Projects.', links: [] }) } = {}) {
  const ui = mount(t, 'components/help/HelpAssistant.tsx', { auth, fetch: request => respond(request) });
  await ui.settle();
  return ui;
}

const questionField = ui => ui.find(node => node.type === 'textarea');
const links = ui => ui.all(node => node.type === 'Link').map(node => ({ href: node.props.href, label: ui.text(node).trim() }));
async function type(ui, value) {
  questionField(ui).props.onChange({ target: { value } });
  await ui.settle();
}
async function ask(ui, value) {
  await type(ui, value);
  await ui.click('Ask');
  await ui.settle();
}
const answer = (text, extra = {}) => json({ ok: true, supported: true, answer: text, links: [], ...extra });

// ---- What people see before asking ---------------------------------------------------------

test('the assistant is clearly labeled as an AI prototype and says what it cannot do', async t => {
  const ui = await setup(t);
  const text = ui.text();
  assert.ok(text.includes('AI help'));
  assert.ok(text.includes('Prototype'));
  assert.ok(text.includes('written by an AI'));
  assert.ok(text.includes('can be wrong'));
  assert.ok(text.includes('Gemini'), 'says where the question is sent');
  assert.ok(text.includes('personal information'));
  assert.ok(text.includes("can't send messages, apply to projects, approve applicants or change your account"));
});

test('direct messaging stays separate and reachable, for each kind of account', async t => {
  const forVolunteer = await setup(t);
  assert.ok(forVolunteer.text().includes('Need to reach a person?'));
  assert.ok(forVolunteer.text().includes('separate from your conversations'));
  assert.ok(links(forVolunteer).some(link => link.href === '/volunteer/projects'));

  const forOrganization = await setup(t, { auth: nonprofit });
  assert.ok(forOrganization.text().includes('Need to reach a person?'));
  assert.ok(links(forOrganization).some(link => link.href === '/nonprofit/dashboard/applicants'));
});

test('signed-out visitors are asked to sign in and cannot ask anything', async t => {
  const ui = await setup(t, { auth: signedOut });
  assert.equal(questionField(ui), undefined);
  assert.ok(ui.text().includes('Sign in'));
  assert.deepEqual(links(ui).map(link => link.href), ['/']);
  assert.equal(helpRequests(ui).length, 0);
});

test('nothing is shown to ask with while the sign-in is still being checked', async t => {
  const ui = await setup(t, { auth: { user: null, role: null, loading: true } });
  assert.equal(questionField(ui), undefined);
  assert.equal(helpRequests(ui).length, 0);
});

test('the question box is limited to 500 characters', async t => {
  const ui = await setup(t);
  assert.equal(questionField(ui).props.maxLength, 500);
});

test('Ask stays disabled until there is a question, and nothing is sent without one', async t => {
  const ui = await setup(t);
  assert.equal(ui.button('Ask').props.disabled, true);
  await type(ui, '    ');
  assert.equal(ui.button('Ask').props.disabled, true);
  await type(ui, 'How do I apply?');
  assert.equal(ui.button('Ask').props.disabled, false);
  assert.equal(helpRequests(ui).length, 0);
});

// ---- Asking ----------------------------------------------------------------------------------------

test('asking sends only the trimmed question and shows the answer with its related pages', async t => {
  const ui = await setup(t, {
    respond: () => answer('Open a project and choose Apply.', { links: [{ label: 'Apply to a project', path: '/projects' }] }),
  });
  await ask(ui, '  How do I apply to a project?  ');

  assert.equal(helpRequests(ui).length, 1);
  assert.deepEqual(helpRequests(ui)[0].body, { question: 'How do I apply to a project?' });
  assert.equal(ui.requests.length, 1, 'no other request is made');
  assert.ok(ui.text().includes('Open a project and choose Apply.'));
  assert.ok(ui.text().includes('Related pages'));
  assert.ok(links(ui).some(link => link.href === '/projects' && link.label === 'Apply to a project'));
});

test('while a question is being answered the button shows progress and a second press is ignored', async t => {
  const pending = deferred();
  const ui = await setup(t, { respond: () => pending.promise });
  await type(ui, 'How do I apply?');
  const firstPress = ui.button('Ask').props.onClick;
  const sending = firstPress();
  firstPress(); // pressed again before the page has updated
  await ui.settle();

  assert.ok(ui.button('Thinking…'));
  assert.equal(ui.button('Thinking…').props.disabled, true);
  assert.equal(helpRequests(ui).length, 1);

  pending.resolve(answer('Open Browse Projects.'));
  await sending;
  await ui.settle();
  assert.ok(ui.text().includes('Open Browse Projects.'));
  assert.ok(ui.button('Ask'));
});

test('a new question replaces the previous answer', async t => {
  let count = 0;
  const ui = await setup(t, { respond: () => answer(count++ === 0 ? 'First answer.' : 'Second answer.') });
  await ask(ui, 'First question?');
  assert.ok(ui.text().includes('First answer.'));
  await ask(ui, 'Second question?');
  assert.ok(ui.text().includes('Second answer.'));
  assert.ok(!ui.text().includes('First answer.'));
});

test('the answer is shown as plain text, never as markup', async t => {
  const ui = await setup(t, { respond: () => answer('Click <b>here</b> <img src=x onerror=alert(1)>') });
  await ask(ui, 'Anything?');
  assert.ok(ui.text().includes('<b>here</b>'));
  assert.equal(ui.find(node => node.type === 'b' || node.type === 'img'), undefined);
});

// ---- Pages offered as links ---------------------------------------------------------------------

test('only pages inside the app are ever shown as links', async t => {
  const ui = await setup(t, {
    respond: () => answer('Here you go.', {
      links: [
        { label: 'Good', path: '/projects' },
        { label: 'Good too', path: '/nonprofit/dashboard/applicants' },
        { label: 'Other site', path: 'https://evil.example/login' },
        { label: 'Same host trick', path: '//evil.example' },
        { label: 'Script', path: 'javascript:alert(1)' },
        { label: 'Odd characters', path: '/projects?next=https://evil.example' },
        { label: 'Not text', path: { href: '/x' } },
        { path: '/missing-label' },
      ],
    }),
  });
  await ask(ui, 'Where?');
  const shown = links(ui).map(link => link.href);
  assert.ok(shown.includes('/projects') && shown.includes('/nonprofit/dashboard/applicants'));
  for (const bad of ['https://evil.example/login', '//evil.example', 'javascript:alert(1)', '/projects?next=https://evil.example', '/missing-label']) {
    assert.ok(!shown.includes(bad), `${bad} must not be a link`);
  }
});

// ---- Questions it cannot answer and when it is unavailable ---------------------------------------------

test('an unsupported question shows the message and sends the volunteer to their own pages', async t => {
  const ui = await setup(t, { respond: () => json({ ok: true, supported: false, answer: "I can only answer questions about using Human Service Forum, and I couldn't find that in the help guide.", links: [] }) });
  await ask(ui, 'Approve my applicant for me');
  assert.ok(ui.text().includes('only answer questions about using Human Service Forum'));
  const shown = links(ui).map(link => link.href);
  for (const page of ['/projects', '/volunteer/projects', '/volunteer/profile']) assert.ok(shown.includes(page));
  assert.ok(!shown.some(href => href.startsWith('/nonprofit')), 'a volunteer is not sent to organization pages');
});

test('an unsupported question sends an organization to its own pages', async t => {
  const ui = await setup(t, { auth: nonprofit, respond: () => json({ ok: true, supported: false, answer: 'I can only answer questions about using Human Service Forum.', links: [] }) });
  await ask(ui, 'Something unrelated');
  const shown = links(ui).map(link => link.href);
  for (const page of ['/nonprofit/dashboard', '/nonprofit/dashboard/applicants', '/nonprofit/settings']) assert.ok(shown.includes(page));
  assert.ok(!shown.includes('/projects'), 'an organization is not sent to volunteer pages');
});

for (const [name, respond, expected] of [
  ['the assistant being unavailable', () => json({ error: "The help assistant isn't available right now. Please try again later.", code: 'unavailable' }, 503), "The help assistant isn't available right now. Please try again later."],
  ['the daily limit', () => json({ error: "You've reached today's limit for the help assistant. Please try again tomorrow.", code: 'limit' }, 429), "You've reached today's limit for the help assistant. Please try again tomorrow."],
  ['a sign-in problem', () => json({ error: 'Please sign in to use the help assistant.' }, 401), 'Please sign in to use the help assistant.'],
  ['an error with no readable message', () => new Response('Bad gateway', { status: 502 }), "The help assistant isn't available right now. Please try again later."],
  ['a reply with no answer', () => json({ ok: true }), "The help assistant isn't available right now. Please try again later."],
  ['a network failure', () => { throw new TypeError('Failed to fetch'); }, "The help assistant isn't available right now. Please try again later."],
]) {
  test(`${name} shows a clear message with pages to use instead, and the question can be asked again`, async t => {
    let failing = true;
    const ui = await setup(t, { respond: () => (failing ? respond() : answer('Open Browse Projects.')) });
    await ask(ui, 'How do I apply?');

    assert.ok(ui.text().includes(expected));
    assert.ok(ui.text().includes('Where to go next'));
    assert.ok(links(ui).some(link => link.href === '/projects'));
    assert.deepEqual(questionField(ui).props.value, 'How do I apply?', 'the question is kept');
    assert.equal(ui.button('Ask').props.disabled, false);

    failing = false;
    await ui.click('Ask');
    await ui.settle();
    assert.ok(ui.text().includes('Open Browse Projects.'));
    assert.ok(!ui.text().includes(expected), 'the old error is cleared');
  });
}

test('the page that hosts the assistant renders it', async t => {
  const ui = mount(t, 'app/help/page.tsx', {
    auth: volunteer,
    fetch: () => json({}),
  });
  await ui.settle();
  assert.ok(ui.text().includes('AI help'));
  assert.ok(questionField(ui));
});
