-- F26-3 AI reading and routing of project emails (SPEC §9.1 F26-b, Fred 2026-10-21).
--   project_events.ai_*     what Claude read in the email: its kind (RFI, change order, answer, scheduling,
--                           document, info), the ask in one sentence, who asks, any deadline; the queue state;
--                           and the request line or task the CRM made from it. The kind can be corrected by hand.
--   projects.brief          the short project brief Claude rewrites after each new event (status, open
--                           requests and who waits on whom, latest decisions, next step, last contact).
--   automations 900502      the data row the routing runs as (its runs are logged in automation_runs).
--   app_settings 'ai'       route_emails: the Admin › AI switch.

alter table public.project_events
  add column ai_status text check (ai_status in ('pending', 'running', 'done', 'skipped', 'error')),
  add column ai_kind text check (ai_kind in ('rfi', 'change_order', 'answer', 'scheduling', 'document', 'info')),
  add column ai_summary text,
  add column ai_asked_by text,
  add column ai_deadline date,
  add column ai_at timestamptz,
  add column ai_error text,
  add column kind_set_by uuid references public.profiles (id) on delete set null,
  add column request_id bigint references public.project_requests (id) on delete set null,
  add column task_id bigint references public.tasks (id) on delete set null;
comment on column public.project_events.ai_kind is 'F26-3: RFI / change order / answer / scheduling / document / info, read by Claude or set by hand (kind_set_by)';
create index project_events_ai_queue_idx on public.project_events (ai_status) where ai_status in ('pending', 'running');

alter table public.projects
  add column brief text,
  add column brief_at timestamptz;
comment on column public.projects.brief is 'F26-3: the short project brief Claude rewrites after each new timeline event';

-- Whoever may change the project may correct an event's kind (the CRM does the rest with the service role).
create policy "correct kind" on public.project_events for update to authenticated
  using ((select app.can_do('projects', 'modify')) and exists (select 1 from public.projects p where p.id = project_id))
  with check ((select app.can_do('projects', 'modify')));

insert into public.automations (id, table_name, title, active, events, conditions, actions, notes) values
(900502, 'project_events', 'AI reading of project emails', true, '{added}',
  '{"match":"all","rules":[]}',
  '[{"type":"ai_route"}]',
  'F26-3: Claude classifies each email on a project timeline (RFI, change order, answer, scheduling, document, info); an RFI or change order becomes a Project request line with the shared alert, an answer closes the open request, a scheduling request becomes a task for the office; then the project brief is rewritten. Switched on and off in Admin › AI.')
on conflict (id) do nothing;

update public.app_settings set value = value || '{"route_emails": true}'::jsonb where key = 'ai' and not (value ? 'route_emails');
insert into public.app_settings (key, value) values ('ai', '{"review_reports": true, "route_emails": true}') on conflict (key) do nothing;
