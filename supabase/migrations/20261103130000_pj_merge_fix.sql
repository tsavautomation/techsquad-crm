-- PJ-b fix (2026-11-03, found by supabase/tests/pj_merge.sql): merge_project() tried to update the view
-- portal_my_apps (information_schema.columns lists views too) and unmerge_project() wrote an audit action
-- the check constraint did not allow.
alter table public.audit_log drop constraint audit_log_action_check;
alter table public.audit_log add constraint audit_log_action_check
  check (action in ('create', 'update', 'submit', 'unsubmit', 'archive', 'unarchive', 'delete', 'restore', 'merge', 'unmerge'));

create or replace function public.merge_project(p_from bigint, p_into bigint, p_reason text)
returns bigint
language plpgsql security definer set search_path = ''
as $$
declare
  v_links constant text[][] := array[
    ['visits', 'project_id'], ['job_reports', 'project_id'], ['report_files', 'project_id'], ['report_deficiencies', 'project_id'],
    ['tasks', 'project_id'], ['transactions', 'project_id'], ['inventory_checkouts', 'project_id'], ['stock_items', 'destination_project_id'],
    ['stock_items', 'purchased_for_project_id'], ['sales', 'destination_project_id'], ['rmas', 'project_id'], ['permits', 'project_id'],
    ['punch_list_items', 'project_id'], ['tv_installations', 'project_id'], ['service_requests', 'project_id'], ['project_requests', 'project_id'],
    ['project_events', 'project_id'], ['mail_messages', 'project_id'], ['contact_interactions', 'project_id'], ['form_notes', 'project_id'],
    ['staff_performance', 'project_id'], ['wa_conversations', 'project_id'], ['portal_proposals', 'project_id'], ['sheet_proposals', 'project_id'],
    ['survey_proposals', 'project_id'], ['portal_documents', 'project_id'], ['portal_my_apps', 'project_id']
  ];
  v_generic constant text[] := array['attachments', 'audit_log', 'record_notes', 'record_comments', 'record_checklist_items', 'workflow_events', 'record_pdfs', 'record_mentions', 'sensitive_reveals', 'onedrive_uploads'];
  v_pairs constant text[][] := array[['portal_document_projects', 'document_id'], ['portal_app_projects', 'app_id'], ['portal_access', 'contact_id']];
  v_moved jsonb := '{}'::jsonb;
  v_ids jsonb;
  v_rows jsonb;
  v_pair text[];
  v_tbl text;
  v_id bigint;
begin
  if p_from = p_into then raise exception 'A project cannot be merged into itself'; end if;
  if auth.uid() is not null and not app.is_sysadmin() and not app.has_permission('projects.projects.modify') then
    raise exception 'Only people who may edit Projects can merge them' using errcode = '42501';
  end if;
  perform 1 from public.projects where id = p_into and deleted_at is null and merged_into_id is null;
  if not found then raise exception 'The project to keep was not found (or is itself merged)'; end if;
  perform 1 from public.projects where id = p_from and deleted_at is null and merged_into_id is null;
  if not found then raise exception 'The project to merge was not found (or is already merged)'; end if;

  -- Plain foreign keys: move the rows and remember their ids.
  foreach v_pair slice 1 in array v_links loop
    -- Base tables only: portal_my_apps is a view over portal_app_projects, which the composite loop below handles.
    if exists (select 1 from information_schema.tables t join information_schema.columns c using (table_schema, table_name)
               where t.table_schema = 'public' and t.table_type = 'BASE TABLE' and t.table_name = v_pair[1] and c.column_name = v_pair[2]) then
      execute format('with m as (update public.%I set %I = $1 where %I = $2 returning id) select coalesce(jsonb_agg(id), ''[]''::jsonb) from m', v_pair[1], v_pair[2], v_pair[2]) into v_ids using p_into, p_from;
      if jsonb_array_length(v_ids) > 0 then v_moved := v_moved || jsonb_build_object(v_pair[1] || '.' || v_pair[2], v_ids); end if;
    end if;
  end loop;

  -- Platform tables keyed by (table_name, record_id).
  foreach v_tbl in array v_generic loop
    if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = v_tbl and column_name = 'record_id') then
      execute format('with m as (update public.%I set record_id = $1 where table_name = ''projects'' and record_id = $2 returning id) select coalesce(jsonb_agg(id), ''[]''::jsonb) from m', v_tbl) into v_ids using p_into, p_from;
      if jsonb_array_length(v_ids) > 0 then v_moved := v_moved || jsonb_build_object(v_tbl || '.record_id', v_ids); end if;
    end if;
  end loop;

  -- Workflow state: the kept project's stage wins; the other row is stored whole and removed.
  select coalesce(jsonb_agg(to_jsonb(s)), '[]'::jsonb) into v_rows from public.record_workflow_state s
    where s.table_name = 'projects' and s.record_id = p_from and exists (select 1 from public.record_workflow_state k where k.table_name = 'projects' and k.record_id = p_into);
  if jsonb_array_length(v_rows) > 0 then
    delete from public.record_workflow_state where table_name = 'projects' and record_id = p_from;
    v_moved := v_moved || jsonb_build_object('record_workflow_state:deleted', v_rows);
  else
    update public.record_workflow_state set record_id = p_into where table_name = 'projects' and record_id = p_from;
    if found then v_moved := v_moved || jsonb_build_object('record_workflow_state.record_id', jsonb_build_array(p_from)); end if;
  end if;

  -- Composite keys (document × project, app × project, project × contact): move what does not clash, store and drop the rest.
  foreach v_pair slice 1 in array v_pairs loop
    execute format('select coalesce(jsonb_agg(to_jsonb(f)), ''[]''::jsonb) from public.%1$I f where f.project_id = $1 and exists (select 1 from public.%1$I k where k.project_id = $2 and k.%2$I = f.%2$I)', v_pair[1], v_pair[2]) into v_rows using p_from, p_into;
    if jsonb_array_length(v_rows) > 0 then
      execute format('delete from public.%1$I f where f.project_id = $1 and exists (select 1 from public.%1$I k where k.project_id = $2 and k.%2$I = f.%2$I)', v_pair[1], v_pair[2]) using p_from, p_into;
      v_moved := v_moved || jsonb_build_object(v_pair[1] || ':deleted', v_rows);
    end if;
    execute format('with m as (update public.%1$I set project_id = $1 where project_id = $2 returning %2$I) select coalesce(jsonb_agg(%2$I), ''[]''::jsonb) from m', v_pair[1], v_pair[2]) into v_ids using p_into, p_from;
    if jsonb_array_length(v_ids) > 0 then v_moved := v_moved || jsonb_build_object(v_pair[1] || '.' || v_pair[2], v_ids); end if;
  end loop;

  update public.projects set archived_at = coalesce(archived_at, now()), merged_into_id = p_into, updated_at = now(), updated_by = auth.uid() where id = p_from;
  insert into public.project_merges (from_id, into_id, reason, moved, merged_by) values (p_from, p_into, nullif(trim(p_reason), ''), v_moved, auth.uid()) returning id into v_id;
  insert into public.audit_log (table_name, record_id, action, actor, changes)
    values ('projects', p_into, 'merge', auth.uid(), jsonb_build_object('merged_from', p_from, 'reason', p_reason, 'moved', v_moved)),
           ('projects', p_from, 'merge', auth.uid(), jsonb_build_object('merged_into', p_into, 'reason', p_reason));
  return v_id;
end;
$$;
