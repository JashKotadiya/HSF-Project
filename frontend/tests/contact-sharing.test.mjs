import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mount, json, deferred } from './helpers/components.mjs';

const LOGIN_EMAIL = 'login.private@example.test';
const volunteerAuth = { user: { id: 'volunteer-1', email: LOGIN_EMAIL }, role: 'volunteer', loading: false };
const nonprofitAuth = { user: { id: 'org-1', email: LOGIN_EMAIL }, role: 'nonprofit', loading: false };

const emailField = ui => ui.find(node => node.type === 'input' && node.props.type === 'email');
const shareBox = ui => ui.find(node => node.type === 'input' && node.props.type === 'checkbox');
const profileWrites = ui => ui.requests.filter(request => request.method === 'PATCH' && request.url.pathname.endsWith('/profiles'));
const rpcCalls = ui => ui.requests.filter(request => request.url.pathname.endsWith('/rpc/get_shared_contact'));

// ---- The contact sharing settings ----------------------------------------------

// `stored` is what the database holds; PATCH answers like the database does after its own tidy-up.
async function settings(t, { stored = { contact_email: null, share_contact: false }, auth = volunteerAuth, failLoad = false, failSave = null } = {}) {
  let current = { ...stored };
  const ui = mount(t, 'components/profile/ContactSharingForm.tsx', {
    auth,
    fetch: request => {
      if (!request.url.pathname.endsWith('/profiles')) throw new Error(`Unexpected request: ${request.url}`);
      if (request.method === 'GET') return failLoad ? json({ message: 'unavailable' }, 500) : json(current ? [current] : []);
      const failure = failSave?.();
      if (failure) return failure;
      const email = request.body.contact_email?.trim().toLowerCase() || null;
      current = { contact_email: email, share_contact: email !== null && request.body.share_contact };
      return json(current);
    },
  });
  await ui.settle();
  return ui;
}
const type = async (ui, value) => { emailField(ui).props.onChange({ target: { value } }); await ui.settle(); };
const toggle = async (ui, checked) => { shareBox(ui).props.onChange({ target: { checked } }); await ui.settle(); };

test('the settings show what is saved, and the login email is never displayed', async t => {
  const ui = await settings(t, { stored: { contact_email: 'contact@example.test', share_contact: true } });
  assert.equal(emailField(ui).props.value, 'contact@example.test');
  assert.equal(shareBox(ui).props.checked, true);
  assert.ok(!ui.text().includes(LOGIN_EMAIL));
  assert.ok(ui.text().includes('stays private'));
});

test('a new account starts with no address and nothing shared', async t => {
  const ui = await settings(t);
  assert.equal(emailField(ui).props.value, '');
  assert.equal(shareBox(ui).props.checked, false);
  assert.equal(shareBox(ui).props.disabled, true);
});

test('an account with no profile row yet is treated as sharing nothing', async t => {
  const ui = await settings(t, { stored: null });
  assert.equal(emailField(ui).props.value, '');
  assert.equal(shareBox(ui).props.checked, false);
});

test('the wording follows the role', async t => {
  assert.ok((await settings(t, { auth: volunteerAuth })).text().includes('organizations you apply to'));
  assert.ok((await settings(t, { auth: nonprofitAuth })).text().includes('volunteers who apply to your projects'));
});

test('a failed load shows an error instead of an empty form', async t => {
  const ui = await settings(t, { failLoad: true });
  assert.ok(ui.find(node => node.props.role === 'alert'));
  assert.equal(emailField(ui), undefined);
});

test('saving sends a tidied address and the sharing choice for this account only', async t => {
  const ui = await settings(t);
  await type(ui, '  Contact@Example.TEST ');
  await toggle(ui, true);
  await ui.click('Save');
  await ui.settle();

  const [write] = profileWrites(ui);
  assert.equal(profileWrites(ui).length, 1);
  assert.deepEqual(write.body, { contact_email: 'contact@example.test', share_contact: true });
  assert.equal(write.url.searchParams.get('id'), 'eq.volunteer-1');
  assert.ok(ui.text().includes('Your contact email is shared.'));
  assert.equal(emailField(ui).props.value, 'contact@example.test');
});

test('sharing can be switched on only once there is an address', async t => {
  const ui = await settings(t);
  assert.equal(shareBox(ui).props.disabled, true);
  await type(ui, 'contact@example.test');
  assert.equal(shareBox(ui).props.disabled, false);
});

test('stopping sharing keeps the address but shares nothing', async t => {
  const ui = await settings(t, { stored: { contact_email: 'contact@example.test', share_contact: true } });
  await toggle(ui, false);
  await ui.click('Save');
  await ui.settle();
  assert.deepEqual(profileWrites(ui)[0].body, { contact_email: 'contact@example.test', share_contact: false });
  assert.ok(ui.text().includes('Nothing is shared.'));
  assert.equal(emailField(ui).props.value, 'contact@example.test');
});

test('clearing the address removes it and cannot leave sharing on', async t => {
  const ui = await settings(t, { stored: { contact_email: 'contact@example.test', share_contact: true } });
  await type(ui, '   ');
  assert.equal(shareBox(ui).props.disabled, true);
  await ui.click('Save');
  await ui.settle();
  assert.deepEqual(profileWrites(ui)[0].body, { contact_email: null, share_contact: false });
  assert.equal(emailField(ui).props.value, '');
  assert.ok(ui.text().includes('Nothing is shared.'));
});

test('an address that is not an email is rejected before anything is sent', async t => {
  const ui = await settings(t);
  for (const bad of ['not-an-email', 'a@b', 'two words@example.test']) {
    await type(ui, bad);
    await ui.click('Save');
    await ui.settle();
    assert.ok(ui.text().includes('Enter a valid email address'), bad);
  }
  assert.equal(profileWrites(ui).length, 0);
});

test('a failed save shows an error, keeps what was typed, and can be retried', async t => {
  let failing = true;
  const ui = await settings(t, { failSave: () => (failing ? json({ message: 'down' }, 500) : null) });
  await type(ui, 'contact@example.test');
  await toggle(ui, true);
  await ui.click('Save');
  await ui.settle();
  assert.ok(ui.find(node => node.props.role === 'alert'));
  assert.ok(!ui.text().includes('Saved.'));
  assert.equal(emailField(ui).props.value, 'contact@example.test');
  assert.equal(shareBox(ui).props.checked, true);

  failing = false;
  await ui.click('Save');
  await ui.settle();
  assert.ok(ui.text().includes('Saved.'));
  assert.ok(!ui.find(node => node.props.role === 'alert'));
});

test('saving is blocked while a save is in flight', async t => {
  const pending = deferred();
  const ui = await settings(t, { failSave: () => pending.promise });
  await type(ui, 'contact@example.test');
  const saving = ui.click('Save');
  await ui.settle();
  assert.equal(ui.button('Saving…').props.disabled, true);
  pending.resolve(json({ contact_email: 'contact@example.test', share_contact: false }));
  await saving;
  await ui.settle();
  assert.ok(ui.text().includes('Saved.'));
});

// ---- Showing a shared contact ---------------------------------------------------

async function sharedContact(t, respond) {
  const ui = mount(t, 'components/applications/SharedContact.tsx', {
    auth: nonprofitAuth,
    props: { applicationId: 'application-1', label: 'Contact' },
    fetch: request => respond(request),
  });
  await ui.settle();
  return ui;
}

test('a shared contact address is shown as a mail link', async t => {
  const ui = await sharedContact(t, () => json('shared@example.test'));
  assert.equal(rpcCalls(ui).length, 1);
  assert.deepEqual(rpcCalls(ui)[0].body, { p_application_id: 'application-1' });
  assert.ok(ui.text().includes('shared@example.test'));
  assert.equal(ui.find(node => node.type === 'a').props.href, 'mailto:shared@example.test');
});

for (const [name, answer] of [['nothing shared (null)', json(null)], ['an empty answer', json('')], ['a blank answer', json('   ')], ['an unexpected answer', json({ unexpected: true })]]) {
  test(`${name} shows that no contact email is shared`, async t => {
    const ui = await sharedContact(t, () => answer);
    assert.ok(ui.text().includes('no contact email shared'));
    assert.equal(ui.find(node => node.type === 'a'), undefined);
  });
}

test('a failed lookup says so without showing an address', async t => {
  const ui = await sharedContact(t, () => json({ message: 'denied' }, 403));
  assert.ok(ui.text().includes("Couldn't check for a shared contact email"));
  assert.equal(ui.find(node => node.type === 'a'), undefined);
});

test('nothing is shown while the lookup is pending', async t => {
  const pending = deferred();
  const ui = await sharedContact(t, () => pending.promise);
  assert.equal(ui.text().trim(), '');
  pending.resolve(json('shared@example.test'));
  await ui.settle();
  assert.ok(ui.text().includes('shared@example.test'));
});

// ---- The Applicants page ---------------------------------------------------------

const application = {
  id: 'application-1', project_id: 'project-1', volunteer_id: 'volunteer-1', status: 'pending',
  applicant_name: 'Review Volunteer', applicant_email: 'legacy.login@example.test', created_at: '2026-01-01T00:00:00Z',
};
async function applicantsPage(t, { shared = null, app = application } = {}) {
  const ui = mount(t, 'app/nonprofit/dashboard/applicants/page.tsx', {
    auth: nonprofitAuth,
    fetch: request => {
      if (request.url.pathname.endsWith('/rpc/get_shared_contact')) return json(shared);
      if (request.url.pathname.endsWith('/posts')) return json([{ id: 'project-1', title: 'Community website' }]);
      if (request.method === 'GET') return json([app]);
      if (request.body.viewed_at) return json(null);
      return json({ id: app.id, status: request.body.status });
    },
  });
  await ui.settle();
  return ui;
}
const select = async ui => {
  ui.find(node => node.type === 'button' && ui.text(node).includes('Review Volunteer')).props.onClick();
  await ui.settle();
};

test('an applicant\'s stored login email is never displayed, even if an old row still has one', async t => {
  const ui = await applicantsPage(t, { shared: null });
  await select(ui);
  assert.ok(ui.text().includes('Review Volunteer'));
  assert.ok(!ui.text().includes('legacy.login@example.test'));
  assert.equal(ui.all(node => node.type === 'a' && String(node.props.href ?? '').startsWith('mailto:')).length, 0);
});

test('the applicant\'s shared contact email is shown for the selected application', async t => {
  const ui = await applicantsPage(t, { shared: 'volunteer.contact@example.test' });
  await select(ui);
  assert.equal(rpcCalls(ui).length, 1);
  assert.equal(rpcCalls(ui)[0].body.p_application_id, 'application-1');
  assert.ok(ui.text().includes('volunteer.contact@example.test'));
  assert.ok(!ui.text().includes('legacy.login@example.test'));
});

test('an applicant who shared nothing is reviewed and approved as usual', async t => {
  const ui = await applicantsPage(t, { shared: null });
  await select(ui);
  assert.ok(ui.text().includes('no contact email shared'));
  await ui.click('Approve');
  await ui.settle();
  assert.ok(ui.text().includes('Decision saved for Review Volunteer: Approved.'));
});

test('an applicant with no name is called "Volunteer", never by their email', async t => {
  const ui = await applicantsPage(t, { app: { ...application, applicant_name: null } });
  assert.ok(!ui.text().includes('legacy.login@example.test'));
  assert.ok(ui.text().includes('Volunteer'));
});

test('the search box no longer matches stored login emails', async t => {
  const ui = await applicantsPage(t);
  const search = ui.find(node => node.type === 'input' && node.props.placeholder?.startsWith('Search by'));
  assert.equal(search.props.placeholder, 'Search by name or project...');
  search.props.onChange({ target: { value: 'legacy.login' } });
  await ui.settle();
  assert.ok(!ui.text().includes('Review Volunteer'));
  search.props.onChange({ target: { value: 'review' } });
  await ui.settle();
  assert.ok(ui.text().includes('Review Volunteer'));
});

// ---- The volunteer's My Projects page --------------------------------------------

async function myProjects(t, statuses, shared = 'org.contact@example.test') {
  const apps = statuses.map((status, i) => ({ id: `application-${i}`, project_id: 'project-1', status, created_at: '2026-01-01T00:00:00Z' }));
  const ui = mount(t, 'app/volunteer/projects/page.tsx', {
    auth: volunteerAuth,
    fetch: request => {
      if (request.url.pathname.endsWith('/rpc/get_shared_contact')) return json(shared);
      if (request.url.pathname.endsWith('/applications')) return json(apps);
      if (request.url.pathname.endsWith('/posts')) return json([{ id: 'project-1', title: 'Community website', organization_name: 'Helping Hands', status: 'Active' }]);
      throw new Error(`Unexpected request: ${request.url}`);
    },
  });
  await ui.settle();
  return ui;
}

test('a volunteer sees the organization\'s shared contact for pending and approved applications', async t => {
  const ui = await myProjects(t, ['pending', 'approved']);
  assert.equal(rpcCalls(ui).length, 2);
  assert.ok(ui.text().includes('Organization contact'));
  assert.ok(ui.text().includes('org.contact@example.test'));
});

test('a rejected application asks for no contact at all', async t => {
  const ui = await myProjects(t, ['rejected']);
  assert.equal(rpcCalls(ui).length, 0);
  assert.ok(!ui.text().includes('Organization contact'));
});

test('an organization that shared nothing is shown as not sharing', async t => {
  const ui = await myProjects(t, ['approved'], null);
  assert.ok(ui.text().includes('Organization contact'));
  assert.ok(ui.text().includes('no contact email shared'));
});