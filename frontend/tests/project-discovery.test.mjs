import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mount, json, deferred } from './helpers/components.mjs';

const auth = { user: { id: 'volunteer-1' }, role: 'volunteer', loading: false };
const projects = Array.from({ length: 24 }, (_, i) => ({
  id: `project-${i + 1}`, title: `Project ${String(i + 1).padStart(2, '0')}`,
  created_at: new Date(Date.UTC(2026, 0, i + 1)).toISOString(),
  status: 'Active', cause: i === 23 ? 'Environment' : 'Education', skills_needed: ['React'],
}));
const storeKey = 'hsf-project-browser-filters-v2:volunteer:volunteer-1';
const stored = (overrides = {}) => JSON.stringify({ filters: { search: '', status: 'Active', causes: [], skills: [] }, sort: 'newest', page: 0, useMyInterests: false, ...overrides });
function responder(request) {
  if (request.url.pathname.includes('/volunteer_interests')) return json([{ cause: 'Education' }]);
  if (request.url.pathname.includes('/cause_categories')) return json(['Education', 'Environment'].map(name => ({ name })));
  if (request.url.pathname.includes('/applications')) return json([]);
  if (request.url.pathname.includes('/rpc/search_projects')) {
    const args = request.body;
    const filtered = projects.filter(project => (!args.p_causes?.length || args.p_causes.includes(project.cause)) && (!args.p_keyword || project.title.includes(args.p_keyword)));
    filtered.sort((a, b) => args.p_sort === 'oldest' ? a.created_at.localeCompare(b.created_at) : b.created_at.localeCompare(a.created_at));
    return json(filtered.slice(args.p_offset, args.p_offset + args.p_limit));
  }
  throw new Error(`Unexpected request: ${request.url}`);
}
const setup = (t, options = {}) => mount(t, 'components/projects/ProjectBrowser.tsx', { auth, props: { projects }, fetch: responder, ...options });
const cards = ui => ui.all(node => node.type === 'Link' && /^\/projects\//.test(node.props.href));
const latestSearch = ui => [...ui.requests].reverse().find(request => request.url.pathname.includes('/rpc/search_projects'));
const toggleInterests = ui => ui.find(node => node.type === 'input' && node.props.type === 'checkbox' && String(node.props.className).includes('mt-0.5')).props.onChange();
const setSearch = (ui, value) => ui.find(node => node.type === 'input' && node.props.type === 'search').props.onChange({ target: { value } });
const toggle = (ui, label) => ui.find(node => node.type === 'label' && ui.text(node).trim() === label).props.children[0].props.onChange();

test('server sort is used across pages and changing sort returns to page one', async t => {
  const ui = setup(t);
  await ui.settle();
  assert.equal(latestSearch(ui).body.p_sort, 'newest');
  assert.equal(cards(ui)[0].props.href, '/projects/project-24');
  assert.ok(ui.text().includes('12 projects on this page'));
  ui.click('Next'); await ui.settle();
  assert.equal(cards(ui)[0].props.href, '/projects/project-12');
  ui.find(node => node.type === 'select' && node.props.value === 'newest').props.onChange({ target: { value: 'oldest' } });
  await ui.settle();
  assert.equal(latestSearch(ui).body.p_offset, 0);
  assert.equal(latestSearch(ui).body.p_sort, 'oldest');
  assert.equal(cards(ui)[0].props.href, '/projects/project-1');
});

test('manual interests, skills, status, and keyword are combined before pagination', async t => {
  const ui = setup(t); await ui.settle();
  toggle(ui, 'Environment'); await ui.settle();
  toggle(ui, 'React'); await ui.settle();
  setSearch(ui, 'Project'); await ui.settle();
  assert.deepEqual(latestSearch(ui).body, { p_keyword: 'Project', p_status: 'Active', p_tech_stack: ['React'], p_causes: ['Environment'], p_sort: 'newest', p_limit: 13, p_offset: 0 });
  assert.equal(cards(ui)[0].props.href, '/projects/project-24');
});

test('an outdated RPC shows a retryable error without falsely reporting no matches', async t => {
  let outdated = true;
  const ui = setup(t, { fetch: request => outdated && request.url.pathname.includes('/rpc/search_projects')
    ? json({ code: 'PGRST202', message: 'Could not find the function public.search_projects' }, 404) : responder(request) });
  await ui.settle(); toggle(ui, 'Environment'); await ui.settle();
  assert.ok(ui.text().includes("Couldn't load projects for the selected filters."));
  assert.ok(!ui.text().includes('No projects match'));
  assert.equal(cards(ui).length, 0);
  assert.ok(ui.requests.filter(request => request.url.pathname.includes('/rpc/search_projects')).every(request => request.body.p_sort && Object.hasOwn(request.body, 'p_causes')));
  outdated = false; ui.click('Retry'); await ui.settle();
  assert.equal(cards(ui)[0].props.href, '/projects/project-24');
});

test('signing out removes the previous volunteer interests from subsequent searches', async t => {
  const ui = setup(t); await ui.settle(); toggleInterests(ui); await ui.settle();
  assert.deepEqual(latestSearch(ui).body.p_causes, ['Education']);
  ui.setAuth({ user: null, role: null, loading: false }); await ui.settle();
  setSearch(ui, 'Project'); await ui.settle();
  assert.equal(latestSearch(ui).body.p_causes, null);
  assert.ok(!ui.text().includes('Filtering with your saved interests'));
});

test('Clear all includes saved interests and ordinary filter edits do not turn them off', async t => {
  const ui = setup(t); await ui.settle(); toggleInterests(ui); await ui.settle();
  assert.ok(ui.button('Clear all'));
  setSearch(ui, 'Project'); await ui.settle(); setSearch(ui, ''); await ui.settle();
  assert.deepEqual(latestSearch(ui).body.p_causes, ['Education']);
  ui.click('Clear all'); await ui.settle();
  assert.equal(latestSearch(ui).body.p_causes, null);
  assert.equal(ui.button('Clear all'), undefined);
});

test('returning from details restores sort, page, and saved interests only after preferences load', async t => {
  const sessionStorage = new Map();
  const first = setup(t, { sessionStorage }); await first.settle();
  toggleInterests(first); await first.settle(); first.click('Next'); await first.settle();
  const wait = deferred();
  const second = setup(t, { sessionStorage, fetch: request => request.url.pathname.includes('/volunteer_interests') ? wait.promise : responder(request) });
  await second.settle();
  assert.equal(second.requests.filter(request => request.url.pathname.includes('/rpc/search_projects')).length, 0);
  wait.resolve(json([{ cause: 'Education' }])); await second.settle();
  assert.equal(latestSearch(second).body.p_offset, 12);
  assert.deepEqual(latestSearch(second).body.p_causes, ['Education']);
  assert.match(second.text(), /Page\s+2/);
});

test('an empty restored page retains Previous navigation', async t => {
  const ui = setup(t, { sessionStorage: new Map([[storeKey, stored({ page: 2 })]]) });
  await ui.settle(); assert.ok(ui.text().includes('No projects match'));
  ui.click('Previous'); await ui.settle();
  assert.equal(cards(ui).length, 12);
});

test('failed searches hide stale cards and preserve filters for retry', async t => {
  let failing = false;
  const ui = setup(t, { fetch: request => failing && request.url.pathname.includes('/rpc/search_projects') ? json({ message: 'Unavailable' }, 503) : responder(request) });
  await ui.settle(); failing = true; setSearch(ui, 'Project 24'); await ui.settle();
  assert.equal(cards(ui).length, 0);
  failing = false; ui.click('Retry'); await ui.settle();
  assert.equal(cards(ui)[0].props.href, '/projects/project-24');
});

test('storage denial and malformed persisted data do not prevent searching', async t => {
  for (const options of [{ storageError: true }, { sessionStorage: new Map([[storeKey, stored({ filters: { search: 123, status: {}, causes: [null, 42], skills: {} }, page: -1 })]]) }]) {
    const ui = setup(t, options); await ui.settle();
    assert.equal(latestSearch(ui).body.p_keyword, null);
    assert.equal(latestSearch(ui).body.p_offset, 0);
    assert.equal(cards(ui).length, 12);
  }
});

test('saved-interest failures are distinguishable from empty preferences and can be retried', async t => {
  let failing = true;
  const ui = setup(t, { sessionStorage: new Map([[storeKey, stored({ useMyInterests: true })]]), fetch: request => failing && request.url.pathname.includes('/volunteer_interests') ? json({ message: 'Permission denied' }, 403) : responder(request) });
  await ui.settle();
  assert.ok(ui.text().includes("Couldn't load your saved interests."));
  assert.ok(!ui.text().includes('Add interests in your profile'));
  assert.equal(latestSearch(ui), undefined);
  failing = false; ui.click('Retry interests'); await ui.settle();
  assert.deepEqual(latestSearch(ui).body.p_causes, ['Education']);
});

test('focus refreshes both saved preferences and application badges', async t => {
  let cause = 'Education';
  const ui = setup(t, { fetch: request => request.url.pathname.includes('/volunteer_interests') ? json([{ cause }]) : responder(request) });
  await ui.settle(); toggleInterests(ui); await ui.settle();
  cause = 'Environment'; ui.focus(); await ui.settle();
  assert.deepEqual(latestSearch(ui).body.p_causes, ['Environment']);
  assert.equal(ui.requests.filter(request => request.url.pathname.includes('/applications')).length, 2);
});

test('a stale search response cannot overwrite the latest filters', async t => {
  const wait = deferred();
  const ui = setup(t, { fetch: request => request.body?.p_keyword === 'Project 01' ? wait.promise : responder(request) });
  await ui.settle(); setSearch(ui, 'Project 01'); await ui.settle();
  setSearch(ui, 'Project 24'); await ui.settle();
  wait.resolve(json([projects[0]])); await ui.settle();
  assert.equal(cards(ui)[0].props.href, '/projects/project-24');
});

test('shared categories and saved-interest guidance remain available when there are no project cards', async t => {
  const ui = setup(t, { props: { projects: [] }, fetch: request => request.url.pathname.includes('/volunteer_interests') || request.url.pathname.includes('/rpc/search_projects') ? json([]) : responder(request) });
  await ui.settle();
  assert.ok(ui.text().includes('Environment'));
  assert.ok(ui.text().includes('Add interests in your profile'));
});
