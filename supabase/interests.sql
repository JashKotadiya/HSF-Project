-- Run after profiles_signup.sql. Safe to rerun; existing profiles/posts are retained.
begin;

create table if not exists public.cause_categories (
  name text primary key check (name = trim(name) and name <> '')
);

insert into public.cause_categories (name) values
  ('Education'), ('Environment'), ('Health'), ('Human Services'),
  ('Arts & Culture'), ('Animal Welfare'), ('Community Development')
on conflict do nothing;

-- Keep existing project categories available without rewriting project data.
-- Spellings that differ only by letter case count as one category ("education" is
-- "Education"), because search already treats them as the same cause.
insert into public.cause_categories (name)
select distinct on (lower(trim(p.cause))) trim(p.cause)
from public.posts p
where nullif(trim(p.cause), '') is not null
  and not exists (select 1 from public.cause_categories c where lower(c.name) = lower(trim(p.cause)))
order by lower(trim(p.cause)), trim(p.cause) collate "C"
on conflict do nothing;

-- Existing project forms accept free-text causes. Register new values so those
-- projects remain discoverable through the same list used by volunteer profiles.
create or replace function public.register_project_cause()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if nullif(trim(new.cause), '') is not null then
    insert into public.cause_categories (name) values (trim(new.cause)) on conflict do nothing;
  end if;
  return new;
end;
$$;
revoke all on function public.register_project_cause() from public;
drop trigger if exists register_project_cause on public.posts;
create trigger register_project_cause after insert or update of cause on public.posts
for each row execute function public.register_project_cause();

alter table public.cause_categories enable row level security;
drop policy if exists cause_categories_read on public.cause_categories;
create policy cause_categories_read on public.cause_categories for select to anon, authenticated using (true);
grant select on public.cause_categories to anon, authenticated;

create table if not exists public.volunteer_interests (
  volunteer_id uuid not null references public.profiles(id) on delete cascade,
  cause text not null references public.cause_categories(name),
  primary key (volunteer_id, cause)
);

-- Databases set up by an earlier version of this script may already hold categories that
-- differ only by case. Merge each group into one spelling (the standard category if there
-- is one, otherwise the first in alphabetical order), moving volunteers' saved interests
-- with it. Projects keep their own cause text untouched. Does nothing when there are none.
create temporary table cause_category_merge on commit drop as
select name,
  first_value(name) over (
    partition by lower(name)
    order by (name in ('Education', 'Environment', 'Health', 'Human Services',
                       'Arts & Culture', 'Animal Welfare', 'Community Development')) desc,
             name collate "C"
  ) as keep
from public.cause_categories;

insert into public.volunteer_interests (volunteer_id, cause)
select distinct vi.volunteer_id, m.keep
from public.volunteer_interests vi
join cause_category_merge m on m.name = vi.cause
where m.name <> m.keep
on conflict do nothing;

delete from public.volunteer_interests vi
using cause_category_merge m
where vi.cause = m.name and m.name <> m.keep;

delete from public.cause_categories c
using cause_category_merge m
where c.name = m.name and m.name <> m.keep;

create unique index if not exists cause_categories_name_lower_key
  on public.cause_categories (lower(name));

alter table public.volunteer_interests enable row level security;
drop policy if exists volunteer_interests_own on public.volunteer_interests;
create policy volunteer_interests_own on public.volunteer_interests
for all to authenticated
using (
  volunteer_id = (select auth.uid())
  and exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.role = 'volunteer')
)
with check (
  volunteer_id = (select auth.uid())
  and exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.role = 'volunteer')
);
revoke all on public.volunteer_interests from anon;
grant select, insert, delete on public.volunteer_interests to authenticated;

-- Replace the caller's selection atomically; invalid categories roll back the
-- deletion, and no caller-supplied user ID can target a different volunteer.
create or replace function public.save_my_interests(p_causes text[])
returns setof public.volunteer_interests
language plpgsql security invoker set search_path = '' as $$
begin
  -- Serialize saves for this profile, including simultaneous first-time saves.
  perform 1 from public.profiles p
  where p.id = (select auth.uid()) and p.role = 'volunteer' for update;
  if not found then
    raise exception 'A volunteer account is required' using errcode = '42501';
  end if;
  delete from public.volunteer_interests where volunteer_id = (select auth.uid());
  -- Letter case does not matter ("education" is saved as "Education"). Anything that
  -- matches no category is kept as typed, so the foreign key rejects it.
  insert into public.volunteer_interests (volunteer_id, cause)
  select distinct (select auth.uid()), coalesce(c.name, selected.cause)
  from (select distinct trim(value) as cause from unnest(coalesce(p_causes, '{}'::text[])) value) selected
  left join public.cause_categories c on lower(c.name) = lower(selected.cause);
  return query select * from public.volunteer_interests where volunteer_id = (select auth.uid()) order by cause;
end;
$$;
revoke all on function public.save_my_interests(text[]) from public, anon;
grant execute on function public.save_my_interests(text[]) to authenticated;

commit;