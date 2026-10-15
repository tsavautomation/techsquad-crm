-- Finished stages stay out of "My Assigned" / "Waiting for me" (Fred 2026-10-14): a project that is Complete or
-- Proposal Denied, a punch item Completed or Canceled, is not work waiting for anyone. A level now says whether
-- records sitting at it are still in someone's queue.
alter table public.workflow_levels add column queue boolean not null default true;
comment on column public.workflow_levels.queue is 'False for finished stages (Complete, Proposal Denied, Completed, Canceled): records there are not work waiting for anyone.';
update public.workflow_levels set queue = false
 where (workflow_id = 'project_proposal' and title in ('Complete', 'Proposal Denied'))
    or (workflow_id = 'punch_list' and title in ('Completed', 'Canceled'));

create or replace function public.my_workflow_queue()
returns table (table_name text, record_id bigint, workflow_id text, level_id bigint, level_title text, level_color text, entered_at timestamptz)
language sql stable security definer set search_path = ''
as $$
  select s.table_name, s.record_id, s.workflow_id, s.level_id, l.title, l.color, s.entered_at
  from public.record_workflow_state s
  join public.workflow_levels l on l.id = s.level_id and l.queue
  join public.workflows w on w.id = s.workflow_id and w.active and w.queue
  where app.may_act_on_level(s.level_id) and app.user_can_see(s.table_name, s.record_id)
  order by s.entered_at desc;
$$;
