-- F17 AI review of Job Reports (SPEC §9.1 F17-a…d).
--
--   job_reports.ai_review_status   queue state: pending → running → done / skipped / error (null = never queued:
--                                  the imported reports, which the review must never touch)
--   job_reports.ai_reviewed_at     when Claude last reviewed the report ("Reviewed by AI" on the page)
--   job_reports.ai_review_notes    what the review changed, in plain words
--   app_settings 'ai'              { review_reports: true | false } — the Admin › AI switch
--   automations 900501             the data row the review runs as (its runs are logged in automation_runs)

alter table public.job_reports
  add column ai_review_status text check (ai_review_status in ('pending', 'running', 'done', 'skipped', 'error')),
  add column ai_reviewed_at timestamptz,
  add column ai_review_notes text;
comment on column public.job_reports.ai_review_status is 'F17: AI review queue state; null for reports that were never queued (imported ones)';
comment on column public.job_reports.ai_reviewed_at is 'F17: Reviewed by AI';
comment on column public.job_reports.ai_review_notes is 'F17: What the AI changed';
create index job_reports_ai_review_idx on public.job_reports (ai_review_status) where ai_review_status in ('pending', 'running');

-- The queue state is bookkeeping, not a change to the report: keep it out of History.
create or replace function app.record_audit()
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
    and n.key not in ('updated_at', 'updated_by', 'created_at', 'created_by', 'ai_review_status');

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

insert into public.app_settings (key, value) values ('ai', '{"review_reports": true}') on conflict (key) do nothing;

insert into public.automations (id, table_name, title, active, events, conditions, actions, notes) values
(900501, 'job_reports', 'AI review of the report', true, '{added,field:report}',
  '{"match":"all","rules":[]}',
  '[{"type":"ai_review"}]',
  'F17: Claude tidies the text, moves pending work to What''s missing and logins to Login and Passwords. New reports only; switched on and off in Admin › AI.')
on conflict (id) do nothing;
