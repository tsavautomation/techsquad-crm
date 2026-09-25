-- M8: record features use WebAuthor's module permissions (SPEC §7.4):
--   Notes          activity_history_view / activity_history_add / notes_allow_delete / notes_allow_delete_of_my_notes
--   Files pod      files_view_files_pod / files_add_new / files_allow_delete
--   History        audit_log
-- Where a module has no such permission in the export (the FLEX forms, utility lists), anyone who can
-- see the record may use the feature.

create function app.can_module(p_table text, p_action text)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select case
    when not exists (select 1 from public.permissions where key = r.module || '.module.' || p_action) then true
    else app.has_permission(r.module || '.module.' || p_action)
  end
  from app.record_types r
  where r.table_name = p_table;
$$;
revoke execute on function app.can_module(text, text) from public, anon;
grant execute on function app.can_module(text, text) to authenticated;

-- ---------------------------------------------------------------- notes
drop policy "read" on public.record_notes;
drop policy "add" on public.record_notes;
drop policy "own" on public.record_notes;
drop policy "own delete" on public.record_notes;

create policy "read" on public.record_notes for select to authenticated
  using (app.record_visible(table_name, record_id) and app.can_module(table_name, 'activity_history_view'));
create policy "add" on public.record_notes for insert to authenticated
  with check (created_by = auth.uid() and app.record_visible(table_name, record_id) and app.can_module(table_name, 'activity_history_add'));
create policy "edit own" on public.record_notes for update to authenticated
  using (created_by = auth.uid()) with check (created_by = auth.uid());
create policy "delete" on public.record_notes for delete to authenticated
  using (
    app.record_visible(table_name, record_id)
    and (app.can_module(table_name, 'notes_allow_delete')
         or (created_by = auth.uid() and app.can_module(table_name, 'notes_allow_delete_of_my_notes')))
  );

-- ---------------------------------------------------------------- attachments
-- field = null → the record's general Files pod; field set → an upload field on the form.
drop policy "read" on public.attachments;
drop policy "add" on public.attachments;
drop policy "own" on public.attachments;

create policy "read" on public.attachments for select to authenticated
  using (app.record_visible(table_name, record_id) and (field is not null or app.can_module(table_name, 'files_view_files_pod')));
create policy "add" on public.attachments for insert to authenticated
  with check (
    created_by = auth.uid() and app.record_visible(table_name, record_id)
    and (case when field is null then app.can_module(table_name, 'files_add_new') else app.can_do(table_name, 'modify') or app.can_do(table_name, 'create') end)
  );
-- Removing = setting deleted_at. Form uploads follow the record's Modify right; the Files pod needs "Files: Allow Delete".
create policy "remove" on public.attachments for update to authenticated
  using (
    app.record_visible(table_name, record_id)
    and (created_by = auth.uid() or app.can_module(table_name, 'files_allow_delete') or (field is not null and app.can_do(table_name, 'modify')))
  )
  with check (app.record_visible(table_name, record_id));

drop policy "upload to record tables" on storage.objects;
create policy "upload to record tables" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'attachments'
    and exists (select 1 from app.record_types r where r.table_name = (storage.foldername(name))[1])
    and (
      app.can_do((storage.foldername(name))[1], 'create')
      or app.can_do((storage.foldername(name))[1], 'modify')
      or ((storage.foldername(name))[3] = '_files' and app.can_module((storage.foldername(name))[1], 'files_add_new'))
    )
  );

-- ---------------------------------------------------------------- history
drop policy "read history of visible records" on public.audit_log;
create policy "read history of visible records" on public.audit_log for select to authenticated
  using (app.record_visible(table_name, record_id) and app.can_module(table_name, 'audit_log'));

-- ---------------------------------------------------------------- checklist: anyone who can see the record may add and tick
create policy "remove own" on public.record_checklist_items for delete to authenticated
  using (app.record_visible(table_name, record_id) and (created_by = auth.uid() or app.can_do(table_name, 'modify')));
