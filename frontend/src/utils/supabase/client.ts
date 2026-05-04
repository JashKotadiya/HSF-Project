import { createBrowserClient } from '@supabase/ssr';

/** Defaults from `supabase start` — only used in development when env vars are missing. */
const LOCAL_DEV_URL = 'http://127.0.0.1:54321';
const LOCAL_DEV_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJpYXQiOjE2NDE3OTkyMDAsImV4cCI6MTk5NzM3NjAwMH0.EZYYvd_ADThRZ3fKyjeOGT63ZigAkNQwDiKH_pae3DE';

function getSupabaseBrowserConfig(): { url: string; anonKey: string } {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();

  if (url && anonKey) {
    return { url, anonKey };
  }

  if (process.env.NODE_ENV === 'development') {
    console.warn(
      '[supabase] NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY not set — using local Supabase defaults. For a hosted project, copy .env.example to .env.local and add your keys.'
    );
    return { url: LOCAL_DEV_URL, anonKey: LOCAL_DEV_ANON_KEY };
  }

  throw new Error(
    'Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY. Copy frontend/.env.example to frontend/.env.local and set your Supabase API values.'
  );
}

export function createClient() {
  const { url, anonKey } = getSupabaseBrowserConfig();
  return createBrowserClient(url, anonKey);
}
