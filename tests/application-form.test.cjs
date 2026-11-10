const { test } = require('node:test');
const assert = require('node:assert/strict');
const mount = require('./helpers/application-form.cjs');

const closedMessage = 'This project is no longer accepting applications.';
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const permissionError = { code: '42501', message: 'new row violates row-level security policy for table "applications"' };

async function submit(t, mode) {
  const calls = [];
  let projectReads = 0, applicationReads = 0;
  const ui = mount(async (input, init = {}) => {
    const url = new URL(input);
    const method = init.method || 'GET';
    calls.push({ path: url.pathname, method });
    if (url.pathname === '/rest/v1/applications' && method === 'GET') {
      applicationReads++;
      return json(mode === 'duplicate' && applicationReads > 1 ? { status: 'pending' } : []);
    }
    if (url.pathname === '/rest/v1/posts') {
      projectReads++;
      if (mode === 'project-read-denied' || (mode === 'recheck-failed' && projectReads > 1)) {
        return json({ code: '42501', message: 'permission denied for table posts' }, 403);
      }
      const isClosed = mode === 'closed' || (mode === 'closed-during-upload' && projectReads > 1);
      return json(isClosed ? [] : { id: 'project-1' });
    }
    if (url.pathname.startsWith('/storage/v1/object/') && method === 'POST') {
      if (mode === 'storage-denied') return json({ statusCode: '403', error: 'Unauthorized', message: 'new row violates row-level security policy' }, 403);
      return json({ Key: 'resumes/test.pdf' });
    }
    if (url.pathname === '/rest/v1/applications' && method === 'POST') {
      if (mode === 'duplicate') return json({ code: '23505', message: 'duplicate key value violates unique constraint' }, 409);
      if (['closed-during-upload', 'insert-denied', 'recheck-failed'].includes(mode)) return json(permissionError, 403);
      return new Response(null, { status: 201 });
    }
    if (url.pathname.startsWith('/storage/v1/object/') && method === 'DELETE') return json([]);
    throw new Error(`Unexpected ${method} ${url.pathname}`);
  });
  t.after(() => ui.dispose());
  await ui.settle();
  ui.fill();
  await ui.submit();
  await ui.settle();
  const count = (prefix, method) => calls.filter(call => call.path.startsWith(prefix) && call.method === method).length;
  return { ui, projectReads, uploads: count('/storage/', 'POST'), inserts: count('/rest/v1/applications', 'POST'), removals: count('/storage/', 'DELETE') };
}

test('an Active project accepts a normal submission', async t => {
  const result = await submit(t, 'success');
  assert.match(result.ui.text(), /Application submitted!/);
  assert.equal(result.uploads, 1);
  assert.equal(result.inserts, 1);
  assert.equal(result.removals, 0);
});

test('an already closed project is rejected before uploading a resume', async t => {
  const result = await submit(t, 'closed');
  assert.ok(result.ui.text().includes(closedMessage));
  assert.equal(result.uploads, 0);
  assert.equal(result.inserts, 0);
});

test('closure during upload is confirmed and the unused resume is removed', async t => {
  const result = await submit(t, 'closed-during-upload');
  assert.ok(result.ui.text().includes(closedMessage));
  assert.equal(result.projectReads, 2);
  assert.equal(result.uploads, 1);
  assert.equal(result.removals, 1);
});

test('storage RLS errors remain upload errors even when the project is Active', async t => {
  const result = await submit(t, 'storage-denied');
  assert.match(result.ui.text(), /row-level security policy/);
  assert.ok(!result.ui.text().includes(closedMessage));
  assert.equal(result.projectReads, 1);
  assert.equal(result.inserts, 0);
});

test('application permission denial on an Active project is not labeled as closure', async t => {
  const result = await submit(t, 'insert-denied');
  assert.ok(!result.ui.text().includes(closedMessage));
  assert.ok(result.ui.text().includes(permissionError.message));
  assert.equal(result.projectReads, 2);
  assert.equal(result.removals, 1);
});

test('an unsuccessful status recheck does not claim the project is closed', async t => {
  const result = await submit(t, 'recheck-failed');
  assert.ok(!result.ui.text().includes(closedMessage));
  assert.ok(result.ui.text().includes(permissionError.message));
  assert.equal(result.removals, 1);
  assert.equal(result.ui.find(n => n.type === 'button' && n.props.type === 'submit').props.disabled, false);
});

test('initial project permission errors do not claim closure or upload a file', async t => {
  const result = await submit(t, 'project-read-denied');
  assert.match(result.ui.text(), /permission denied for table posts/);
  assert.ok(!result.ui.text().includes(closedMessage));
  assert.equal(result.uploads, 0);
});

test('duplicate submission recovery still displays the existing application', async t => {
  const result = await submit(t, 'duplicate');
  assert.match(result.ui.text(), /already applied/);
  assert.ok(!result.ui.text().includes(closedMessage));
  assert.equal(result.removals, 1);
  assert.equal(result.projectReads, 1);
});
