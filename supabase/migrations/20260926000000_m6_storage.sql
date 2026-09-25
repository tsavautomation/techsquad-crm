-- M6: private file storage for upload / image / signature fields (SPEC §1.3 Files).
-- Objects live at <table>/<record id or pending-uuid>/<field>/<uuid>-<file name>.
-- A file is readable by its uploader, or by anyone who can see a record it is attached to.

insert into storage.buckets (id, name, public, file_size_limit)
values ('attachments', 'attachments', false, 52428800) -- 50 MB (Supabase Free plan maximum)
on conflict (id) do nothing;

-- Upload: the first folder must be a record table the user may create or modify records in.
create policy "upload to record tables" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'attachments'
    and exists (select 1 from app.record_types r where r.table_name = (storage.foldername(name))[1])
    and (app.can_do((storage.foldername(name))[1], 'create') or app.can_do((storage.foldername(name))[1], 'modify'))
  );

create policy "read own or visible attachments" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'attachments'
    and (
      owner = auth.uid()
      or exists (
        select 1 from public.attachments a
        where a.provider = 'supabase' and a.provider_path = name and a.deleted_at is null
          and app.record_visible(a.table_name, a.record_id)
      )
    )
  );

-- Attachments are soft-deleted in public.attachments; storage objects are never deleted by users.
