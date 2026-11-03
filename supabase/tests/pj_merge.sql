-- PJ-b merge test. Runs the merge of #1372 into #1061 and the undo INSIDE ONE TRANSACTION THAT IS ROLLED BACK
-- (the DO block ends by raising; the exception text carries the result). Needs migration 20261102100000.
--   npx supabase db query --linked --file supabase/tests/pj_merge.sql
do $test$
declare
  v_from bigint := 1372;
  v_into bigint := 1061;
  before_visits int; before_reports int; before_files int; before_notes int;
  after_visits int; after_reports int; after_files int; after_notes int;
  left_visits int; left_reports int;
  v_merge bigint;
  v_archived timestamptz;
  v_moved jsonb;
  back_visits int; back_reports int; back_files int; back_notes int;
  v_unarchived timestamptz;
  v_name text;
begin
  select count(*) into before_visits from public.visits where project_id = v_from and deleted_at is null;
  select count(*) into before_reports from public.job_reports where project_id = v_from and deleted_at is null;
  select count(*) into before_files from public.report_files where project_id = v_from;
  select count(*) into before_notes from public.record_notes where table_name = 'projects' and record_id = v_from;

  v_merge := public.merge_project(v_from, v_into, 'test: same apartment, one S missing');

  select count(*) into after_visits from public.visits where project_id = v_into and deleted_at is null;
  select count(*) into after_reports from public.job_reports where project_id = v_into and deleted_at is null;
  select count(*) into after_files from public.report_files where project_id = v_into;
  select count(*) into after_notes from public.record_notes where table_name = 'projects' and record_id = v_into;
  select count(*) into left_visits from public.visits where project_id = v_from;
  select count(*) into left_reports from public.job_reports where project_id = v_from;
  select archived_at into v_archived from public.projects where id = v_from;
  select moved into v_moved from public.project_merges where id = v_merge;

  perform public.unmerge_project(v_merge);

  select count(*) into back_visits from public.visits where project_id = v_from and deleted_at is null;
  select count(*) into back_reports from public.job_reports where project_id = v_from and deleted_at is null;
  select count(*) into back_files from public.report_files where project_id = v_from;
  select count(*) into back_notes from public.record_notes where table_name = 'projects' and record_id = v_from;
  select archived_at into v_unarchived from public.projects where id = v_from;

  -- Contacts trigger: a mixed-case contact comes back upper case with a lower-case e-mail.
  insert into public.contacts (id, type, first_name, last_name, email) values (990001, 'End Customer', 'Gustavo', 'Lima', 'G.Lima@Example.com');
  select first_name || ' ' || last_name || ' ' || email into v_name from public.contacts where id = 990001;

  raise exception 'PJ_RESULT %', jsonb_build_object(
    'merge_id', v_merge,
    'from_before', jsonb_build_object('visits', before_visits, 'reports', before_reports, 'files', before_files, 'notes', before_notes),
    'into_after', jsonb_build_object('visits', after_visits, 'reports', after_reports, 'files', after_files, 'notes', after_notes),
    'left_on_from', jsonb_build_object('visits', left_visits, 'reports', left_reports),
    'from_archived', v_archived is not null,
    'moved_keys', (select jsonb_agg(k) from jsonb_object_keys(v_moved) k),
    'from_after_undo', jsonb_build_object('visits', back_visits, 'reports', back_reports, 'files', back_files, 'notes', back_notes),
    'from_unarchived', v_unarchived is null,
    'contact_case', v_name
  );
end;
$test$;
