-- Run in Supabase → SQL Editor ONLY AFTER:
--   1) contact_email_preferences.sql has been applied
--   2) send-status-email, send-match-emails, and send-custom-email are deployed
--      and resolve volunteers through auth.admin.getUserById
--
-- applications.applicant_email held each applicant's login email and was shown
-- to the project owner without the applicant's choice. This clears existing
-- values, keeps future writes empty, and stops authenticated clients from
-- reading the column. The column itself remains so older code that still names
-- it keeps working.
-- Safe to re-run.

begin;

-- The review-column guard blocks changing applicant_email, so pause it for the clean-up.
alter table public.applications disable trigger applications_protect_review_columns;
update public.applications set applicant_email = null where applicant_email is not null;
alter table public.applications enable trigger applications_protect_review_columns;

create or replace function public.clear_applicant_email()
returns trigger
language plpgsql
as $$
begin
  new.applicant_email := null;
  return new;
end;
$$;

drop trigger if exists applications_clear_applicant_email on public.applications;
create trigger applications_clear_applicant_email
  before insert or update on public.applications
  for each row execute function public.clear_applicant_email();

-- Prevent authenticated frontend clients from reading historical applicant_email values.
-- Keep the other application fields readable under their existing RLS policies.
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

commit;
