-- Run in Supabase → SQL Editor. Safe to re-run.
-- Public buckets for logos and profile pictures; only the owner can write.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('avatars', 'avatars', true, 2097152, array['image/jpeg','image/png','image/webp']),
  ('logos',   'logos',   true, 2097152, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Files live under "<user uid>/..."
drop policy if exists "images_select_public" on storage.objects;
create policy "images_select_public" on storage.objects for select
  using (bucket_id in ('avatars', 'logos'));

drop policy if exists "images_insert_own" on storage.objects;
create policy "images_insert_own" on storage.objects for insert to authenticated
  with check (bucket_id in ('avatars', 'logos')
    and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "images_update_own" on storage.objects;
create policy "images_update_own" on storage.objects for update to authenticated
  using (bucket_id in ('avatars', 'logos')
    and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id in ('avatars', 'logos')
    and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "images_delete_own" on storage.objects;
create policy "images_delete_own" on storage.objects for delete to authenticated
  using (bucket_id in ('avatars', 'logos')
    and (storage.foldername(name))[1] = auth.uid()::text);

alter table public.profiles add column if not exists avatar_url text;
alter table public.posts    add column if not exists logo_url   text;git add supabase/media.sql
