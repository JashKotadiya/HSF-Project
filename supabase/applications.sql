-- Run in Supabase → SQL Editor. Safe to re-run.
-- Lets volunteers apply to projects (answers + resume) and lets the
-- organization that owns a project review and approve/reject applicants.

-- 1) Columns the app stores on each application
alter table public.applications add column if not exists answers jsonb;
alter table public.applications add column if not exists applicant_name text;
alter table public.applications add column if not exists applicant_email text;

-- status: plain text with three values (converts an enum column if one exists)
alter table public.applications alter column status type text using status::text;

do $$
declare c record;
begin
  for c in
    select conname from pg_constraint
    where conrelid = 'public.applications'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%status%'
  loop
    execute format('alter table public.applications drop constraint %I', c.conname);
  end loop;
end $$;

update public.applications set status = lower(coalesce(status, 'pending'));
update public.applications set status = 'approved' where status in ('accepted', 'approve');
update public.applications set status = 'rejected' where status in ('declined', 'reject');
update public.applications set status = 'pending'
  where status not in ('pending', 'approved', 'rejected');

alter table public.applications alter column status set default 'pending';
alter table public.applications
  add constraint applications_status_check
  check (status in ('pending', 'approved', 'rejected'));

-- project_id must point at public.posts (where the app stores projects),
-- not the unused public.projects table. NOT VALID keeps any old rows.
do $$
declare c record;
begin
  for c in
    select conname from pg_constraint
    where conrelid = 'public.applications'::regclass
      and contype = 'f'
      and pg_get_constraintdef(oid) ilike '%(project_id)%'
  loop
    execute format('alter table public.applications drop constraint %I', c.conname);
  end loop;
end $$;

alter table public.applications
  add constraint applications_project_id_fkey
  foreign key (project_id) references public.posts (id) on delete cascade not valid;

-- One application per volunteer per project
create unique index if not exists applications_project_volunteer_key
  on public.applications (project_id, volunteer_id);

-- 2) Row-level security
alter table public.applications enable row level security;

drop policy if exists "applications_insert_own" on public.applications;
create policy "applications_insert_own"
  on public.applications for insert
  to authenticated
  with check (volunteer_id::text = auth.uid()::text);

drop policy if exists "applications_select_own" on public.applications;
create policy "applications_select_own"
  on public.applications for select
  to authenticated
  using (volunteer_id::text = auth.uid()::text);

drop policy if exists "applications_select_project_owner" on public.applications;
create policy "applications_select_project_owner"
  on public.applications for select
  to authenticated
  using (exists (
    select 1 from public.posts p
    where p.id::text = applications.project_id::text
      and p.user_id::text = auth.uid()::text
  ));

drop policy if exists "applications_update_project_owner" on public.applications;
create policy "applications_update_project_owner"
  on public.applications for update
  to authenticated
  using (exists (
    select 1 from public.posts p
    where p.id::text = applications.project_id::text
      and p.user_id::text = auth.uid()::text
  ))
  with check (exists (
    select 1 from public.posts p
    where p.id::text = applications.project_id::text
      and p.user_id::text = auth.uid()::text
  ));

-- 3) Private bucket for resumes: files live under "<volunteer uid>/..."
insert into storage.buckets (id, name, public)
values ('resumes', 'resumes', false)
on conflict (id) do nothing;

drop policy if exists "resumes_insert_own" on storage.objects;
create policy "resumes_insert_own"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'resumes'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "resumes_select_own" on storage.objects;
create policy "resumes_select_own"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'resumes'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "resumes_select_project_owner" on storage.objects;
create policy "resumes_select_project_owner"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'resumes'
    and exists (
      select 1
      from public.applications a
      join public.posts p on p.id::text = a.project_id::text
      where a.resume_path = storage.objects.name
        and p.user_id::text = auth.uid()::text
    )
  );
