-- TC-b Timesheets (SPEC §9.1, Jessica via Fred 2026-10-21): a shift the timesheet flags (under 5 minutes,
-- clock-in / out / in within the same minute, over 14 hours, never closed, or closed by the system) stays
-- "to review" until someone who may edit Employees marks it reviewed. The mark lives on the shift's
-- clock-in entry; correcting the times instead makes the flag go away on its own.
alter table public.time_entries
  add column reviewed_at timestamptz,
  add column reviewed_by uuid references public.profiles (id) on delete set null;
comment on column public.time_entries.reviewed_at is 'TC-b: the office looked at the flagged shift that starts with this clock-in and accepted it as it is';
