import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { createClient } from '@supabase/supabase-js';
import { formatDistanceToNow } from 'date-fns';

const source = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../src');
export const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
export function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}

// Exercise actual components and the real Supabase query builder with isolated
// hooks and HTTP. This is not a DOM renderer or a browser end-to-end test.
export function mount(t, filename, options) {
  const requests = [], confirmations = [], hooks = [], effects = [], cleanups = [];
  const modules = new Map(), listeners = new Map();
  let hookIndex = 0, tree, auth = options.auth;
  const client = createClient('https://database.example.test', 'test-anon-key', {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: async (input, init = {}) => {
      const url = new URL(input);
      const request = { url, method: init.method ?? 'GET', body: init.body ? JSON.parse(init.body) : null, headers: new Headers(init.headers) };
      requests.push(request);
      return options.fetch(request);
    } },
  });
  const react = {
    Suspense: 'Suspense',
    useState(initial) {
      const slot = hookIndex++;
      if (!(slot in hooks)) hooks[slot] = typeof initial === 'function' ? initial() : initial;
      return [hooks[slot], value => { hooks[slot] = typeof value === 'function' ? value(hooks[slot]) : value; }];
    },
    useRef(initial) {
      const slot = hookIndex++;
      if (!(slot in hooks)) hooks[slot] = { current: initial };
      return hooks[slot];
    },
    useEffect(fn, deps) {
      const slot = hookIndex++, previous = hooks[slot];
      if (!previous || deps.some((value, i) => !Object.is(value, previous[i]))) effects.push(() => { cleanups[slot]?.(); cleanups[slot] = fn(); });
      hooks[slot] = deps;
    },
    useMemo(fn, deps) {
      const slot = hookIndex++, previous = hooks[slot];
      if (!previous || deps.some((value, i) => !Object.is(value, previous.deps[i]))) hooks[slot] = { value: fn(), deps };
      return hooks[slot].value;
    },
  };
  const jsx = (type, props) => typeof type === 'function' ? type(props) : { type, props };
  function load(relative) {
    if (modules.has(relative)) return modules.get(relative);
    const compiled = ts.transpileModule(fs.readFileSync(path.join(source, relative), 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
    }).outputText;
    const exported = {};
    vm.runInNewContext(compiled, {
      exports: exported, console, Error, Date,
      window: {
        confirm(message) { confirmations.push(message); return options.confirm?.(message) ?? true; },
        addEventListener(name, fn) { listeners.set(name, fn); },
        removeEventListener(name, fn) { if (listeners.get(name) === fn) listeners.delete(name); },
      },
      require(id) {
        if (id === 'react') return react;
        if (id === 'react/jsx-runtime') return { jsx, jsxs: jsx };
        if (id === 'next/link') return { __esModule: true, default: 'Link' };
        if (id === 'next/navigation') return { useSearchParams: () => new URLSearchParams() };
        if (id === 'date-fns') return { formatDistanceToNow };
        if (id === '@/lib/supabase') return { __esModule: true, default: client };
        if (id === '@/components/auth/AuthProvider') return { useAuth: () => auth };
        if (id === '@/components/layout/PageHeader') return { __esModule: true, default: 'PageHeader' };
        if (id.startsWith('@/')) return load(id.slice(2) + (id.startsWith('@/lib/') ? '.ts' : '.tsx'));
        throw new Error(`Unexpected import: ${id}`);
      },
    }, { filename: relative });
    modules.set(relative, exported);
    return exported;
  }
  const Component = load(filename).default;
  function render() { hookIndex = 0; tree = Component(options.props ?? {}); }
  async function settle() {
    for (let step = 0; step < 8; step++) {
      render();
      while (effects.length) effects.shift()();
      await new Promise(resolve => setImmediate(resolve));
    }
    render();
  }
  function all(predicate, node) {
    if (arguments.length === 1) node = tree;
    if (!node || typeof node !== 'object') return [];
    if (Array.isArray(node)) return node.flatMap(child => all(predicate, child));
    return [...(predicate(node) ? [node] : []), ...(node.props?.children === undefined ? [] : all(predicate, node.props.children))];
  }
  function text(node) {
    if (arguments.length === 0) node = tree;
    if (node == null || typeof node === 'boolean') return '';
    if (typeof node !== 'object') return String(node);
    if (Array.isArray(node)) return node.map(child => text(child)).join(' ');
    return node.props?.children === undefined ? '' : text(node.props.children);
  }
  const find = predicate => all(predicate)[0];
  const button = label => find(node => node.type === 'button' && text(node).trim() === label);
  t.after(async () => { cleanups.forEach(fn => fn?.()); await client.auth.stopAutoRefresh(); });
  return { render, settle, all, find, text, button, requests, confirmations,
    setAuth(value) { auth = value; render(); },
    focus() { listeners.get('focus')?.(); },
    click(label) { const element = button(label); if (!element || element.props.disabled) throw new Error(`Unavailable button: ${label}`); return element.props.onClick(); },
  };
}
