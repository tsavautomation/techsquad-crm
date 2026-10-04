-- PDF copies in OneDrive (Fred 2026-10-04, "as precaution if CRM goes offline, dump into the same
-- folder respecting the naming logic: job, technician, date"; SPEC §9.1 OD-c). Every record of a form
-- that can carry files gets a PDF of its text in its OneDrive folder, written on save and rewritten
-- on every change. This table remembers the OneDrive item per record, so a change replaces the same
-- file instead of adding another. Server-only (service role): row-level security on, no policies.
create table public.record_pdfs (
  table_name text not null,
  record_id bigint not null,
  item_id text not null,
  name text not null,
  folder text not null,
  -- The record's updated_at when the PDF was written: an older value means the PDF is stale.
  record_updated_at timestamptz not null,
  written_at timestamptz not null default now(),
  primary key (table_name, record_id)
);
create index on public.record_pdfs (written_at);
alter table public.record_pdfs enable row level security;
comment on table public.record_pdfs is 'PDF copy of a record in OneDrive (SPEC §9.1 OD-c)';
