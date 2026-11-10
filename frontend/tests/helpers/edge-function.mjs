import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { createClient } from '@supabase/supabase-js';

const functionsDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../../supabase/functions');

const jsonResponse = (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });

// Runs a Supabase Edge Function's real source (supabase/functions/<name>/index.ts)
// without Deno: Deno.env and Deno.serve are supplied here, and its Supabase client
// is the real JavaScript client pointed at the mocked HTTP `fetch`. Returns the
// request handler the function registers with Deno.serve.
export function loadFunction(name, { env, fetch }) {
  const compiled = ts.transpileModule(fs.readFileSync(path.join(functionsDir, name, 'index.ts'), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
  }).outputText;

  let handler;
  vm.runInNewContext(compiled, {
    exports: {}, console, Response, Request, Headers, URL, TextEncoder, fetch,
    Deno: { env: { get: key => env[key] }, serve: fn => { handler = fn; } },
    require(id) {
      if (id === 'npm:@supabase/supabase-js@2') {
        return {
          createClient: (url, key) => createClient(url, key, {
            auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
            global: { fetch },
          }),
        };
      }
      throw new Error(`Unexpected import: ${id}`);
    },
  }, { filename: `${name}/index.ts` });

  if (!handler) throw new Error(`${name} did not call Deno.serve`);
  return handler;
}

// In-memory stand-in for the three services the functions talk to over HTTP:
// the database REST API, the Auth admin API, and the email provider. It records
// every request, so tests can also prove that something was NOT contacted.

// What identifies a row, for inserts that must not create a duplicate.
const PRIMARY_KEYS = { email_deliveries: ['application_id', 'kind'] };

export function createBackend({ tables = {}, users = {}, sessions = {}, emailFailures = [], failEmailsTo = new Set(), authFailures = [], tableFailures = [], beforeRequest, onChange } = {}) {
  const rows = Object.fromEntries(Object.entries(tables).map(([name, list]) => [name, structuredClone(list)]));
  const requests = [], emails = [], writes = [];
  let emailAttempts = 0;

  const matches = (row, searchParams) => [...searchParams].every(([key, value]) => {
    if (['select', 'order', 'limit', 'offset', 'columns', 'on_conflict'].includes(key)) return true;
    if (value.startsWith('eq.')) return String(row[key]) === value.slice(3);
    if (value.startsWith('lt.')) return row[key] != null && String(row[key]) < value.slice(3);
    if (value === 'is.null') return row[key] == null;
    throw new Error(`Unsupported filter in test backend: ${key}=${value}`);
  });
  const pick = (row, select) => {
    if (!select || select === '*') return { ...row };
    return Object.fromEntries(select.split(',').map(column => [column.trim(), row[column.trim()]]));
  };

  async function fetch(input, init = {}) {
    const url = new URL(typeof input === 'string' ? input : input.url);
    const method = init.method ?? 'GET';
    const headers = new Headers(init.headers);
    const body = init.body ? JSON.parse(init.body) : null;
    requests.push({ url, method, headers, body });
    beforeRequest?.({ url, method, rows });

    if (url.hostname === 'api.resend.com') {
      const attempt = emailAttempts++;
      if (emailFailures.includes(attempt) || failEmailsTo.has(body.to)) return jsonResponse({ message: 'provider down' }, 500);
      emails.push({ ...body, headers });
      return jsonResponse({ id: `email-${emails.length}` });
    }

    // The signed-in user behind a bearer token (what supabase.auth.getUser(jwt) asks).
    if (url.pathname === '/auth/v1/user') {
      const token = headers.get('Authorization')?.replace('Bearer ', '');
      const user = sessions[token];
      return user ? jsonResponse({ id: user.id, email: user.email, aud: 'authenticated', role: 'authenticated' }) : jsonResponse({ message: 'invalid JWT' }, 401);
    }

    const admin = url.pathname.match(/^\/auth\/v1\/admin\/users\/([^/]+)$/);
    if (admin) {
      if (authFailures.includes(admin[1])) return jsonResponse({ message: 'auth unavailable' }, 500);
      const email = users[admin[1]];
      return email ? jsonResponse({ id: admin[1], email }) : jsonResponse({ message: 'User not found' }, 404);
    }

    const table = url.pathname.match(/^\/rest\/v1\/([^/]+)$/)?.[1];
    // A table can fail for every request ('email_deliveries') or for one kind ('DELETE email_deliveries').
    if (table && (tableFailures.includes(table) || tableFailures.includes(`${method} ${table}`))) return jsonResponse({ message: `${table} unavailable` }, 500);
    if (table && rows[table]) {
      const found = rows[table].filter(row => matches(row, url.searchParams));
      const select = url.searchParams.get('select');
      if (method === 'GET') {
        if (headers.get('Accept')?.includes('vnd.pgrst.object')) {
          return found.length === 1
            ? jsonResponse(pick(found[0], select))
            : jsonResponse({ code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned' }, 406);
        }
        return jsonResponse(found.map(row => pick(row, select)));
      }
      const wantsRows = headers.get('Prefer')?.includes('return=representation');
      if (method === 'PATCH') {
        found.forEach(row => {
          const before = { ...row };
          Object.assign(row, body);
          onChange?.({ table, old: before, record: { ...row } });
        });
        writes.push({ table, method, filters: Object.fromEntries(url.searchParams), body, matched: found.length });
        return wantsRows ? jsonResponse(found.map(row => pick(row, select))) : new Response(null, { status: 204 });
      }
      if (method === 'DELETE') {
        rows[table] = rows[table].filter(row => !found.includes(row));
        writes.push({ table, method, filters: Object.fromEntries(url.searchParams), body: null, matched: found.length });
        return wantsRows ? jsonResponse(found.map(row => pick(row, select))) : new Response(null, { status: 204 });
      }
      if (method === 'POST') {
        const keys = PRIMARY_KEYS[table] ?? ['id'];
        const ignoreDuplicates = headers.get('Prefer')?.includes('resolution=ignore-duplicates');
        const inserted = [];
        for (const item of Array.isArray(body) ? body : [body]) {
          const exists = rows[table].some(row => keys.every(key => String(row[key]) === String(item[key])));
          if (exists && !ignoreDuplicates) return jsonResponse({ code: '23505', message: 'duplicate key value violates unique constraint' }, 409);
          if (exists) continue;
          const row = { sent_at: null, ...item };
          rows[table].push(row);
          inserted.push(row);
        }
        writes.push({ table, method, filters: {}, body, matched: inserted.length });
        return wantsRows ? jsonResponse(inserted.map(row => pick(row, select)), 201) : new Response(null, { status: 201 });
      }
    }
    throw new Error(`Unexpected request in test backend: ${method} ${url}`);
  }

  return {
    fetch, requests, emails, writes,
    emailAttempts: () => emailAttempts,
    rows: name => rows[name],
    // Calls that reached the database or Auth (the email provider is tracked separately).
    reads: () => requests.filter(request => request.url.hostname !== 'api.resend.com'),
  };
}