-- OneDrive integration (Fred 2026-09-30, Phase 2 item 1): every attachment except signatures goes to
-- one personal OneDrive, in TechSquad CRM / Projects / <project> / <form> / <date>.
-- All three tables are for the server only (service role): row-level security on, no policies.

-- Connection settings, e.g. key 'onedrive' → { refresh_token (encrypted), account, drive_id, root, connected_at }.
create table public.app_integrations (
  key text primary key,
  data jsonb not null default '{}',
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id) on delete set null
);
alter table public.app_integrations enable row level security;

-- One row per file being sent from a phone: the resumable upload session, until the record is saved.
create table public.onedrive_uploads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  table_name text not null,
  field text not null,
  file_name text not null,
  mime_type text,
  size_bytes bigint not null,
  upload_url text not null,
  item_id text,
  status text not null default 'open' check (status in ('open', 'done', 'attached', 'abandoned')),
  created_at timestamptz not null default now()
);
create index onedrive_uploads_status_idx on public.onedrive_uploads (status, created_at);
alter table public.onedrive_uploads enable row level security;

-- Folder path → OneDrive item id, so folders are looked up once.
create table public.onedrive_folders (
  path text primary key,
  item_id text not null,
  created_at timestamptz not null default now()
);
alter table public.onedrive_folders enable row level security;

-- Where a OneDrive file lives (for people browsing OneDrive directly).
alter table public.attachments add column provider_folder text;
