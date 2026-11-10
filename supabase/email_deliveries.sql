-- Run in Supabase → SQL Editor. Safe to re-run.
-- Delivery tracking for notification emails (issue #72).
--
-- Each email the match-email function sends is tracked on its own, per application:
--   * a row is created when the function claims the email, so two requests cannot both send it;
--   * sent_at is filled in once the email has gone out;
--   * a claim that was never completed (the function crashed or timed out) can be taken over
--     after a few minutes, so a notification is never lost for good.
-- Tracking each email separately means a retry sends only what is still missing.

create table if not exists public.email_deliveries (
  application_id uuid not null references public.applications (id) on delete cascade,
  kind text not null,
  claimed_at timestamptz not null default now(),
  sent_at timestamptz,
  primary key (application_id, kind),
  constraint email_deliveries_kind_check check (
    kind in ('new_application_organization', 'new_application_volunteer', 'match_volunteer', 'match_organization')
  )
);

-- Only the Edge Functions (service role) use this table. There are deliberately no
-- policies, and no access for signed-in users or visitors.
alter table public.email_deliveries enable row level security;
revoke all on table public.email_deliveries from anon, authenticated;

-- Carry over what the older single-flag tracking recorded, so nothing that was already
-- sent is sent again. (The old columns stay in place and are no longer used.)
insert into public.email_deliveries (application_id, kind, claimed_at, sent_at)
select id, 'match_volunteer', match_emailed_at, match_emailed_at
from public.applications
where match_emailed_at is not null
on conflict (application_id, kind) do nothing;

insert into public.email_deliveries (application_id, kind, claimed_at, sent_at)
select id, 'match_organization', match_emailed_at, match_emailed_at
from public.applications
where match_emailed_at is not null
on conflict (application_id, kind) do nothing;

insert into public.email_deliveries (application_id, kind, claimed_at, sent_at)
select id, 'new_application_organization', poster_notified_at, poster_notified_at
from public.applications
where poster_notified_at is not null
on conflict (application_id, kind) do nothing;