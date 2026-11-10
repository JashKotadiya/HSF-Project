import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { createClient } from '@supabase/supabase-js';

const helperDirectory = path.dirname(fileURLToPath(import.meta.url));

const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');

export function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}

export function setup(t, settings = {}) {
  const requests = [], clients = [], clientOptions = [], events = [], redirects = [];
  const user = {
    id: '00000000-0000-0000-0000-000000000001', email: 'account@example.test',
    aud: 'authenticated', created_at: '2026-01-01T00:00:00Z', app_metadata: {},
    user_metadata: { role: settings.metadataRole ?? settings.role ?? 'volunteer' },
  };
  const expires = Math.floor(Date.now() / 1000) + 3600;
  const accessToken = `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ sub: user.id, exp: expires, role: 'authenticated' })}.c2lnbmF0dXJl`;
  const tokenResponse = { access_token: accessToken, refresh_token: 'test-refresh-token', token_type: 'bearer', expires_in: 3600, expires_at: expires, user };
  let authState = { loading: false, user: null, role: null };
  const modules = new Map();
  const fetch = async (input, init = {}) => {
    const url = new URL(input);
    const request = { path: url.pathname, method: init.method || 'GET', search: url.searchParams, body: init.body ? JSON.parse(init.body) : null, headers: new Headers(init.headers) };
    requests.push(request);
    if (url.pathname === '/auth/v1/token') {
      if (settings.badPassword) return json({ code: 'invalid_credentials', message: 'Invalid login credentials' }, 400);
      return json(tokenResponse);
    }
    if (url.pathname === '/rest/v1/profiles') {
      if (settings.beforeProfile) await settings.beforeProfile();
      if (settings.profileError) return json({ code: '42501', message: 'permission denied for table profiles' }, 403);
      return json(settings.missingProfile ? [] : { role: settings.role ?? 'volunteer' });
    }
    if (url.pathname === '/auth/v1/user') {
      if (settings.activationError) return json({ code: 'bad_jwt', message: 'Session activation failed' }, 401);
      return json(user);
    }
    if (url.pathname === '/auth/v1/logout') {
      if (settings.logoutError) return json({ code: 'unexpected_failure', message: 'Temporary logout failure' }, 500);
      return new Response(null, { status: 204 });
    }
    if (url.pathname === '/auth/v1/signup') return json(user);
    throw new Error(`Unexpected request: ${request.method} ${url}`);
  };

  let hookIndex = 0, tree;
  const hooks = [], effects = [], cleanups = [];
  const react = {
    useState(initial) {
      const index = hookIndex++;
      if (!(index in hooks)) hooks[index] = typeof initial === 'function' ? initial() : initial;
      return [hooks[index], value => { hooks[index] = typeof value === 'function' ? value(hooks[index]) : value; }];
    },
    useEffect(fn, deps) {
      const index = hookIndex++, previous = hooks[index];
      if (!previous || deps.some((value, i) => !Object.is(value, previous[i]))) effects.push(() => { cleanups[index]?.(); cleanups[index] = fn(); });
      hooks[index] = deps;
    },
  };
  const jsx = (type, props) => ({ type, props });
  const router = { replace: url => redirects.push(url) };
  function load(relative) {
    if (modules.has(relative)) return modules.get(relative);
    const compiled = ts.transpileModule(fs.readFileSync(path.join(helperDirectory, '../../src', relative), 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
    }).outputText;
    const exported = {};
    vm.runInNewContext(compiled, {
      exports: exported, Error, Date, URLSearchParams,
      process: { env: { NEXT_PUBLIC_SUPABASE_URL: 'https://database.example.test', NEXT_PUBLIC_SUPABASE_ANON_KEY: 'test-anon-key' } },
      window: { location: { href: 'http://localhost/', search: '' }, history: { replaceState() {} } },
      require(id) {
        if (id === '@supabase/supabase-js') return { createClient(url, key, options) {
          clientOptions.push(options);
          const client = createClient(url, key, { ...options, global: { fetch } });
          clients.push(client);
          return client;
        } };
        if (id.startsWith('@/lib/')) return load(id.slice(2) + '.ts');
        if (id === 'react') return react;
        if (id === 'react/jsx-runtime') return { jsx, jsxs: jsx, Fragment: 'Fragment' };
        if (id === 'next/navigation') return { useRouter: () => router };
        if (id === '@/components/auth/AuthProvider') return { useAuth: () => authState };
        throw new Error(`Unexpected import: ${id}`);
      },
    }, { filename: relative });
    modules.set(relative, exported);
    return exported;
  }
  const supabase = load('lib/supabase.ts').default;
  const { signInWithRole } = load('lib/signInWithRole.ts');
  const { normalizeRoleFromUser } = load('lib/roles.ts');
  const subscription = supabase.auth.onAuthStateChange((event, session) => {
    events.push(event);
    authState = {
      loading: false, user: session?.user ?? null,
      role: session ? normalizeRoleFromUser(settings.missingProfile ? null : { role: settings.role ?? 'volunteer' }, session.user) : null,
    };
  }).data.subscription;
  t.after(async () => {
    subscription.unsubscribe();
    cleanups.forEach(fn => fn?.());
    await Promise.all(clients.map(client => client.auth.stopAutoRefresh()));
  });

  let Page;
  function render() { Page ??= load('app/page.tsx').default; hookIndex = 0; tree = Page(); }
  async function settle() {
    for (let i = 0; i < 10; i++) {
      render();
      while (effects.length) effects.shift()();
      await new Promise(resolve => setImmediate(resolve));
    }
    render();
  }
  function find(predicate, node) {
    if (arguments.length === 1) node = tree;
    if (!node || typeof node !== 'object') return undefined;
    if (Array.isArray(node)) {
      for (const child of node) { const match = find(predicate, child); if (match) return match; }
      return undefined;
    }
    if (predicate(node)) return node;
    return find(predicate, node.props?.children);
  }
  function text(node) {
    if (arguments.length === 0) node = tree;
    if (node == null || typeof node === 'boolean') return '';
    if (typeof node !== 'object') return String(node);
    if (Array.isArray(node)) return node.map(text).join(' ');
    return text(node.props?.children);
  }
  return {
    supabase, signInWithRole, requests, clientOptions, events, redirects, user, accessToken,
    ui: {
      render, settle, find, text,
      click(label) { find(node => node.type === 'button' && text(node).trim() === label).props.onClick(); render(); },
      fill() {
        find(node => node.type === 'input' && node.props.type === 'email').props.onChange({ target: { value: user.email } }); render();
        find(node => node.type === 'input' && node.props.type === 'password').props.onChange({ target: { value: 'test-password' } }); render();
      },
      submit: () => find(node => node.type === 'form').props.onSubmit({ preventDefault() {} }),
    },
  };
}
