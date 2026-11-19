import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mount, json } from './helpers/components.mjs';

const auth = { user: { id: 'org-1' }, role: 'nonprofit', loading: false };
const sharedCauses = ['Education', 'Environment', 'Health'];
const legacyProject = { id: 'project-1', user_id: 'org-1', title: 'Tutoring site', status: 'Active', cause: 'Youth Mentoring', skills_needed: ['React'] };

function setup(t, { id = 'project-1', project = legacyProject, categories = () => json(sharedCauses.map(name => ({ name }))), save } = {}) {
  const pushes = [];
  const ui = mount(t, 'app/nonprofit/dashboard/edit/[id]/page.tsx', {
    auth,
    params: { id },
    router: { push: href => pushes.push(href) },
    stubs: { '@/components/media/ImageUploader': { __esModule: true, default: 'ImageUploader' } },
    fetch: request => {
      if (request.url.pathname.includes('/cause_categories')) return categories(request);
      if (request.url.pathname.endsWith('/posts') && request.method === 'GET') return json(project ? [project] : []);
      if (request.url.pathname.endsWith('/posts')) return save ? save(request) : json([{ id: project?.id ?? 'project-new' }]);
      throw new Error(`Unexpected request ${request.method} ${request.url}`);
    },
  });
  return Object.assign(ui, { pushes });
}

const causeSelect = ui => ui.find(node => node.type === 'select' && node.props.id === 'project-cause');
const optionValues = ui => ui.all(node => node.type === 'option', causeSelect(ui)).map(node => node.props.value);
const submit = ui => ui.find(node => node.type === 'form').props.onSubmit({ preventDefault() {} });
const saveRequest = ui => ui.requests.find(request => request.url.pathname.endsWith('/posts') && request.method !== 'GET');

test('project form offers the shared cause list and keeps an existing legacy category visible and editable', async t => {
  const ui = setup(t); await ui.settle();
  assert.equal(causeSelect(ui).props.value, 'Youth Mentoring');
  assert.deepEqual(optionValues(ui), ['', 'Education', 'Environment', 'Health', 'Youth Mentoring']);
  causeSelect(ui).props.onChange({ target: { value: 'Environment' } }); await ui.settle();
  await submit(ui); await ui.settle();
  const request = saveRequest(ui);
  assert.equal(request.method, 'PATCH');
  assert.equal(request.body.cause, 'Environment');
  assert.equal(request.url.searchParams.get('id'), 'eq.project-1');
  assert.equal(request.url.searchParams.get('user_id'), 'eq.org-1');
  assert.deepEqual(ui.pushes, ['/nonprofit/dashboard']);
});

test('new projects choose from the shared categories and are created for the signed-in organization', async t => {
  const ui = setup(t, { id: 'new', project: null }); await ui.settle();
  assert.equal(causeSelect(ui).props.value, '');
  assert.deepEqual(optionValues(ui), ['', ...sharedCauses]);
  ui.find(node => node.type === 'input' && node.props.required).props.onChange({ target: { value: 'Food pantry app' } });
  causeSelect(ui).props.onChange({ target: { value: 'Health' } }); await ui.settle();
  await submit(ui); await ui.settle();
  const request = saveRequest(ui);
  assert.equal(request.method, 'POST');
  assert.equal(request.body.cause, 'Health');
  assert.equal(request.body.user_id, 'org-1');
});

test('a cause can be cleared from a project', async t => {
  const ui = setup(t); await ui.settle();
  causeSelect(ui).props.onChange({ target: { value: '' } }); await ui.settle();
  await submit(ui); await ui.settle();
  assert.equal(saveRequest(ui).body.cause, '');
});

test('organizations cannot open or categorize another organization\'s project', async t => {
  const ui = setup(t, { project: null }); await ui.settle();
  assert.equal(causeSelect(ui), undefined);
  assert.ok(ui.requests.some(request => request.url.searchParams.get('user_id') === 'eq.org-1'));
  assert.equal(saveRequest(ui), undefined);
});

test('an update that matches no owned project keeps the chosen cause and does not navigate', async t => {
  const ui = setup(t, { save: () => json([]) }); await ui.settle();
  causeSelect(ui).props.onChange({ target: { value: 'Education' } }); await ui.settle();
  await submit(ui); await ui.settle();
  assert.ok(ui.text().includes('belongs to another organization'));
  assert.equal(causeSelect(ui).props.value, 'Education');
  assert.deepEqual(ui.pushes, []);
});

test('a failed save keeps the unsaved cause selection', async t => {
  const ui = setup(t, { save: () => json({ message: 'Service unavailable' }, 503) }); await ui.settle();
  causeSelect(ui).props.onChange({ target: { value: 'Health' } }); await ui.settle();
  await submit(ui); await ui.settle();
  assert.ok(ui.text().includes("Couldn't save the project"));
  assert.equal(causeSelect(ui).props.value, 'Health');
  assert.deepEqual(ui.pushes, []);
});

test('if the shared list fails to load, the saved cause stays selected and the list can be retried', async t => {
  let fail = true;
  const ui = setup(t, { categories: () => fail ? json({ message: 'Permission denied', code: '42501' }, 403) : json(sharedCauses.map(name => ({ name }))) });
  await ui.settle();
  assert.equal(causeSelect(ui).props.value, 'Youth Mentoring');
  assert.ok(ui.text().includes("Couldn't load the cause list."));
  fail = false;
  ui.click('Retry causes'); await ui.settle();
  assert.deepEqual(optionValues(ui), ['', 'Education', 'Environment', 'Health', 'Youth Mentoring']);
});
