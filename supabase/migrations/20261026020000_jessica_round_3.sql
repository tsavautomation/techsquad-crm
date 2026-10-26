-- Jessica's third round (via Fred 2026-10-26), SPEC §9.1 J-s … J-z.
--
-- J-u  employees.must_clock_in: who appears on the time clock and in the missing-record checks.
-- J-x  Return cards by department: Electrical projects go to a second scheduler (Saulo); J-t overtime approver.
-- J-z  AI "looks done" suggestions on tasks: the later report and the sentence that say the pending item was done.

alter table public.employees add column if not exists must_clock_in boolean not null default true;
comment on column public.employees.must_clock_in is 'J-u: this person clocks in and out (time clock, timesheets, forgotten clock-out checks, overtime)';

alter table public.tasks
  add column if not exists ai_done_report_id bigint references public.job_reports (id) on delete set null,
  add column if not exists ai_done_quote text,
  add column if not exists ai_done_at timestamptz,
  add column if not exists ai_done_dismissed_at timestamptz;
comment on column public.tasks.ai_done_report_id is 'J-z: the later Job Report Claude read as confirming this task was done';

-- Saulo (employee 1012) schedules returns for Electrical projects and approves overtime; Jessica keeps Low Voltage.
update public.app_settings
set value = value || '{"scheduler_employee_id_electrical": 1012, "overtime_approver_employee_id": 1012}'::jsonb
where key = 'field_day' and not (value ? 'scheduler_employee_id_electrical');

insert into public.automations (id, table_name, title, active, events, conditions, actions, notes) values
(900504, 'tasks', 'AI: pending task looks done', true, '{daily}',
  '{"match":"all","rules":[]}',
  '[{"type":"ai_task_done"}]',
  'J-z: each day Claude compares the open tasks of a project with the Job Reports written after them; when a report says the pending item was done, the task shows "Looks done" with the report and the sentence, and the office completes or keeps it. Never completes a task by itself.')
on conflict (id) do nothing;
