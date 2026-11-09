-- Run in Supabase → SQL Editor. Safe to re-run, and safe to run before anything else changes.
-- Optional contact sharing (issues #17 and #62).
--
-- A person's login email is private. Each account can instead choose a separate
-- contact email and decide whether to share it. Whoever the account holder is
-- connected to through an application (the volunteer or the project owner) can read
-- that address only while it is shared, and only while the application is pending
-- or approved. Notifications still go to the login email without sharing anything.

-- 1) Each account's optional contact address and sharing choice.
alter table public.profiles add column if not exists contact_email text;
alter table public.profiles add column if not exists share_contact boolean not null default false;

-- A blank address means "none", and there is nothing to share without one.
create or replace function public.normalize_contact_email()
returns trigger
language plpgsql
as $$
begin
  new.contact_email := nullif(lower(btrim(new.contact_email)), '');
  if new.contact_email is null then
    new.share_contact := false;
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_normalize_contact on public.profiles;
create trigger profiles_normalize_contact
  before insert or update on public.profiles
  for each row execute function public.normalize_contact_email();

alter table public.profiles drop constraint if exists profiles_contact_email_check;
alter table public.profiles
  add constraint profiles_contact_email_check
  check (
    contact_email is null
    or (
      char_length(contact_email) <= 254
      and contact_email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
    )
  );

-- Profiles stay private: the existing policies let people read and edit only their
-- own row, so these two columns are changed only by the account holder.

-- 2) The shared contact of the other person on an application.
--    SECURITY DEFINER lets the lookup read the other person's profile; the checks
--    below decide who may see what. It returns only the address, or null.
create or replace function public.get_shared_contact(p_application_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select pr.contact_email
  from public.applications as a
  join public.posts as p on p.id::text = a.project_id::text
  join public.profiles as pr on pr.id::text = case
    when a.volunteer_id::text = (select auth.uid())::text then p.user_id::text
    else a.volunteer_id::text
  end
  where a.id = p_application_id
    -- only the applicant and the project owner can ask
    and (select auth.uid())::text in (a.volunteer_id::text, p.user_id::text)
    -- sharing is available while the application is pending or approved
    and a.status in ('pending', 'approved')
    -- and only for an address its owner chose to share
    and pr.share_contact
    and nullif(btrim(pr.contact_email), '') is not null
  limit 1;
$$;

revoke all on function public.get_shared_contact(uuid) from public, anon;
grant execute on function public.get_shared_contact(uuid) to authenticated;