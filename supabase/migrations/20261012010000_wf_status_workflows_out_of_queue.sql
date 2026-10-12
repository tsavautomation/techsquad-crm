-- Status workflows stay out of "Waiting for me" (Fred 2026-10-12: "why does it say My Assigned? this looks like
-- recent stock entries"). Stock Status is a stage per unit (In Stock, Separated, On Project, RMA…), never an
-- approval someone owes; with every level open to administrators, all 1000 units sat in the Today queue, the
-- "Waiting for me" tile and the alerts bell. A workflow now says whether its levels are work waiting for a person.
alter table public.workflows add column queue boolean not null default true;
comment on column public.workflows.queue is 'True: records at a level are work waiting for the people who may act (Today › My Assigned, the bell). False: the level is just the record''s stage (Stock Status).';
update public.workflows set queue = false where id = 'stock_status';

create or replace function public.my_workflow_queue()
returns table (table_name text, record_id bigint, workflow_id text, level_id bigint, level_title text, level_color text, entered_at timestamptz)
language sql stable security definer set search_path = ''
as $$
  select s.table_name, s.record_id, s.workflow_id, s.level_id, l.title, l.color, s.entered_at
  from public.record_workflow_state s
  join public.workflow_levels l on l.id = s.level_id
  join public.workflows w on w.id = s.workflow_id and w.active and w.queue
  where app.may_act_on_level(s.level_id) and app.user_can_see(s.table_name, s.record_id)
  order by s.entered_at desc;
$$;
