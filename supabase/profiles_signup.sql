-- Run in Supabase → SQL Editor (adjust table/column names if yours differ).
-- Fixes: "new row violates row-level security policy for table profiles"

-- 1) Let authenticated users manage their own row (typical app pattern)
alter table public.profiles enable row level security;

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own"
  on public.profiles for select
  to authenticated
  using (auth.uid() = id);

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own"
  on public.profiles for insert
  to authenticated
  with check (auth.uid() = id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
  on public.profiles for update
  to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- 2) Optional: create profile when Auth user is created (works even when email
--    confirmation means the browser has no session yet). Uses SECURITY DEFINER
--    so it bypasses RLS. Map metadata role → profiles.role (nonprofit | volunteer).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  r text;
begin
  r := lower(coalesce(new.raw_user_meta_data->>'role', 'volunteer'));
  if r in ('nonprofit', 'organization', 'org') then
    r := 'nonprofit';
  else
    r := 'volunteer';
  end if;

  insert into public.profiles (id, role)
  select new.id, r::text
  where not exists (select 1 from public.profiles p where p.id = new.id);

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
