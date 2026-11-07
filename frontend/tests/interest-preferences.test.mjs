import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mount, json, deferred } from './helpers/components.mjs';
const auth = { user: { id: 'volunteer-1' }, role: 'volunteer', loading: false };

function setup(t, options = {}) {
  let saved = options.saved ?? ['Education'];
  return mount(t, 'components/profile/InterestPreferences.tsx', {
    auth,
    fetch: request => {
      if (request.url.pathname.includes('/cause_categories')) return json(['Education', 'Environment'].map(name => ({ name })));
      if (request.url.pathname.includes('/volunteer_interests')) return json(saved.map(cause => ({ cause })));
      if (request.url.pathname.includes('/rpc/save_my_interests')) {
        if (options.save) return options.save(request);
        saved = request.body.p_causes;
        return json(saved.map(cause => ({ volunteer_id: auth.user.id, cause })));
      }
      throw new Error(`Unexpected request ${request.url}`);
    }, ...options,
  });
}
const checkbox = (ui, name) => ui.find(node => node.type === 'label' && ui.text(node).trim() === name).props.children[0];

test('volunteers can save, reload, edit, and clear multiple interests independently of skills', async t => {
  let saved = ['Education'];
  const save = request => { saved = request.body.p_causes; return json(saved.map(cause => ({ cause }))); };
  const ui = setup(t, { save }); await ui.settle();
  assert.equal(checkbox(ui, 'Education').props.checked, true);
  checkbox(ui, 'Environment').props.onChange(); await ui.settle();
  ui.click('Save interests'); await ui.settle();
  assert.deepEqual(saved, ['Education', 'Environment']);
  assert.ok(ui.text().includes('Your interests were saved.'));
  assert.ok(!ui.requests.some(request => request.url.pathname.includes('/profiles')));
  const reload = setup(t, { saved }); await reload.settle();
  assert.equal(checkbox(reload, 'Environment').props.checked, true);
  reload.click('Clear interests'); await reload.settle(); reload.click('Save interests'); await reload.settle();
  assert.deepEqual(reload.requests.find(request => request.url.pathname.includes('/rpc/save_my_interests')).body.p_causes, []);
});

test('failed saves preserve selections and a restored draft can be retried', async t => {
  const sessionStorage = new Map();
  const ui = setup(t, { sessionStorage, save: () => json({ message: 'Unavailable' }, 503) });
  await ui.settle(); checkbox(ui, 'Environment').props.onChange(); await ui.settle();
  ui.click('Save interests'); await ui.settle();
  assert.ok(ui.text().includes("Couldn't save your interests"));
  assert.equal(checkbox(ui, 'Environment').props.checked, true);
  const reload = setup(t, { sessionStorage }); await reload.settle();
  assert.equal(checkbox(reload, 'Environment').props.checked, true);
  reload.click('Save interests'); await reload.settle();
  assert.equal(sessionStorage.has('hsf-interest-draft-volunteer-1'), false);
});

test('a pending save cannot submit twice and its response is hidden after an account switch', async t => {
  const wait = deferred();
  const ui = setup(t, { save: () => wait.promise }); await ui.settle();
  const save = ui.button('Save interests').props.onClick;
  save(); save(); await ui.settle();
  assert.equal(ui.requests.filter(request => request.url.pathname.includes('/rpc/save_my_interests')).length, 1);
  ui.setAuth({ ...auth, user: { id: 'volunteer-2' } }); await ui.settle();
  wait.resolve(json([{ cause: 'Environment' }])); await ui.settle();
  assert.ok(!ui.text().includes('Your interests were saved.'));
  assert.equal(checkbox(ui, 'Environment').props.checked, false);
});

test('empty profiles can choose interests and storage denial does not prevent saving', async t => {
  const ui = setup(t, { saved: [], storageError: true }); await ui.settle();
  checkbox(ui, 'Education').props.onChange(); await ui.settle();
  ui.click('Save interests'); await ui.settle();
  assert.ok(ui.text().includes('Your interests were saved.'));
});

test('signed-out and nonprofit accounts cannot submit interest preferences', async t => {
  for (const account of [{ user: null, role: null, loading: false }, { user: { id: 'org-1' }, role: 'nonprofit', loading: false }]) {
    const ui = setup(t, { auth: account }); await ui.settle();
    assert.equal(ui.button('Save interests'), undefined);
    assert.equal(ui.requests.filter(request => request.url.pathname.includes('/volunteer_interests')).length, 0);
  }
});
