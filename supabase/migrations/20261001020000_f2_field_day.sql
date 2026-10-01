-- F2 Field day (docs/portal-features-merge.md §B–D, SPEC §9.1 F2-a…F2-d).
--   Visits: "On my way" / check-in / check-out times, set by the people going through app.visit_step.
--   Job Report: structured result (Completed / Partial / Not done), what's missing, signature, linked visit.
--   Tasks: return cards (project, source report, return visit, labels).
--   app_settings 'field_day': who receives return cards, due days per reason, checklist + tools per service type.

-- ---------------------------------------------------------------- visits
alter table public.visits
  add column on_way_at timestamptz,
  add column checked_in_at timestamptz,
  add column checked_out_at timestamptz,
  add column return_task_id bigint references public.tasks (id) on delete set null;
create index on public.visits (return_task_id);

-- ---------------------------------------------------------------- job reports
alter table public.job_reports
  add column visit_id bigint references public.visits (id) on delete set null,
  add column result text,
  add column materials_used text,
  add column problems text,
  add column on_site text,
  add column parking text,
  add column partial_reason text,
  add column waiting_on text,
  add column missing_items text,
  add column bring_next text,
  add column time_needed text,
  add column people_needed integer,
  add column access_info text;
create index on public.job_reports (visit_id);
create index on public.job_reports (project_id, date desc);

create table public.job_reports_who_can (
  record_id bigint not null references public.job_reports (id) on delete cascade,
  target_id bigint not null references public.employees (id) on delete cascade,
  primary key (record_id, target_id)
);
create index on public.job_reports_who_can (target_id);
comment on table public.job_reports_who_can is 'Job Report › Who can do it';
alter table public.job_reports_who_can enable row level security;
create policy "view" on public.job_reports_who_can for select to authenticated using (exists (select 1 from public.job_reports r where r.id = record_id));
create policy "change" on public.job_reports_who_can for insert to authenticated with check (exists (select 1 from public.job_reports r where r.id = record_id) and (select app.can_do('job_reports', 'modify') or app.can_do('job_reports', 'create')));
create policy "remove" on public.job_reports_who_can for delete to authenticated using (exists (select 1 from public.job_reports r where r.id = record_id) and (select app.can_do('job_reports', 'modify')));

-- ---------------------------------------------------------------- tasks (return cards)
alter table public.tasks
  add column project_id bigint references public.projects (id) on delete set null,
  add column job_report_id bigint references public.job_reports (id) on delete set null,
  add column visit_id bigint references public.visits (id) on delete set null,
  add column labels text[];
create index on public.tasks (project_id);
create unique index tasks_one_return_per_report on public.tasks (job_report_id) where job_report_id is not null and deleted_at is null;

-- ---------------------------------------------------------------- settings
create table public.app_settings (
  key text primary key,
  value jsonb not null default '{}',
  updated_at timestamptz not null default now(),
  updated_by uuid default auth.uid() references public.profiles (id) on delete set null
);
alter table public.app_settings enable row level security;
create policy "signed-in users read" on public.app_settings for select to authenticated using (true);
create policy "designers manage" on public.app_settings for all to authenticated
  using (app.has_permission('projects.module.design_design'))
  with check (app.has_permission('projects.module.design_design'));
create trigger app_settings_touch before update on public.app_settings for each row execute function app.touch_updated_at();

-- Jessica is WebAuthor employee 1004 (matches once employees are imported with their ids).
insert into public.app_settings (key, value) values ('field_day', '{
  "scheduler_employee_id": 1004,
  "return_days": {
    "Missing material": 3, "Waiting on GC / builder": 5, "Waiting on client": 5, "Waiting on another trade": 5,
    "Out of time": 2, "Equipment failure / RMA": 7, "No access": 2, "Other": 3
  },
  "service_lists": {}
}');

-- ---------------------------------------------------------------- tech steps
-- "On my way" / check in / check out, for the people going on the visit (technician or "also going")
-- and for whoever may change visits. Technicians can't otherwise edit visits (F1-a), so this runs as an
-- engine write: the audit log still records who did it. Check-in adds the service type's checklist.
create or replace function public.visit_step(p_id bigint, p_step text)
returns public.visits
language plpgsql security definer set search_path = ''
as $$
declare
  v public.visits;
  me text := (select lower(email) from auth.users where id = auth.uid());
  going boolean;
  items jsonb;
begin
  select * into v from public.visits where id = p_id and deleted_at is null;
  if v.id is null then
    raise exception 'This visit no longer exists' using errcode = 'P0002';
  end if;
  select exists (
    select 1 from public.employees e
    where lower(e.email) = me and e.deleted_at is null
      and (e.id = v.technician_id or e.id in (select target_id from public.visits_team where record_id = p_id))
  ) into going;
  if not (going or app.can_do('visits', 'modify')) then
    raise exception 'Only the people going on this visit can check in or out' using errcode = '42501';
  end if;
  if v.status = 'Cancelled' then
    raise exception 'This visit was cancelled' using errcode = '22023';
  end if;

  perform set_config('app.engine', 'on', true);
  case p_step
    when 'on_way' then
      update public.visits set status = 'On the way', on_way_at = now(), updated_by = auth.uid() where id = p_id returning * into v;
    when 'check_in' then
      update public.visits set status = 'On site', checked_in_at = coalesce(checked_in_at, now()), updated_by = auth.uid() where id = p_id returning * into v;
      items := (select value -> 'service_lists' -> v.service_type -> 'checklist' from public.app_settings where key = 'field_day');
      if v.service_type is not null and jsonb_typeof(items) = 'array' then
        insert into public.record_checklist_items (table_name, record_id, item, source, created_by)
        select 'visits', p_id, trim(x), 'service:' || v.service_type, null
        from jsonb_array_elements_text(items) x
        where trim(x) <> ''
          and not exists (select 1 from public.record_checklist_items c where c.table_name = 'visits' and c.record_id = p_id and c.item = trim(x));
      end if;
    when 'check_out' then
      update public.visits set status = 'Done', checked_in_at = coalesce(checked_in_at, now()), checked_out_at = now(), updated_by = auth.uid() where id = p_id returning * into v;
    else
      raise exception 'Unknown step %', p_step using errcode = '22023';
  end case;
  perform set_config('app.engine', 'off', true);
  return v;
end;
$$;
revoke all on function public.visit_step(bigint, text) from public, anon;
grant execute on function public.visit_step(bigint, text) to authenticated;

-- ---------------------------------------------------------------- automations (data, editable in Admin)
-- "What's missing" replaces Pending 1–5 on new reports (Fred 2026-10-01): one project checklist item per line.
-- A Partial / Not done report creates a return card for the scheduler.
insert into public.automations (id, table_name, title, active, events, conditions, actions, notes) values
(900101, 'job_reports', 'Missing items to project checklist', true, '{added,field:missing_items}',
  '{"match":"all","rules":[{"field":"missing_items","op":"not_empty"}]}',
  '[{"type":"checklist","target":"project_id","item":"{missing_items}","lines":true}]', 'F2: one checklist item per line of "What''s missing".'),
(900102, 'job_reports', 'Return card for a partial visit', true, '{added,field:result}',
  '{"match":"any","rules":[{"field":"result","op":"=","value":"Partial"},{"field":"result","op":"=","value":"Not done"}]}',
  '[{"type":"return_card"}]', 'F2: a task for the scheduler (Admin › Field day), due by reason; a 2nd partial in a row is marked Urgent.');
