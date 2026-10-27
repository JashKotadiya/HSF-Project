import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mount, json, deferred } from './helpers/components.mjs';

const project = { id: 'project-1', title: 'Community website', status: 'Active', created_at: '2026-01-01T00:00:00Z', skills_needed: ['React'] };
const auth = { user: { id: 'volunteer-1' }, role: 'volunteer', loading: false };
const setup = (t, options = {}) => mount(t, 'components/projects/ProjectBrowser.tsx', {
  auth, props: { projects: [project] }, fetch: () => json([]), ...options,
});

for (const [status, label] of [['approved', 'Approved'], ['pending', 'Under review'], ['rejected', 'Not selected']]) {
  test(`${status} applications have a status and My Projects link on Browse Projects`, async t => {
    const ui = setup(t, { fetch: () => json([{ project_id: project.id, status }]) });
    await ui.settle();
    assert.ok(ui.text().includes(label));
    assert.ok(!ui.text().includes('View & Apply'));
    assert.equal(ui.find(node => node.type === 'Link').props.href, '/volunteer/projects');
    assert.equal(ui.requests.length, 1);
    assert.equal(ui.requests[0].url.searchParams.get('volunteer_id'), 'eq.volunteer-1');
  });
}

test('unapplied projects retain their apply link and search still works', async t => {
  const ui = setup(t);
  await ui.settle();
  assert.ok(ui.text().includes('View & Apply'));
  assert.equal(ui.find(node => node.type === 'Link').props.href, '/projects/project-1');
  ui.find(node => node.type === 'input' && node.props.type === 'search').props.onChange({ target: { value: 'unmatched' } });
  await ui.settle();
  assert.ok(ui.text().includes('No projects match your filters.'));
});

test('pending status checks do not advertise an existing project as a new application', async t => {
  const wait = deferred();
  const ui = setup(t, { fetch: () => wait.promise });
  await ui.settle();
  assert.ok(ui.text().includes('Checking your application'));
  assert.ok(!ui.text().includes('View & Apply'));
  wait.resolve(json([{ project_id: project.id, status: 'approved' }]));
  await ui.settle();
  assert.ok(ui.text().includes('Approved'));
});

test('failed status checks show an error and recover through Retry', async t => {
  let failing = true;
  const ui = setup(t, { fetch: () => failing ? json({ message: 'Permission denied', code: '42501' }, 403) : json([{ project_id: project.id, status: 'approved' }]) });
  await ui.settle();
  assert.ok(ui.find(node => node.props.role === 'alert'));
  assert.ok(!ui.text().includes('View & Apply'));
  failing = false;
  ui.click('Retry');
  await ui.settle();
  assert.ok(ui.text().includes('Approved'));
  assert.ok(!ui.find(node => node.props.role === 'alert'));
});

test('returning to the browser refreshes a pending decision to approved', async t => {
  let status = 'pending';
  const ui = setup(t, { fetch: () => json([{ project_id: project.id, status }]) });
  await ui.settle();
  status = 'approved';
  ui.focus();
  await ui.settle();
  assert.ok(ui.text().includes('Approved'));
  assert.equal(ui.requests.length, 2);
});

test('account changes hide old statuses immediately and ignore the old response', async t => {
  const oldResponse = deferred();
  const ui = setup(t, { fetch: request => request.url.searchParams.get('volunteer_id') === 'eq.volunteer-1'
    ? oldResponse.promise : json([]) });
  await ui.settle();
  ui.setAuth({ ...auth, user: { id: 'volunteer-2' } });
  await ui.settle();
  oldResponse.resolve(json([{ project_id: project.id, status: 'approved' }]));
  await ui.settle();
  assert.ok(!ui.text().includes('Approved'));
  assert.ok(ui.text().includes('View & Apply'));
});

for (const account of [{ user: null, role: null, loading: false }, { user: { id: 'org-1' }, role: 'nonprofit', loading: false }]) {
  test(`${account.role ?? 'signed-out'} browsing does not fetch volunteer application data`, async t => {
    const ui = setup(t, { auth: account });
    await ui.settle();
    assert.equal(ui.requests.length, 0);
    assert.ok(!ui.text().includes('Your application'));
  });
}
