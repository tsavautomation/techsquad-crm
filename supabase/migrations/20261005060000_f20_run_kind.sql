-- F20: the tick logs its forgotten-day step under its own kind.
alter table public.scheduled_runs drop constraint if exists scheduled_runs_kind_check;
alter table public.scheduled_runs add constraint scheduled_runs_kind_check check (kind in ('daily', 'hourly', 'google', 'reports_sms', 'reports_close', 'forgotten'));
