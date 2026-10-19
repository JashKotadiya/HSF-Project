   -- Run in Supabase → SQL Editor. Safe to re-run.
   -- Records when the organization first opened an application. The
   -- send-status-email function emails the applicant when this goes from null to set.
   alter table public.applications add column if not exists viewed_at timestamptz;