-- Jessica's test round, 2026-10-20 (SPEC Â§9.1 J-c, J-d, J-e).

-- ---------------------------------------------------------------- J-c Tasks: Request and Response to the request
-- "Details" is relabelled Request (same column); the result of the work goes in its own field.
alter table public.tasks add column if not exists response text;
comment on column public.tasks.response is 'Response to the request: what was done (Jessica 2026-10-20).';

-- ---------------------------------------------------------------- J-d a Completed task is never late
-- Automation 700 marked a task Due on its date whatever its status, and nothing ever cleared it.
update public.automations
  set conditions = '{"match":"all","rules":[{"field":"due_date","days":true,"op":">=","value":0},{"field":"status","op":"!=","value":"Completed"}]}'
  where id = 700;
insert into public.automations (id, table_name, title, active, events, conditions, actions, notes) values
(900901, 'tasks', 'Completed task is On-Time again', true, '{field:status}',
  '{"match":"all","rules":[{"field":"status","op":"=","value":"Completed"}]}',
  '[{"type":"update","set":{"due_status":"On-Time"}}]',
  'Jessica 2026-10-20: a task finished after its due date is not late.')
on conflict (id) do nothing;
update public.tasks set due_status = 'On-Time' where status = 'Completed' and due_status = 'Due';

-- ---------------------------------------------------------------- J-e Job Reports: Pending items (Yes / No)
-- True while the report's return card (the task made from "What's missing") is open; before any card exists,
-- true when the result is Partial / Not done with items listed. Kept by triggers, shown and filtered on the list.
alter table public.job_reports add column if not exists has_pending boolean not null default false;
comment on column public.job_reports.has_pending is 'Pending items: an open return card, or Partial / Not done with items and no card yet (Jessica 2026-10-20).';

create or replace function public.job_report_has_pending(p_report_id bigint, p_result text, p_missing text)
returns boolean language sql stable security definer set search_path = public as $$
  select case
    when exists (select 1 from public.tasks t where t.job_report_id = p_report_id and t.deleted_at is null and t.archived_at is null and coalesce(t.status, '') <> 'Completed') then true
    when exists (select 1 from public.tasks t where t.job_report_id = p_report_id and t.deleted_at is null) then false
    else coalesce(p_result, '') in ('Partial', 'Not done') and nullif(btrim(coalesce(p_missing, '')), '') is not null
  end
$$;

create or replace function public.job_reports_set_has_pending()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.has_pending := public.job_report_has_pending(new.id, new.result, new.missing_items);
  return new;
end $$;
drop trigger if exists set_has_pending on public.job_reports;
create trigger set_has_pending before insert or update on public.job_reports for each row execute function public.job_reports_set_has_pending();

create or replace function public.tasks_sync_report_pending()
returns trigger language plpgsql security definer set search_path = public as $$
declare r bigint;
begin
  for r in select distinct x from unnest(array[case when tg_op <> 'INSERT' then old.job_report_id end, case when tg_op <> 'DELETE' then new.job_report_id end]) as x where x is not null loop
    update public.job_reports j set has_pending = public.job_report_has_pending(j.id, j.result, j.missing_items)
      where j.id = r and j.has_pending is distinct from public.job_report_has_pending(j.id, j.result, j.missing_items);
  end loop;
  return null;
end $$;
drop trigger if exists sync_report_pending on public.tasks;
create trigger sync_report_pending after insert or update or delete on public.tasks for each row execute function public.tasks_sync_report_pending();

update public.job_reports j set has_pending = public.job_report_has_pending(j.id, j.result, j.missing_items)
  where j.has_pending is distinct from public.job_report_has_pending(j.id, j.result, j.missing_items);
