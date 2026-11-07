import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mount, json, deferred } from './helpers/components.mjs';

const project = {
  id: 'project-1',
  title: 'Community website',
  status: 'Active',
  cause: 'Education',
  created_at: '2026-01-01T00:00:00Z',
  skills_needed: ['React'],
};
const auth = { user: { id: 'volunteer-1' }, role: 'volunteer', loading: false };

function createFetch({ applicationStatus = null, profile = { cause_areas: ['Education'] }, failApplications = false } = {}) {
  return request => {
    if (request.url.pathname.includes('/rpc/search_projects')) {
      const keyword = request.body?.p_keyword;
      const causes = request.body?.p_causes ?? [];
      if (keyword === 'unmatched') return json([]);
      if (causes.length > 0 && !causes.includes(project.cause)) return json([]);
      return json([project]);
    }
    if (request.url.pathname.includes('/profiles')) {
      return json(profile ?? null);
    }
    if (request.url.pathname.includes('/applications')) {
      if (failApplications) return json({ message: 'Permission denied', code: '42501' }, 403);
      return json(applicationStatus ? [{ project_id: project.id, status: applicationStatus }] : []);
    }
    return json([]);
  };
}

const setup = (t, options = {}) => mount(t, 'components/projects/ProjectBrowser.tsx', {
  auth,
  props: { projects: [project] },
  fetch: createFetch(options),
  ...options,
});

for (const [status, label] of [['approved', 'Approved'], ['pending', 'Under review'], ['rejected', 'Not selected']]) {
  test(`${status} applications have a status and My Projects link on Browse Projects`, async t => {
    const ui = setup(t, { fetch: createFetch({ applicationStatus: status }) });
    await ui.settle();
    assert.ok(ui.text().includes(label));
    assert.ok(!ui.text().includes('View & Apply'));
    assert.equal(ui.find(node => node.type === 'Link').props.href, '/volunteer/projects');
    const applicationsRequest = ui.requests.find(request => request.url.pathname.includes('/applications'));
    assert.ok(applicationsRequest);
    assert.equal(applicationsRequest.url.searchParams.get('volunteer_id'), 'eq.volunteer-1');
  });
}

test('unapplied projects retain their apply link and search is sent to backend search', async t => {
  const ui = setup(t);
  await ui.settle();
  assert.ok(ui.text().includes('View & Apply'));
  assert.equal(ui.find(node => node.type === 'Link').props.href, '/projects/project-1');

  ui.find(node => node.type === 'input' && node.props.type === 'search').props.onChange({ target: { value: 'unmatched' } });
  await ui.settle();

  assert.ok(ui.text().includes('No projects match your filters.'));
  const searchRequest = ui.requests.find(request => request.url.pathname.includes('/rpc/search_projects') && request.body?.p_keyword === 'unmatched');
  assert.ok(searchRequest);
});

test('pending status checks do not advertise an existing project as a new application', async t => {
  const wait = deferred();
  const ui = setup(t, {
    fetch: request => {
      if (request.url.pathname.includes('/applications')) return wait.promise;
      return createFetch()(request);
    },
  });
  await ui.settle();
  assert.ok(ui.text().includes('Checking your application'));
  assert.ok(!ui.text().includes('View & Apply'));
  wait.resolve(json([{ project_id: project.id, status: 'approved' }]));
  await ui.settle();
  assert.ok(ui.text().includes('Approved'));
});

test('failed status checks show an error and recover through Retry', async t => {
  let failing = true;
  const ui = setup(t, {
    fetch: request => {
      if (request.url.pathname.includes('/applications')) {
        return failing ? json({ message: 'Permission denied', code: '42501' }, 403) : json([{ project_id: project.id, status: 'approved' }]);
      }
      return createFetch()(request);
    },
  });
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
  const ui = setup(t, {
    fetch: request => {
      if (request.url.pathname.includes('/applications')) {
        return json([{ project_id: project.id, status }]);
      }
      return createFetch()(request);
    },
  });
  await ui.settle();
  status = 'approved';
  ui.focus();
  await ui.settle();
  assert.ok(ui.text().includes('Approved'));
  assert.equal(ui.requests.filter(request => request.url.pathname.includes('/applications')).length, 2);
});

test('account changes hide old statuses immediately and ignore the old response', async t => {
  const oldResponse = deferred();
  const ui = setup(t, {
    fetch: request => {
      if (request.url.pathname.includes('/applications')) {
        return request.url.searchParams.get('volunteer_id') === 'eq.volunteer-1'
          ? oldResponse.promise
          : json([]);
      }
      return createFetch()(request);
    },
  });
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
    assert.equal(ui.requests.filter(request => request.url.pathname.includes('/applications')).length, 0);
    assert.ok(!ui.text().includes('Your application'));
  });
}

test('use my interests adds saved cause areas to backend search request', async t => {
  const ui = setup(t);
  await ui.settle();

  ui.find(
    node =>
      node.type === 'input' &&
      node.props.type === 'checkbox' &&
      String(node.props.className || '').includes('mt-0.5')
  ).props.onChange();
  await ui.settle();

  const request = [...ui.requests].reverse().find(entry => entry.url.pathname.includes('/rpc/search_projects'));
  assert.deepEqual(request.body.p_causes, ['Education']);
});

test('missing saved interests shows guidance while manual filters still render', async t => {
  const ui = setup(t, { fetch: createFetch({ profile: {} }) });
  await ui.settle();
  assert.ok(ui.text().includes('Add interests in your profile, then return to use them here.'));
  assert.ok(ui.text().includes('Interests / Cause Areas'));
});

test('filters are restored when returning to the project browser', async t => {
  const sessionStorage = new Map();
  const first = setup(t, { sessionStorage });
  await first.settle();

  first.find(node => node.type === 'input' && node.props.type === 'search').props.onChange({ target: { value: 'matching' } });
  await first.settle();

  const second = setup(t, { sessionStorage });
  await second.settle();
  const searchBox = second.find(node => node.type === 'input' && node.props.type === 'search');
  assert.equal(searchBox.props.value, 'matching');
});
