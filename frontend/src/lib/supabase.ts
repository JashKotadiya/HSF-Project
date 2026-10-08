import { createClient } from "@supabase/supabase-js";

// Prefer env; fallbacks help local dev when Turbopack caches stale env.
const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL || "https://cscgqbfuudafhkgauteq.supabase.co";
const supabaseAnonKey =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNzY2dxYmZ1dWRhZmhrZ2F1dGVxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ4MTExOTYsImV4cCI6MjA5MDM4NzE5Nn0.lm5mRUgTi1K1LOBo_yyqkwHBbM3knlA8uwgv0RfnqXQ";

/**
 * GoTrue uses the Web Locks API by default. React Strict Mode double-mounts
 * plus Navbar + home both touching auth on load can leave locks orphaned and
 * log "Lock was not released within 5000ms" / "Lock was stolen".
 * A tiny in-process queue serializes auth work instead of navigator.locks.
 */
let authLockTail: Promise<unknown> = Promise.resolve();

function authLock<R>(
  _name: string,
  _acquireTimeout: number,
  fn: () => Promise<R>
): Promise<R> {
  const next = authLockTail.then(() => fn());
  authLockTail = next.then(
    () => undefined,
    () => undefined
  );
  return next;
}

const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    lock: authLock,
  },
});

export default supabase;
