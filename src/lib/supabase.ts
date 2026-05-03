import { createClient } from '@supabase/supabase-js';

// Placeholders allow `next build` when env vars are unset (e.g. CI). Replace via .env.local for real use.
const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'https://placeholder.local';
const supabaseAnonKey =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? 'placeholder-anon-key';

const supabase = createClient(supabaseUrl, supabaseAnonKey);

export default supabase;
