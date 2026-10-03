-- F14 Merge duplicates (SPEC §9.1 F14-a): fold duplicate contacts or organizations into one record.
-- Everything that pointed at the merged records (projects, permits, transactions, interactions, notes,
-- files, checklist items, @tags…) now points at the kept one; blanks on the kept record are filled from
-- the merged ones; the merged records are soft-deleted (restorable from the trash as usual).
-- Needs Modify + Delete on the table; the merge is written to the history of every record involved.

alter table public.audit_log drop constraint audit_log_action_check;
alter table public.audit_log add constraint audit_log_action_check
  check (action in ('create', 'update', 'submit', 'unsubmit', 'archive', 'unarchive', 'delete', 'restore', 'merge'));

create function public.merge_records(p_table text, p_keep bigint, p_merge bigint[])
returns integer
language plpgsql security definer set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  merge_ids bigint[] := array(select distinct x from unnest(p_merge) x where x <> p_keep);
  fk record;
  col record;
  keep jsonb;
  src jsonb;
  k text;
  n integer := 0;
  cnt integer;
  self regclass := format('public.%I', p_table)::regclass;
begin
  if p_table not in ('contacts', 'organizations') then
    raise exception 'Only contacts and organizations can be merged' using errcode = '22023';
  end if;
  if uid is null or not (app.can_do(p_table, 'modify') and app.can_do(p_table, 'delete')) then
    raise exception 'You do not have permission to merge % records', p_table using errcode = '42501';
  end if;
  if coalesce(array_length(merge_ids, 1), 0) = 0 then
    raise exception 'Nothing to merge' using errcode = '22023';
  end if;
  execute format('select to_jsonb(t) from public.%I t where id = $1 and deleted_at is null', p_table) into keep using p_keep;
  if keep is null then
    raise exception 'The record to keep was not found' using errcode = '22023';
  end if;

  -- 1. Every foreign key that points at this table (projects, permits, transactions, interactions, …).
  for fk in
    select c.conrelid::regclass as child, a.attname as col
    from pg_constraint c
    join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any (c.conkey)
    where c.contype = 'f' and c.confrelid = self
  loop
    if fk.child = self then
      -- Self references (contact referred by contact): never make the merged rows point at the kept one.
      execute format('update %s set %I = $1 where %I = any ($2) and not (id = any ($2)) and id <> $1', fk.child, fk.col, fk.col) using p_keep, merge_ids;
    else
      execute format('update %s set %I = $1 where %I = any ($2)', fk.child, fk.col, fk.col) using p_keep, merge_ids;
    end if;
    get diagnostics cnt = row_count;
    n := n + cnt;
  end loop;

  -- 2. The platform tables keyed by (table_name, record_id).
  foreach k in array array['record_notes', 'record_comments', 'record_checklist_items', 'attachments', 'record_mentions'] loop
    execute format('update public.%I set record_id = $1 where table_name = $2 and record_id = any ($3)', k) using p_keep, p_table, merge_ids;
    get diagnostics cnt = row_count;
    n := n + cnt;
  end loop;

  -- 3. Blanks on the kept record take the first value the merged ones have (oldest first).
  for col in
    select column_name
    from information_schema.columns
    where table_schema = 'public' and table_name = p_table
      and column_name not in ('id', 'title', 'created_at', 'created_by', 'updated_at', 'updated_by', 'archived_at', 'deleted_at', 'locked', 'submitted_at')
  loop
    if keep -> col.column_name is null or keep ->> col.column_name = '' then
      execute format(
        'select to_jsonb(t) -> %L from public.%I t where id = any ($1) and to_jsonb(t) -> %L is not null and to_jsonb(t) ->> %L <> '''' order by id limit 1',
        col.column_name, p_table, col.column_name, col.column_name
      ) into src using merge_ids;
      if src is not null then
        execute format(
          'update public.%I set %I = (jsonb_populate_record(null::public.%I, jsonb_build_object(%L, $1::jsonb))).%I where id = $2',
          p_table, col.column_name, p_table, col.column_name, col.column_name
        ) using src, p_keep;
      end if;
    end if;
  end loop;

  -- 4. The merged records go to the trash, and everyone's history says what happened.
  execute format('update public.%I set deleted_at = now() where id = any ($1) and deleted_at is null', p_table) using merge_ids;
  insert into public.audit_log (table_name, record_id, action, changes, actor)
  values (p_table, p_keep, 'merge', jsonb_build_object('merged_from', jsonb_build_array(null, array_to_string(merge_ids, ', ')), 'references_moved', jsonb_build_array(null, n::text)), uid);
  insert into public.audit_log (table_name, record_id, action, changes, actor)
  select p_table, m, 'merge', jsonb_build_object('merged_into', jsonb_build_array(null, p_keep::text)), uid from unnest(merge_ids) m;
  return n;
end;
$$;
revoke execute on function public.merge_records(text, bigint, bigint[]) from public, anon;
grant execute on function public.merge_records(text, bigint, bigint[]) to authenticated;
