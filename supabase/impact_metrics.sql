-- Run in Supabase → SQL Editor. Safe to re-run.
-- Impact metrics for the HSF dashboard:
--   * total volunteer hours logged
--   * total completed projects (posts with status 'Closed')
--   * active organizations (owners with at least one 'Active' project)

-- 1) Hours logged against an approved application.
create table if not exists public.volunteer_hours (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.applications (id) on delete cascade,
  hours numeric(6, 2) not null check (hours > 0 and hours <= 1000),
  note text,
  logged_at timestamptz not null default now()
);

create index if not exists volunteer_hours_application_idx
  on public.volunteer_hours (application_id);

alter table public.volunteer_hours enable row level security;

-- A volunteer may log hours only against their own approved application.
drop policy if exists "volunteer_hours_insert_own" on public.volunteer_hours;
create policy "volunteer_hours_insert_own"
  on public.volunteer_hours for insert
  to authenticated
  with check (exists (
    select 1 from public.applications a
    where a.id = volunteer_hours.application_id
      and a.volunteer_id::text = auth.uid()::text
      and a.status = 'approved'
  ));

-- The volunteer and the project owner can read the hours; nobody else.
drop policy if exists "volunteer_hours_select_involved" on public.volunteer_hours;
create policy "volunteer_hours_select_involved"
  on public.volunteer_hours for select
  to authenticated
  using (exists (
    select 1 from public.applications a
    left join public.posts p on p.id::text = a.project_id::text
    where a.id = volunteer_hours.application_id
      and (
        a.volunteer_id::text = auth.uid()::text
        or p.user_id::text = auth.uid()::text
      )
  ));

revoke all on table public.volunteer_hours from anon;

-- 2) The metrics. SECURITY DEFINER lets the totals count every row even though
--    row-level security hides other people's rows, so it returns totals only.
create or replace function public.get_impact_metrics()
returns table (
  total_volunteer_hours numeric,
  total_completed_projects bigint,
  active_organizations bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    coalesce((select sum(h.hours) from public.volunteer_hours as h), 0),
    (select count(*) from public.posts as p where lower(p.status) = 'closed'),
    (select count(distinct p.user_id) from public.posts as p where lower(p.status) = 'active');
$$;

revoke all on function public.get_impact_metrics() from public;
grant execute on function public.get_impact_metrics() to anon, authenticated;