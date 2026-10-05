-- F19 Report intelligence (SPEC §9.1 F19): what the AI review (F17) adds after R1.
--
--   visits.proposed_from_report_id   a return visit Claude proposed from a Job Report (status 'Proposed' until
--                                    a PM approves or discards it; never pushed to Google while proposed)
--   projects.site_summary            the running AI site history (equipment, IPs, quirks, access), rewritten after
--   projects.site_summary_at         every reviewed report; no credentials in it
--   job_reports.issue_keys           short issue keys Claude gives the report's problems ("network-dropouts"), so
--                                    the 3rd report with the same key on a project raises a Root Cause task
--   job_reports.reality_flags        R3: what the report says vs the time clock, the visit and the van (stored when
--   visits.reality_flags             the report is reviewed; shown on the report, the visit, the calendar tile)

alter table public.visits add column proposed_from_report_id bigint references public.job_reports (id) on delete set null;
create index on public.visits (proposed_from_report_id) where proposed_from_report_id is not null;
alter table public.visits add column reality_flags jsonb;

alter table public.projects add column site_summary text, add column site_summary_at timestamptz;
comment on column public.projects.site_summary is 'F19: AI site history, rewritten after each reviewed Job Report (never credentials)';

alter table public.job_reports add column issue_keys text[] not null default '{}', add column reality_flags jsonb;
create index on public.job_reports using gin (issue_keys);
