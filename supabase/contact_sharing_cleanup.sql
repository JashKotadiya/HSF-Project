-- Run in Supabase → SQL Editor, AFTER supabase/contact_email_preferences.sql and AFTER every
-- function that emails volunteers finds them through their account instead of
-- applications.applicant_email (send-match-emails and send-custom-email already do;
-- send-status-email must be updated first, or its emails will stop).
--
-- applications.applicant_email held each applicant's login email, and it was shown
-- to the project owner without the applicant's choice. This stops that: existing
-- values are cleared and the column can no longer be filled in. The column itself is
-- kept so older code that still names it keeps working; it is always empty.
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

commit;