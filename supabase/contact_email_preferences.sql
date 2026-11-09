
-- Optional contact email sharing for HSF.
-- Sharing is off unless explicitly enabled.

alter table public.profiles
  add column if not exists contact_email text;

alter table public.profiles
  add column if not exists share_contact_email boolean
    not null default false;

-- Normalize existing empty addresses.
update public.profiles
set contact_email = null
where contact_email is not null
  and btrim(contact_email) = '';

-- Validate optional contact addresses.
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'profiles_contact_email_format'
      and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
      add constraint profiles_contact_email_format
      check (
        contact_email is null
        or (
          length(contact_email) <= 254
          and contact_email ~*
            '^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$'
        )
      );
  end if;
end;
$$;

-- Secure contact lookup for one application.
-- The caller must be the applicant or project owner.
-- A pending application is eligible for contact sharing.
-- Login emails are never used as fallback values.

create or replace function
  public.get_application_contact_email(
    p_application_id text
  )
returns table(contact_email text)
language sql
stable
security definer
set search_path = ''
as $$
  select
    case
      when a.volunteer_id = (select auth.uid())
        and org.share_contact_email = true
        then nullif(btrim(org.contact_email), '')

      when p.user_id = (select auth.uid())
        and vol.share_contact_email = true
        then nullif(btrim(vol.contact_email), '')

      else null
    end as contact_email

  from public.applications a
  join public.posts p
    on p.id = a.project_id

  left join public.profiles vol
    on vol.id = a.volunteer_id

  left join public.profiles org
    on org.id = p.user_id

  where a.id::text = p_application_id
    and (select auth.uid()) is not null
    and (
      a.volunteer_id = (select auth.uid())
      or p.user_id = (select auth.uid())
    )
  limit 1;
$$;

-- The RPC is callable only by authenticated users.
-- Its internal query verifies application membership.

revoke all on function
  public.get_application_contact_email(text)
from public, anon, authenticated;

grant execute on function
  public.get_application_contact_email(text)
to authenticated;

-- Prevent authenticated frontend clients from
-- reading historical applicant_email values.
--
-- Keep the other application fields readable under
-- their existing row-level security policies.

revoke select on table public.applications
from public, anon, authenticated;

do $$
declare
  allowed_columns text;
begin
  select string_agg(format('%I', column_name), ', ')
  into allowed_columns
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'applications'
    and column_name <> 'applicant_email';

  if allowed_columns is not null then
    execute format(
      'grant select (%s) on public.applications to authenticated',
      allowed_columns
    );
  end if;
end;
$$;
