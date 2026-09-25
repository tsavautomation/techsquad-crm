-- M11: scheduled automations.
--
-- A timer calls the app's /api/cron/tick every hour: Supabase pg_cron + pg_net here
-- (Vercel's Hobby plan allows only one cron a day, which vercel.json keeps as a backup).
-- The URL and CRON_SECRET are read from Supabase Vault at run time, so no secret is in
-- this file. Set them once per project (see CLAUDE.md "Scheduled triggers"):
--   select vault.create_secret('https://<site>/api/cron/tick', 'crm_cron_url');
--   select vault.create_secret('<CRON_SECRET>', 'crm_cron_secret');

-- One row per Eastern-time slot ('daily:2026-09-25', 'hourly:2026-09-25T13'); the primary key
-- makes each slot run once however many times the timer calls.
create table public.scheduled_runs (
  key text primary key,
  kind text not null check (kind in ('daily', 'hourly')),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  result jsonb
);
alter table public.scheduled_runs enable row level security;
create policy "admins read" on public.scheduled_runs for select to authenticated using (app.has_permission('projects.module.design_triggers'));

-- Uploads that never became an attachment (form abandoned) and are older than p_hours.
create function public.orphan_uploads(p_hours int)
returns table (name text)
language sql stable security definer set search_path = ''
as $$
  select o.name
  from storage.objects o
  where o.bucket_id = 'attachments'
    and o.created_at < now() - make_interval(hours => p_hours)
    and not exists (select 1 from public.attachments a where a.provider_path = o.name)
  order by o.created_at
  limit 1000;
$$;
revoke execute on function public.orphan_uploads(int) from public, anon, authenticated;
grant execute on function public.orphan_uploads(int) to service_role;

create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

-- Every hour at :01. Does nothing until both Vault secrets exist.
select cron.schedule(
  'crm-tick',
  '1 * * * *',
  $$
  select net.http_get(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'crm_cron_url'),
    headers := jsonb_build_object('Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'crm_cron_secret')),
    timeout_milliseconds := 30000
  )
  where exists (select 1 from vault.decrypted_secrets where name = 'crm_cron_url')
    and exists (select 1 from vault.decrypted_secrets where name = 'crm_cron_secret');
  $$
);
