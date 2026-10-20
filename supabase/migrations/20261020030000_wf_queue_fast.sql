-- Today loaded in 5 seconds (Fred 2026-10-20): my_workflow_queue() scanned every workflow state row
-- (5,554) and ran three per-row permission functions on each (the table's RLS, may_act_on_level,
-- user_can_see) before the joins threw away all but ~70 rows in queue levels: 2.3 s per call, twice
-- per Today render.
--
-- Now the queue levels the user may act on are found first (a handful), the state rows come in
-- through the level index, and the per-record checks run on those rows only. Same rows out.
-- The per-row functions also get a realistic cost so the planner keeps them after the joins.

alter function app.user_can_see(text, bigint) cost 1000;
alter function app.record_visible(text, bigint) cost 1000;
alter function app.may_act_on_level(bigint) cost 1000;

create or replace function public.my_workflow_queue()
returns table (table_name text, record_id bigint, workflow_id text, level_id bigint, level_title text, level_color text, entered_at timestamptz)
language sql stable security definer set search_path = ''
as $$
  with lv as materialized (
    select l.id, l.title, l.color
    from public.workflow_levels l
    join public.workflows w on w.id = l.workflow_id and w.active and w.queue
    where l.queue and app.may_act_on_level(l.id)
  )
  select s.table_name, s.record_id, s.workflow_id, s.level_id, lv.title, lv.color, s.entered_at
  from lv
  join public.record_workflow_state s on s.level_id = lv.id
  where app.user_can_see(s.table_name, s.record_id)
  order by s.entered_at desc;
$$;
