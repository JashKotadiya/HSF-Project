import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setup, deferred } from './helpers/auth.mjs';

for (const [role, selected, hint] of [
  ['nonprofit', 'I am a Volunteer', 'I am an Organization'],
  ['volunteer', 'I am an Organization', 'I am a Volunteer'],
]) {
  test(`${selected} rejects a ${role} account without redirecting`, async t => {
    const env = setup(t, { role });
    await env.ui.settle();
    env.ui.click(selected);
    env.ui.fill();
    await env.ui.submit();
    await env.ui.settle();
    assert.ok(env.ui.text().includes(`Select "${hint}"`));
    assert.deepEqual(env.redirects, []);
    assert.equal((await env.supabase.auth.getSession()).data.session, null);
    assert.equal(env.ui.find(node => node.type === 'button' && node.props.type === 'submit').props.disabled, false);
  });
}

test('switching to the correct tab after a mismatch allows normal sign-in', async t => {
  const env = setup(t, { role: 'nonprofit' });
  await env.ui.settle(); env.ui.fill();
  await env.ui.submit(); await env.ui.settle();
  assert.deepEqual(env.redirects, []);
  env.ui.click('I am an Organization');
  await env.ui.submit(); await env.ui.settle();
  assert.deepEqual(env.redirects, ['/nonprofit/dashboard']);
});

test('matching volunteer login still opens the volunteer project board', async t => {
  const env = setup(t, { role: 'volunteer' });
  await env.ui.settle(); env.ui.fill();
  await env.ui.submit(); await env.ui.settle();
  assert.deepEqual(env.redirects, ['/projects']);
});

test('role tabs and account mode cannot change while login validation is pending', async t => {
  const started = deferred(), release = deferred();
  const env = setup(t, { role: 'nonprofit', beforeProfile: async () => { started.resolve(); await release.promise; } });
  await env.ui.settle(); env.ui.fill();
  const pending = env.ui.submit();
  await started.promise;
  await env.ui.settle();
  for (const label of ['I am a Volunteer', 'I am an Organization', 'Sign up']) {
    assert.equal(env.ui.find(node => node.type === 'button' && env.ui.text(node).trim() === label).props.disabled, true);
  }
  assert.deepEqual(env.redirects, []);
  release.resolve(); await pending; await env.ui.settle();
  assert.ok(env.ui.text().includes('organization account'));
});

for (const [tab, role] of [['I am a Volunteer', 'volunteer'], ['I am an Organization', 'nonprofit']]) {
  test(`${tab} signup still sends the selected role and displays confirmation guidance`, async t => {
    const env = setup(t);
    await env.ui.settle(); env.ui.click(tab); env.ui.click('Sign up'); env.ui.fill();
    await env.ui.submit(); await env.ui.settle();
    const signup = env.requests.find(request => request.path === '/auth/v1/signup');
    assert.equal(signup.body.data.role, role);
    assert.match(env.ui.text(), /Check your email/);
    assert.deepEqual(env.redirects, []);
  });
}
