-- Follow-up to 20261020030000: the planner still pushed app.user_can_see() down onto the full scan
-- of record_workflow_state (5,554 rows, 2 s). The join result is now a materialized CTE, an
-- optimisation fence, so the per-record check runs on the ~70 rows in queue levels only.
create or replace function public.my_workflow_queue()
returns table (table_name text, record_id bigint, workflow_id text, level_id bigint, level_title text, level_color text, entered_at timestamptz)
language sql stable security definer set search_path = ''
as $$
  with lv as materialized (
    select l.id, l.title, l.color
    from public.workflow_levels l
    join public.workflows w on w.id = l.workflow_id and w.active and w.queue
    where l.queue and app.may_act_on_level(l.id)
  ),
  q as materialized (
    select s.table_name, s.record_id, s.workflow_id, s.level_id, lv.title as level_title, lv.color as level_color, s.entered_at
    from lv join public.record_workflow_state s on s.level_id = lv.id
  )
  select q.table_name, q.record_id, q.workflow_id, q.level_id, q.level_title, q.level_color, q.entered_at
  from q
  where app.user_can_see(q.table_name, q.record_id)
  order by q.entered_at desc;
$$;
