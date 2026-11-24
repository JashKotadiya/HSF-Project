-- Run in Supabase → SQL Editor. Safe to re-run.
-- Daily usage limits for the AI help assistant prototype (issue #106).
--
-- The help-assistant Edge Function counts every question here before calling the AI
-- provider, per signed-in user and across the whole site, so the free quota (and cost)
-- cannot be exhausted by one person or by a script. Only the Edge Function (service role)
-- touches this table. It stores counters only: never questions, answers, or user details
-- beyond the account id that the limit applies to.

create table if not exists public.help_assistant_usage (
  scope text primary key,           -- e.g. 'user:<id>:2026-11-20' or 'global:2026-11-20'
  count integer not null default 0,
  created_at timestamptz not null default now()
);

alter table public.help_assistant_usage enable row level security;
revoke all on table public.help_assistant_usage from anon, authenticated;

-- Takes one use from a counter. Returns true if it was allowed, false once p_limit is
-- reached. One statement, so simultaneous requests cannot go past the limit.
create or replace function public.help_assistant_take(p_scope text, p_limit integer)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  used integer;
begin
  if p_limit is null or p_limit < 1 then
    return false;
  end if;
  insert into public.help_assistant_usage as u (scope, count)
  values (p_scope, 1)
  on conflict (scope) do update set count = u.count + 1
    where u.count < p_limit
  returning u.count into used;
  return used is not null;
end;
$$;

revoke all on function public.help_assistant_take(text, integer) from public, anon, authenticated;
grant execute on function public.help_assistant_take(text, integer) to service_role;
