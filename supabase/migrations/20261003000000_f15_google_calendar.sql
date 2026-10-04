-- F15 Google Calendar (Fred 2026-10-03, "years of calendar (visit) data feeds my current calendar"):
-- one shared Google calendar is connected by an administrator; its history is read into visits,
-- and from then on visits and events are kept in sync both ways (hourly tick + Sync now).
-- The connection itself (tokens encrypted, calendar id, colour → technician map, sync token, import
-- progress) lives in app_integrations under key 'google_calendar'.

-- Every event read from Google, as Google sent it, plus what the matching decided. Server-only
-- (service role): row-level security on, no policies, like app_integrations.
create table public.calendar_events (
  id text primary key,                       -- Google event id (instances of a series have their own)
  calendar_id text not null,
  status text,                               -- confirmed / tentative / cancelled
  summary text,
  description text,
  location text,
  color_id text,
  starts_at timestamptz,
  ends_at timestamptz,
  all_day boolean not null default false,
  google_updated timestamptz,
  etag text,
  recurring_event_id text,
  raw jsonb not null default '{}',
  -- new: not looked at yet · matched: became a visit with a project · unmatched: a visit without a
  -- project · skipped: not a job visit (AI said so) · ignored: an administrator left it out
  match_status text not null default 'new' check (match_status in ('new', 'matched', 'unmatched', 'skipped', 'ignored')),
  match_detail jsonb,
  visit_id bigint references public.visits (id) on delete set null,
  matched_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.calendar_events (match_status, starts_at);
create index on public.calendar_events (visit_id);
create index on public.calendar_events (starts_at);
alter table public.calendar_events enable row level security;
comment on table public.calendar_events is 'Google Calendar events as read (F15); the visit each one became';

-- The hourly tick records its Google step like the daily / hourly slots.
alter table public.scheduled_runs drop constraint scheduled_runs_kind_check;
alter table public.scheduled_runs add constraint scheduled_runs_kind_check check (kind in ('daily', 'hourly', 'google'));

-- The visit side of the link.
alter table public.visits
  add column google_event_id text,
  add column google_etag text,
  -- When the visit and its Google event last agreed. A visit is "dirty" (must be pushed) while
  -- updated_at > google_synced_at; google_mark_synced() sets both in the same transaction.
  add column google_synced_at timestamptz;
create unique index visits_google_event_id_key on public.visits (google_event_id) where google_event_id is not null;
create index visits_google_dirty_idx on public.visits (updated_at) where google_synced_at is null or updated_at > google_synced_at;

-- Mark visits as in step with Google. The before_write trigger stamps updated_at = now() in the same
-- transaction, so updated_at and google_synced_at come out equal and the row is clean.
create function public.google_mark_synced(p_ids bigint[], p_event_ids text[] default null, p_etags text[] default null)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  i int;
begin
  for i in 1 .. coalesce(array_length(p_ids, 1), 0) loop
    update public.visits
       set google_synced_at = now(),
           google_event_id = coalesce(p_event_ids[i], google_event_id),
           google_etag = coalesce(p_etags[i], google_etag)
     where id = p_ids[i];
  end loop;
end;
$$;
revoke all on function public.google_mark_synced(bigint[], text[], text[]) from public, anon, authenticated;
grant execute on function public.google_mark_synced(bigint[], text[], text[]) to service_role;

-- Visits that changed since they last agreed with Google (PostgREST can't compare two columns).
create function public.google_dirty_visits(p_limit int default 300)
returns setof bigint
language sql stable security definer set search_path = ''
as $$
  select id from public.visits
  where google_synced_at is null or updated_at > google_synced_at
  order by updated_at
  limit p_limit;
$$;
revoke all on function public.google_dirty_visits(int) from public, anon, authenticated;
grant execute on function public.google_dirty_visits(int) to service_role;
