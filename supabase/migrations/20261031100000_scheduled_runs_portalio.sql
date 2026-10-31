-- PI-b fix (2026-10-31): the hourly tick claims a "portalio:<date>T<hh>" slot since the Portal.io
-- integration (2026-10-28), but scheduled_runs.kind only allowed the kinds listed in F20. Every tick
-- since then failed at that claim, which skipped the steps after it: record PDFs, queued AI reviews,
-- the 9 PM report reminders, the midnight report close, forgotten check-outs and the nightly backup.
-- The constraint now accepts any slot name, so a new kind never needs a migration again.
alter table public.scheduled_runs drop constraint if exists scheduled_runs_kind_check;
alter table public.scheduled_runs add constraint scheduled_runs_kind_check check (kind ~ '^[a-z][a-z0-9_]*$');
