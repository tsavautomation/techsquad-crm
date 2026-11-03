-- PJ-b fix 4 (2026-11-03, supabase/tests/pj_merge.sql): unmerge compares ids as text (report_files has a text id);
-- otherwise as fix 3 (views and tables without record_id skipped, record_pdfs stored whole, uuid ids as text).
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
    if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = v_tbl and column_name = 'id')
       and exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = v_tbl and column_name = 'record_id') then
      -- ids kept as text: bigint on most tables, uuid on attachments and onedrive_uploads
      execute format('with m as (update public.%I set record_id = $1 where table_name = ''projects'' and record_id = $2 returning id::text as id) select coalesce(jsonb_agg(id), ''[]''::jsonb) from m', v_tbl) into v_ids using p_into, p_from;
      if jsonb_array_length(v_ids) > 0 then v_moved := v_moved || jsonb_build_object(v_tbl || '.record_id', v_ids); end if;
    elsif exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = v_tbl and column_name = 'record_id') then
      -- no id column (record_pdfs, keyed by table_name + record_id): the generated PDFs are stored whole and dropped; they regenerate
      execute format('select coalesce(jsonb_agg(to_jsonb(r)), ''[]''::jsonb) from public.%I r where r.table_name = ''projects'' and r.record_id = $1', v_tbl) into v_rows using p_from;
      if jsonb_array_length(v_rows) > 0 then
        execute format('delete from public.%I where table_name = ''projects'' and record_id = $1', v_tbl) using p_from;
        v_moved := v_moved || jsonb_build_object(v_tbl || ':deleted', v_rows);
      end if;
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

create or replace function public.unmerge_project(p_merge_id bigint)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  m record;
  k text;
  v jsonb;
  v_tbl text;
  v_col text;
begin
  if auth.uid() is not null and not app.is_sysadmin() and not app.has_permission('projects.projects.modify') then
    raise exception 'Only people who may edit Projects can undo a merge' using errcode = '42501';
  end if;
  select * into m from public.project_merges where id = p_merge_id and undone_at is null;
  if not found then raise exception 'This merge was not found or is already undone'; end if;
  for k, v in select * from jsonb_each(m.moved) loop
    if k like '%:deleted' then
      v_tbl := split_part(k, ':', 1);
      execute format('insert into public.%I select * from jsonb_populate_recordset(null::public.%I, $1) on conflict do nothing', v_tbl, v_tbl) using v;
    else
      v_tbl := split_part(k, '.', 1);
      v_col := split_part(k, '.', 2);
      if v_tbl = 'record_workflow_state' or v_tbl = any (array['attachments', 'audit_log', 'record_notes', 'record_comments', 'record_checklist_items', 'workflow_events', 'record_pdfs', 'record_mentions', 'sensitive_reveals', 'onedrive_uploads']) then
        if v_tbl = 'record_workflow_state' then
          update public.record_workflow_state set record_id = m.from_id where table_name = 'projects' and record_id = m.into_id;
        else
          execute format('update public.%I set record_id = $1 where table_name = ''projects'' and id::text in (select value from jsonb_array_elements_text($2))', v_tbl) using m.from_id, v;
        end if;
      elsif v_tbl in ('portal_document_projects', 'portal_app_projects', 'portal_access') then
        execute format('update public.%I set project_id = $1 where project_id = $2 and %I in (select value::bigint from jsonb_array_elements_text($3))', v_tbl, v_col) using m.from_id, m.into_id, v;
      else
        -- ids compared as text: report_files has a text id, the rest bigint
        execute format('update public.%I set %I = $1 where id::text in (select value from jsonb_array_elements_text($2))', v_tbl, v_col) using m.from_id, v;
      end if;
    end if;
  end loop;
  update public.projects set archived_at = null, merged_into_id = null, updated_at = now(), updated_by = auth.uid() where id = m.from_id;
  update public.project_merges set undone_at = now(), undone_by = auth.uid() where id = p_merge_id;
  insert into public.audit_log (table_name, record_id, action, actor, changes)
    values ('projects', m.into_id, 'unmerge', auth.uid(), jsonb_build_object('merged_from', m.from_id)),
           ('projects', m.from_id, 'unmerge', auth.uid(), jsonb_build_object('merged_into', m.into_id));
end;
$$;
