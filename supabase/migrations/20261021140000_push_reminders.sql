-- F27-b Push reminders (Fred 2026-10-21): to the person themselves, checked every five minutes.
--   1. the van (Bouncie) sat within 500 m of the job for 45 minutes and the visit has no check-in;
--   2. still clocked in past the group's reminder time (Field 5 PM, Office 6 PM);
--   3. no job report for an attended visit, at a minute between 7:00 and 7:30 PM that changes daily.
-- arrival_watch remembers when a van was first seen at each job; push_log remembers what was sent.

create table public.arrival_watch (
  visit_id bigint primary key references public.visits (id) on delete cascade,
  first_seen_at timestamptz not null,
  notified_at timestamptz
);
comment on table public.arrival_watch is 'F27-b: when the visit''s van was first seen within 500 m of the job (cleared on check-in)';
alter table public.arrival_watch enable row level security;
-- Service role only: no policies for authenticated.

-- Every active staff login gets the three reminders; an administrator can turn any off on Admin › Users.
update public.profiles
set push_events = (select array_agg(distinct k) from unnest(push_events || array['arrived_no_check_in', 'forgot_clock_out', 'missing_report']) as k)
where active and contact_id is null and email not like '%@example.invalid';

-- Every five minutes: the reminders. Same Vault secrets as crm-tick; the URL is the tick's with /push.
select cron.schedule(
  'crm-push',
  '*/5 * * * *',
  $$
  select net.http_get(
    url := replace((select decrypted_secret from vault.decrypted_secrets where name = 'crm_cron_url'), '/tick', '/push'),
    headers := jsonb_build_object('Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'crm_cron_secret')),
    timeout_milliseconds := 30000
  )
  where exists (select 1 from vault.decrypted_secrets where name = 'crm_cron_url')
    and exists (select 1 from vault.decrypted_secrets where name = 'crm_cron_secret');
  $$
);
