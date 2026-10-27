import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mount, json, deferred } from './helpers/components.mjs';

const application = { id: 'application-1', project_id: 'project-1', volunteer_id: 'volunteer-1', status: 'pending', applicant_name: 'Review Volunteer', created_at: '2026-01-01T00:00:00Z' };
async function setup(t, options = {}) {
  const ui = mount(t, 'app/nonprofit/dashboard/applicants/page.tsx', {
    auth: { user: { id: 'org-1' }, role: 'nonprofit', loading: false },
    confirm: options.confirm,
    fetch: request => {
      if (request.url.pathname.endsWith('/posts')) return json([{ id: 'project-1', title: 'Community website' }]);
      if (request.method === 'GET') return json([application]);
      if (request.body.viewed_at) return json(null);
      return options.update?.(request) ?? json({ id: application.id, status: request.body.status });
    },
  });
  await ui.settle();
  const applicant = ui.find(node => node.type === 'button' && ui.text(node).includes('Review Volunteer'));
  applicant.props.onClick();
  await ui.settle();
  return ui;
}
const writes = ui => ui.requests.filter(request => request.method === 'PATCH' && request.body.status);

test('cancelling approval keeps the pending status and sends no decision update', async t => {
  const ui = await setup(t, { confirm: () => false });
  await ui.click('Approve');
  await ui.settle();
  assert.equal(writes(ui).length, 0);
  assert.equal(ui.confirmations.length, 1);
  assert.match(ui.confirmations[0], /Review Volunteer.*Community website/);
  assert.ok(ui.text().includes('Under review'));
  assert.ok(!ui.text().includes('Decision saved'));
});

test('confirmed approval saves once and acknowledges the persisted decision', async t => {
  const ui = await setup(t);
  await ui.click('Approve');
  await ui.settle();
  assert.equal(ui.confirmations.length, 1);
  assert.equal(writes(ui).length, 1);
  assert.equal(writes(ui)[0].url.searchParams.get('id'), 'eq.application-1');
  assert.equal(writes(ui)[0].headers.get('Prefer'), 'return=representation');
  assert.ok(ui.text().includes('Decision saved for Review Volunteer: Approved.'));
  assert.equal(ui.button('Approve').props.disabled, true);
});

test('pending decisions block both buttons and even a previously captured reject handler', async t => {
  const pending = deferred();
  const ui = await setup(t, { update: request => request.body.status === 'approved' ? pending.promise : json({ id: application.id, status: 'rejected' }) });
  const reject = ui.button('Reject').props.onClick;
  const saving = ui.click('Approve');
  await ui.settle();
  assert.equal(ui.button('Approve').props.disabled, true);
  assert.equal(ui.button('Reject').props.disabled, true);
  assert.ok(ui.text().includes('Under review'));
  await reject();
  assert.equal(writes(ui).length, 1);
  pending.resolve(json({ id: application.id, status: 'approved' }));
  await saving;
  await ui.settle();
  assert.ok(ui.text().includes('Decision saved for Review Volunteer: Approved.'));
  await ui.click('Reject');
  await ui.settle();
  assert.equal(writes(ui).length, 2);
  assert.ok(ui.text().includes('Decision saved for Review Volunteer: Not selected.'));
});

for (const failure of [json({ code: '42501', message: 'Permission denied' }, 403), json({ code: 'PGRST116', message: 'No application was updated' }, 406)]) {
  test(`failed decision (${failure.status}) preserves the old status and allows a retry`, async t => {
    let failing = true;
    const ui = await setup(t, { update: request => failing ? failure : json({ id: application.id, status: request.body.status }) });
    await ui.click('Approve');
    await ui.settle();
    assert.ok(ui.find(node => node.props.role === 'alert'));
    assert.ok(ui.text().includes('Under review'));
    assert.ok(!ui.text().includes('Decision saved'));
    assert.equal(ui.button('Approve').props.disabled, false);
    failing = false;
    await ui.click('Approve');
    await ui.settle();
    assert.ok(ui.text().includes('Decision saved for Review Volunteer: Approved.'));
  });
}

test('the displayed decision comes from the database response', async t => {
  const ui = await setup(t, { update: () => json({ id: application.id, status: 'rejected' }) });
  await ui.click('Approve');
  await ui.settle();
  assert.ok(ui.text().includes('Decision saved for Review Volunteer: Not selected.'));
  assert.equal(ui.button('Reject').props.disabled, true);
});
