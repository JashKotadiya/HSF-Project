import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setup, deferred } from './helpers/auth.mjs';

for (const [role, selected, label] of [
  ['nonprofit', 'volunteer', 'I am an Organization'],
  ['volunteer', 'nonprofit', 'I am a Volunteer'],
]) {
  test(`${role} credentials cannot activate a ${selected} login`, async t => {
    const env = setup(t, { role });
    await assert.rejects(env.signInWithRole('account@example.test', 'password', selected), error => error.message.includes(label));
    assert.equal((await env.supabase.auth.getSession()).data.session, null);
    assert.ok(!env.events.includes('SIGNED_IN'));
    const logout = env.requests.find(request => request.path === '/auth/v1/logout');
    assert.equal(logout.search.get('scope'), 'local');
    assert.equal(env.requests.filter(request => request.path === '/auth/v1/user').length, 0);
  });
}

for (const role of ['volunteer', 'nonprofit']) {
  test(`matching ${role} credentials activate the browser session`, async t => {
    const env = setup(t, { role });
    await env.signInWithRole('account@example.test', 'password', role);
    assert.equal((await env.supabase.auth.getSession()).data.session.user.id, env.user.id);
    assert.equal(env.events.filter(event => event === 'SIGNED_IN').length, 1);
    assert.ok(!env.requests.some(request => request.path === '/auth/v1/logout'));
    const profile = env.requests.find(request => request.path === '/rest/v1/profiles');
    assert.equal(profile.search.get('id'), `eq.${env.user.id}`);
    assert.equal(profile.headers.get('Authorization'), `Bearer ${env.accessToken}`);
  });
}

test('no shared session is published while role verification is pending', async t => {
  const started = deferred(), release = deferred();
  const env = setup(t, { role: 'nonprofit', beforeProfile: async () => { started.resolve(); await release.promise; } });
  const pending = env.signInWithRole('account@example.test', 'password', 'nonprofit');
  await started.promise;
  assert.equal((await env.supabase.auth.getSession()).data.session, null);
  assert.ok(!env.events.includes('SIGNED_IN'));
  release.resolve();
  await pending;
  assert.ok(env.events.includes('SIGNED_IN'));
});

test('the stored profile role takes precedence over conflicting signup metadata', async t => {
  const env = setup(t, { role: 'volunteer', metadataRole: 'nonprofit' });
  await assert.rejects(env.signInWithRole('account@example.test', 'password', 'nonprofit'), /volunteer account/);
  assert.equal((await env.supabase.auth.getSession()).data.session, null);
});

for (const role of ['organization', 'org']) {
  test(`legacy ${role} accounts match the organization selection`, async t => {
    const env = setup(t, { role });
    await env.signInWithRole('account@example.test', 'password', 'nonprofit');
    assert.ok((await env.supabase.auth.getSession()).data.session);
  });
}

test('a missing profile can use signup metadata without rewriting the role', async t => {
  const env = setup(t, { missingProfile: true, metadataRole: 'organization' });
  await env.signInWithRole('account@example.test', 'password', 'nonprofit');
  assert.ok((await env.supabase.auth.getSession()).data.session);
  assert.ok(env.requests.filter(request => request.path === '/rest/v1/profiles').every(request => request.method === 'GET'));
});

test('role lookup failures do not fall back to metadata or activate a session', async t => {
  const env = setup(t, { role: 'nonprofit', profileError: true });
  await assert.rejects(env.signInWithRole('account@example.test', 'password', 'nonprofit'), /verify your account type/);
  assert.equal((await env.supabase.auth.getSession()).data.session, null);
  assert.ok(!env.events.includes('SIGNED_IN'));
  assert.equal(env.requests.find(request => request.path === '/auth/v1/logout').search.get('scope'), 'local');
});

test('wrong passwords keep the normal credential error and never query the role', async t => {
  const env = setup(t, { badPassword: true });
  await assert.rejects(env.signInWithRole('account@example.test', 'wrong', 'volunteer'), /Invalid login credentials/);
  assert.equal((await env.supabase.auth.getSession()).data.session, null);
  assert.ok(!env.requests.some(request => request.path === '/rest/v1/profiles'));
});

test('a failed session activation cleans up only the temporary sign-in', async t => {
  const env = setup(t, { activationError: true });
  await assert.rejects(env.signInWithRole('account@example.test', 'password', 'volunteer'), /Session activation failed/);
  assert.equal((await env.supabase.auth.getSession()).data.session, null);
  assert.equal(env.requests.find(request => request.path === '/auth/v1/logout').search.get('scope'), 'local');
});

test('a logout failure still leaves a mismatched login unpublished', async t => {
  const env = setup(t, { role: 'nonprofit', logoutError: true });
  await assert.rejects(env.signInWithRole('account@example.test', 'password', 'volunteer'), /organization account/);
  assert.equal((await env.supabase.auth.getSession()).data.session, null);
  assert.ok(!env.events.includes('SIGNED_IN'));
});

test('temporary login clients cannot persist sessions or consume URL callbacks', async t => {
  const env = setup(t, { role: 'nonprofit' });
  await assert.rejects(env.signInWithRole('account@example.test', 'password', 'volunteer'));
  await assert.rejects(env.signInWithRole('account@example.test', 'password', 'volunteer'));
  const temporary = env.clientOptions.slice(1);
  assert.equal(temporary.length, 2);
  for (const options of temporary) {
    assert.equal(options.auth.persistSession, false);
    assert.equal(options.auth.autoRefreshToken, false);
    assert.equal(options.auth.detectSessionInUrl, false);
    assert.match(options.auth.storageKey, /^hsf-login-check-/);
  }
  assert.notEqual(temporary[0].auth.storageKey, temporary[1].auth.storageKey);
});
