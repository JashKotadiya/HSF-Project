-- Run in Supabase SQL Editor. Safe to re-run.
-- Adds editable volunteer profile details and protects each volunteer's data.

alter table public.profiles add column if not exists full_name text;
alter table public.profiles add column if not exists bio text;
alter table public.profiles add column if not exists technical_skills jsonb default '[]'::jsonb;
alter table public.profiles add column if not exists resume_path text;

drop policy if exists "resumes_update_own" on storage.objects;
create policy "resumes_update_own"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'resumes' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'resumes' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "resumes_delete_own" on storage.objects;
create policy "resumes_delete_own"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'resumes' and (storage.foldername(name))[1] = auth.uid()::text);
