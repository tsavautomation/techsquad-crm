-- ADM-b Usage (SPEC §9.1 ADM-b, Fred 2026-10-14: "metrics on how long, how many times, and last time any user has
-- logged in … over time, I can monitor how much time each one is spending on the system"). One row per person
-- per Eastern day, kept up to date by a heartbeat from the browser while the person is actively using the CRM.
create table public.usage_days (
  user_id uuid not null references public.profiles (id) on delete cascade,
  day date not null,
  first_at timestamptz not null,
  last_at timestamptz not null,
  active_seconds integer not null default 0,
  sessions integer not null default 1,
  pages integer not null default 0,
  primary key (user_id, day)
);
comment on table public.usage_days is 'ADM-b: per person and day: first and last activity, active time (heartbeats at most 3 min apart), sessions (gaps of 30 min start a new one), pages opened.';
create index usage_days_day_idx on public.usage_days (day);
alter table public.usage_days enable row level security;
create policy "user admins read" on public.usage_days for select to authenticated using (app.has_permission('site.admin.members'));
grant select on public.usage_days to authenticated;
