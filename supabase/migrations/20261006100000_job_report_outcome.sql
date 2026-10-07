-- F17-e (SPEC §9.1): one line on how the visit ended, filled by the AI review when the technician left it blank.
alter table public.job_reports add column if not exists outcome text;
