const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('../../frontend/node_modules/typescript');
const { createClient } = require('../../frontend/node_modules/@supabase/supabase-js');

// Isolate hooks and navigation while exercising the real component handlers
// and Supabase HTTP serialization. These checks do not require a browser/server.
module.exports = function mountApplicationForm(fetch) {
  const hooks = [], effects = [], cleanups = [];
  let index = 0, tree;
  const root = path.join(__dirname, '../../frontend');
  const client = createClient('https://database.example.test', 'test-anon-key', {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch },
  });
  const react = {
    useState(initial) {
      const slot = index++;
      if (!(slot in hooks)) hooks[slot] = typeof initial === 'function' ? initial() : initial;
      return [hooks[slot], value => { hooks[slot] = typeof value === 'function' ? value(hooks[slot]) : value; }];
    },
    useEffect(fn, deps) {
      const slot = index++, previous = hooks[slot];
      if (!previous || deps.some((value, i) => !Object.is(value, previous[i]))) {
        effects.push(() => { cleanups[slot]?.(); cleanups[slot] = fn(); });
      }
      hooks[slot] = deps;
    },
    useCallback(fn, deps) {
      const slot = index++, previous = hooks[slot];
      if (!previous || deps.some((value, i) => !Object.is(value, previous.deps[i]))) hooks[slot] = { deps, fn };
      return hooks[slot].fn;
    },
  };
  const jsx = (type, props) => ({ type, props });
  function load(relative) {
    const compiled = ts.transpileModule(fs.readFileSync(path.join(root, relative), 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2020 },
    }).outputText;
    const exported = {};
    vm.runInNewContext(compiled, {
      exports: exported, Error, ArrayBuffer, Date,
      require(id) {
        if (id === 'react') return react;
        if (id === 'react/jsx-runtime') return { jsx, jsxs: jsx };
        if (id === 'next/link') return { default: 'Link' };
        if (id === '@/lib/supabase') return { default: client };
        if (id === '@/lib/applications') return load('src/lib/applications.ts');
        if (id === '@/components/auth/AuthProvider') return { useAuth: () => ({ user: { id: 'volunteer-1', email: 'volunteer@example.test' } }) };
        if (id === '@/components/applications/StatusBadge') return { default: 'StatusBadge' };
        throw new Error(`Unexpected import: ${id}`);
      },
    }, { filename: relative });
    return exported;
  }
  const Component = load('src/components/application/ApplicationForm.tsx').default;
  function render() { index = 0; tree = Component({ projectId: 'project-1', projectTitle: 'Community website' }); }
  async function settle() {
    for (let step = 0; step < 12; step++) {
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
      for (const child of node) { const found = find(predicate, child); if (found) return found; }
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
  function fill() {
    find(n => n.type === 'input' && n.props.placeholder === 'Jane Doe').props.onChange({ target: { value: 'Review Volunteer' } });
    render();
    for (let question = 0; question < 3; question++) {
      let position = 0;
      find(n => n.type === 'textarea' && position++ === question).props.onChange({ target: { value: `Test answer ${question}` } });
      render();
    }
    find(n => n.type === 'input' && n.props.type === 'file').props.onChange({ target: { files: [{
      name: 'resume.pdf', size: 4, type: 'application/pdf', arrayBuffer: async () => new ArrayBuffer(4),
    }] } });
    render();
  }
  return {
    settle, fill, text, find,
    submit: () => find(n => n.type === 'form').props.onSubmit({ preventDefault() {} }),
    dispose: () => { cleanups.forEach(fn => fn?.()); client.auth.stopAutoRefresh(); },
  };
};
