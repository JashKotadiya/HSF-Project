import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mount, json } from './helpers/components.mjs';

test('volunteer pending applications link to their own conversation', async t => {
  const ui = mount(t, 'app/volunteer/projects/page.tsx', {
    auth: { user: { id: 'volunteer' }, role: 'volunteer', loading: false },
    fetch: request => json(request.url.pathname.endsWith('/applications') ? [{ id: 'application-1', project_id: 'project-1', status: 'pending', created_at: '2026-11-05' }] : [{ id: 'project-1', title: 'Community website', status: 'Active' }]),
  });
  await ui.settle();
  const link = ui.find(node => node.type === 'Link' && ui.text(node).trim() === 'Message organization');
  assert.equal(link.props.href, '/messages?application=application-1');
});

test('organization selected applicant links to the correct pending application', async t => {
  const ui = mount(t, 'app/nonprofit/dashboard/applicants/page.tsx', {
    auth: { user: { id: 'owner' }, role: 'nonprofit', loading: false },
    fetch: request => json(request.url.pathname.endsWith('/posts') ? [{ id: 'project-1', title: 'Community website' }] : request.method === 'GET' ? [{ id: 'application-1', project_id: 'project-1', applicant_name: 'Volunteer', status: 'pending', created_at: '2026-11-05' }] : null),
  });
  await ui.settle(); ui.find(node => node.type === 'button' && ui.text(node).includes('Volunteer')).props.onClick(); await ui.settle();
  const link = ui.find(node => node.type === 'Link' && ui.text(node).trim() === 'Message volunteer');
  assert.equal(link.props.href, '/messages?application=application-1');
});
