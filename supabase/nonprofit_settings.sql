alter table public.profiles
  add column if not exists organization_name text;

alter table public.profiles
  add column if not exists mission_statement text;

alter table public.profiles
  add column if not exists description text;


create or replace function public.guard_profile_settings()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin

  if (select auth.uid()) is not null then

    if new.role is distinct from old.role then
      raise exception 'Profile role cannot be changed';
    end if;

    if old.role <> 'nonprofit' and (
      new.organization_name is distinct from old.organization_name
      or new.mission_statement is distinct from old.mission_statement
      or new.description is distinct from old.description
    ) then
      raise exception 'Only nonprofits can edit organization settings';
    end if;

  end if;

  return new;
end;
$$;

drop trigger if exists guard_profile_settings_update
on public.profiles;

create trigger guard_profile_settings_update
before update on public.profiles
for each row
execute function public.guard_profile_settings();
