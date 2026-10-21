-- J-q (Jessica 2026-10-21, item 2): the technician's own check-in / check-out times on the Job Report,
-- typed by hand. They live on the report only: the visit's checked_in_at / checked_out_at, the time clock
-- and the Report vs. reality comparison keep their own records and are never overwritten by these.
alter table public.job_reports
  add column if not exists tech_checked_in_at timestamptz,
  add column if not exists tech_checked_out_at timestamptz;
