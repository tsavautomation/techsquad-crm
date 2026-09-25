-- M4 part 1: what every record table shares (SPEC §1.3, CLAUDE.md "Database conventions").
--
--   app.record_types   one row per record table: which permission keys protect it
--   app.perm_key()     builds e.g. 'projects.contacts.modify' for a table + action
--   app.can_view_all() / app.can_view_page() / app.can_do()   used by RLS policies
--   app.record_before_write()  trigger: stamps who/when, enforces lock/archive/delete rights
--   app.record_audit()         trigger: writes the change history
--   attachments, record_notes, record_comments, record_checklist_items, audit_log
--
-- Engines (workflows, automations, imports) run with the service role, where
-- auth.uid() is null; the triggers then skip permission checks but still audit.

-- ---------------------------------------------------------------- record type catalogue

create table app.record_types (
  table_name text primary key,
  label text not null,
  module text not null,
  -- permission resource, e.g. 'contacts' → projects.contacts.*; null for utility lists
  resource text,
  parent_table text,
  parent_column text,
  -- resource holding the module-level lock permissions (Records: Modify Locked …)
  lock_resource text,
  sensitive_columns text[] not null default '{}'
);
comment on table app.record_types is 'Filled by the generated m4_record_tables migration from src/registry.';

create function app.perm_key(p_table text, p_action text)
returns text
language sql stable security definer set search_path = ''
as $$
  -- Child tables (sub-grids) use their parent's permissions.
  select coalesce(p.module, r.module) || '.' || coalesce(p.resource, r.resource) || '.' || p_action
  from app.record_types r
  left join app.record_types p on p.table_name = r.parent_table
  where r.table_name = p_table and coalesce(p.resource, r.resource) is not null;
$$;

create function app.lock_key(p_table text, p_action text)
returns text
language sql stable security definer set search_path = ''
as $$
  select coalesce(p.module, r.module) || '.' || coalesce(p.lock_resource, r.lock_resource) || '.' || p_action
  from app.record_types r
  left join app.record_types p on p.table_name = r.parent_table
  where r.table_name = p_table;
$$;

create function app.is_utility(p_table text)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from app.record_types where table_name = p_table and resource is null and parent_table is null);
$$;

-- Utility lists (brands, suppliers, KB categories) are managed on WebAuthor's "Utility Tables" pages.
create function app.can_manage_utility()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select app.has_permission('projects.module.options_utility_tables')
      or app.has_permission('administrative.module.options_utility_tables')
      or app.has_permission('inventory.module.options_utility_tables')
      or app.has_permission('help-desk.module.options_utility_tables');
$$;

create function app.can_view_all(p_table text)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select case when app.is_utility(p_table) then auth.uid() is not null
              else coalesce(app.has_permission(app.perm_key(p_table, 'view_all')), false) end;
$$;

create function app.can_view_page(p_table text)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select case when app.is_utility(p_table) then auth.uid() is not null
              else coalesce(app.has_permission(app.perm_key(p_table, 'view_page')), false) end;
$$;

create function app.can_do(p_table text, p_action text)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select case
    when app.is_utility(p_table) then app.can_manage_utility()
    -- Adding/removing sub-grid rows counts as modifying the parent record.
    when exists (select 1 from app.record_types where table_name = p_table and parent_table is not null)
         and p_action in ('create', 'delete') then coalesce(app.has_permission(app.perm_key(p_table, 'modify')), false)
    else coalesce(app.has_permission(app.perm_key(p_table, p_action)), false)
  end;
$$;

create function app.can_lock_action(p_table text, p_action text)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select app.is_sysadmin() or coalesce(app.has_permission(app.lock_key(p_table, p_action)), false);
$$;

revoke execute on all functions in schema app from public, anon;
grant execute on all functions in schema app to authenticated;

-- ---------------------------------------------------------------- write guard

create function app.record_before_write()
returns trigger
language plpgsql security invoker set search_path = ''
as $$
declare
  uid uuid := auth.uid();
begin
  if tg_op = 'INSERT' then
    new.created_at := now();
    new.updated_at := now();
    if uid is not null then
      new.created_by := uid;
      new.updated_by := uid;
      -- Users create plain records; submitting, archiving and deleting are separate steps.
      new.locked := false;
      new.submitted_at := null;
      new.archived_at := null;
      new.deleted_at := null;
    end if;
    return new;
  end if;

  -- UPDATE
  new.created_at := old.created_at;
  new.created_by := old.created_by;
  new.updated_at := now();
  if uid is not null then
    new.updated_by := uid;
  end if;
  if uid is null then
    return new; -- engines are trusted
  end if;

  -- Someone allowed only to archive or delete may not edit the record's fields in the same step.
  if not app.can_do(tg_table_name, 'modify')
     and (to_jsonb(new) - array['updated_at', 'updated_by', 'archived_at', 'deleted_at'])
         is distinct from (to_jsonb(old) - array['updated_at', 'updated_by', 'archived_at', 'deleted_at']) then
    raise exception 'You do not have permission to change % records', tg_table_name using errcode = '42501';
  end if;

  if new.deleted_at is distinct from old.deleted_at then
    if not app.can_do(tg_table_name, 'delete') then
      raise exception 'You do not have permission to delete % records', tg_table_name using errcode = '42501';
    end if;
    if old.locked and not app.can_lock_action(tg_table_name, 'delete_locked') then
      raise exception 'This record is locked' using errcode = '42501';
    end if;
  end if;

  if new.archived_at is distinct from old.archived_at and not app.can_do(tg_table_name, 'archive') then
    raise exception 'You do not have permission to archive % records', tg_table_name using errcode = '42501';
  end if;

  if new.locked is distinct from old.locked then
    -- Submitting (lock + stamp submitted_at in one step) only needs Modify, which RLS already checked.
    if not (new.locked and new.submitted_at is not null and old.submitted_at is null)
       and not app.can_lock_action(tg_table_name, 'lock_unlock') then
      raise exception 'You do not have permission to lock or unlock records' using errcode = '42501';
    end if;
  elsif old.locked and new.deleted_at is not distinct from old.deleted_at
        and not app.can_lock_action(tg_table_name, 'modify_locked') then
    raise exception 'This record is locked' using errcode = '42501';
  end if;

  return new;
end;
$$;

-- ---------------------------------------------------------------- change history

create table public.audit_log (
  id bigint generated by default as identity primary key,
  table_name text not null,
  record_id bigint not null,
  action text not null check (action in ('create', 'update', 'submit', 'unsubmit', 'archive', 'unarchive', 'delete', 'restore')),
  -- { column: [old, new] }; sensitive columns show '***'
  changes jsonb not null default '{}',
  actor uuid references public.profiles (id) on delete set null,
  at timestamptz not null default now()
);
create index audit_log_record_idx on public.audit_log (table_name, record_id, at desc);

create function app.record_audit()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  hidden text[] := coalesce((select sensitive_columns from app.record_types where table_name = tg_table_name), '{}');
  diff jsonb;
  act text;
begin
  select coalesce(jsonb_object_agg(
           n.key,
           case when n.key = any (hidden) then '["***", "***"]'::jsonb else jsonb_build_array(o.value, n.value) end
         ), '{}')
    into diff
  from jsonb_each(to_jsonb(new)) n
  left join jsonb_each(case when tg_op = 'UPDATE' then to_jsonb(old) else '{}'::jsonb end) o using (key)
  where n.value is distinct from o.value
    and n.key not in ('updated_at', 'updated_by', 'created_at', 'created_by');

  if tg_op = 'INSERT' then
    act := 'create';
  elsif new.deleted_at is distinct from old.deleted_at then
    act := case when new.deleted_at is null then 'restore' else 'delete' end;
  elsif new.archived_at is distinct from old.archived_at then
    act := case when new.archived_at is null then 'unarchive' else 'archive' end;
  elsif new.submitted_at is not null and old.submitted_at is null then
    act := 'submit';
  elsif old.locked and not new.locked and new.submitted_at is null then
    act := 'unsubmit';
  else
    act := 'update';
  end if;

  if act = 'update' and diff = '{}'::jsonb then
    return null; -- nothing changed
  end if;

  insert into public.audit_log (table_name, record_id, action, changes, actor)
  values (tg_table_name, new.id, act, diff, auth.uid());
  return null;
end;
$$;

-- ---------------------------------------------------------------- generic record features
-- Keyed by (table_name, record_id). Visible to anyone who can see the record itself.

create function app.record_visible(p_table text, p_id bigint)
returns boolean
language plpgsql stable security invoker set search_path = ''
as $$
declare
  ok boolean;
begin
  if not exists (select 1 from app.record_types where table_name = p_table) then
    return false;
  end if;
  -- Runs as the caller, so the record table's own RLS decides.
  execute format('select exists (select 1 from public.%I where id = $1)', p_table) into ok using p_id;
  return ok;
end;
$$;
grant execute on function app.record_visible(text, bigint) to authenticated;

create table public.attachments (
  id uuid primary key default gen_random_uuid(),
  table_name text not null,
  record_id bigint not null,
  -- which upload field on the record; null = the record's general Files pod
  field text,
  provider text not null default 'supabase' check (provider in ('supabase', 'onedrive', 'gdrive')),
  provider_path text not null,
  file_name text not null,
  mime_type text,
  size_bytes bigint,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid() references public.profiles (id) on delete set null,
  deleted_at timestamptz
);
create index attachments_record_idx on public.attachments (table_name, record_id, field);

create table public.record_notes (
  id bigint generated by default as identity primary key,
  table_name text not null,
  record_id bigint not null,
  body text not null,
  follow_up_date date,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid() references public.profiles (id) on delete set null
);
create index record_notes_record_idx on public.record_notes (table_name, record_id, created_at desc);

create table public.record_comments (
  id bigint generated by default as identity primary key,
  table_name text not null,
  record_id bigint not null,
  field text,
  body text not null,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid() references public.profiles (id) on delete set null
);
create index record_comments_record_idx on public.record_comments (table_name, record_id);

create table public.record_checklist_items (
  id bigint generated by default as identity primary key,
  table_name text not null,
  record_id bigint not null,
  item text not null,
  assigned_to uuid references public.profiles (id) on delete set null,
  due_date date,
  completed_at timestamptz,
  completed_by uuid references public.profiles (id) on delete set null,
  -- where it came from, e.g. 'job_reports:123' (SPEC §5.3)
  source text,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid() references public.profiles (id) on delete set null
);
create index record_checklist_record_idx on public.record_checklist_items (table_name, record_id);

alter table public.audit_log enable row level security;
alter table public.attachments enable row level security;
alter table public.record_notes enable row level security;
alter table public.record_comments enable row level security;
alter table public.record_checklist_items enable row level security;

create policy "read history of visible records" on public.audit_log
  for select to authenticated using (app.record_visible(table_name, record_id));
-- No insert/update/delete policies: only the audit trigger writes here.

-- Attachments / notes / comments / checklist: read and add on visible records; authors edit their own.
-- (M8 refines delete rights with the Files/Notes permissions from SPEC §7.4.)
create policy "read" on public.attachments for select to authenticated using (app.record_visible(table_name, record_id));
create policy "add" on public.attachments for insert to authenticated
  with check (created_by = auth.uid() and app.record_visible(table_name, record_id));
create policy "own" on public.attachments for update to authenticated
  using (created_by = auth.uid() or app.is_sysadmin()) with check (app.record_visible(table_name, record_id));

create policy "read" on public.record_notes for select to authenticated using (app.record_visible(table_name, record_id));
create policy "add" on public.record_notes for insert to authenticated
  with check (created_by = auth.uid() and app.record_visible(table_name, record_id));
create policy "own" on public.record_notes for update to authenticated
  using (created_by = auth.uid() or app.is_sysadmin()) with check (app.record_visible(table_name, record_id));
create policy "own delete" on public.record_notes for delete to authenticated
  using (created_by = auth.uid() or app.is_sysadmin());

create policy "read" on public.record_comments for select to authenticated using (app.record_visible(table_name, record_id));
create policy "add" on public.record_comments for insert to authenticated
  with check (created_by = auth.uid() and app.record_visible(table_name, record_id));
create policy "own" on public.record_comments for update to authenticated
  using (created_by = auth.uid() or app.is_sysadmin()) with check (app.record_visible(table_name, record_id));

create policy "read" on public.record_checklist_items for select to authenticated using (app.record_visible(table_name, record_id));
create policy "add" on public.record_checklist_items for insert to authenticated
  with check (created_by = auth.uid() and app.record_visible(table_name, record_id));
-- Anyone who can see the record can tick items off.
create policy "tick" on public.record_checklist_items for update to authenticated
  using (app.record_visible(table_name, record_id)) with check (app.record_visible(table_name, record_id));
