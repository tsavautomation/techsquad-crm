-- F16 Report archive (Fred 2026-10-04, SPEC §9.1 F16): the old field reports in OneDrive
-- (PROJECTS TS / <designer or GC> / <client folder> / "…Reports" / files) become Job Reports and
-- Visits. One row per file found, with what the names said, what was read, and what was made of it.
-- Server-only (service role): row-level security on, no policies.
create table public.report_files (
  id text primary key,                        -- OneDrive item id
  gc_folder text not null,                    -- designer / general contractor folder
  client_folder text not null,
  folder text not null,                       -- the "…Reports" folder name
  name text not null,
  ext text,
  size bigint,
  modified timestamptz,
  parsed jsonb not null default '{}',         -- parseFileName + parseClientFolder
  -- new: found · read: text extracted and parsed · imported: a Job Report (and Visit) exists ·
  -- skipped: not a report, a duplicate, after the cutoff, unsupported · unmatched: no project found · error
  status text not null default 'new' check (status in ('new', 'read', 'imported', 'skipped', 'unmatched', 'error')),
  reason text,
  layout text,                                -- 123formbuilder / jotform / free / image
  extracted jsonb,                            -- the fields read from the file
  candidates jsonb,                           -- project scores when unmatched
  project_id bigint references public.projects (id) on delete set null,
  job_report_id bigint references public.job_reports (id) on delete set null,
  visit_id bigint references public.visits (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.report_files (status);
create index on public.report_files (client_folder);
create index on public.report_files (job_report_id);
alter table public.report_files enable row level security;
comment on table public.report_files is 'Old report files in OneDrive and what became of them (F16)';
