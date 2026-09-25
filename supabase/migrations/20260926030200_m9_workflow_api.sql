-- M9: start workflows only on their configured trigger, and one call for the record page's workflow panel.

drop function public.workflow_start(text, bigint);

/** Start the table's workflow for a record. p_trigger = 'submit' (Projects, Punch List) or 'create' (Stock). */
create function public.workflow_start(p_table text, p_id bigint, p_trigger text default 'submit')
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  wf public.workflows%rowtype;
  start_level bigint;
begin
  select * into wf from public.workflows where table_name = p_table and active and start_on = p_trigger;
  if not found then
    return; -- no workflow starts on this trigger for this table
  end if;
  if not app.user_can_see(p_table, p_id) or not (app.can_do(p_table, 'modify') or app.can_do(p_table, 'create')) then
    raise exception 'You do not have permission to do that' using errcode = '42501';
  end if;
  if exists (select 1 from public.record_workflow_state where table_name = p_table and record_id = p_id) then
    return;
  end if;
  select id into start_level from public.workflow_levels where workflow_id = wf.id and is_start;
  perform app.enter_level(p_table, p_id, wf.id, null, start_level, 'Started', null);
end;
$$;

/**
 * Everything the record page shows about a record's workflow, for the current user:
 * { workflow, state: {level, title, color, entered_at} | null, may_act, outcomes[], levels[], events[] }.
 * Returns null when the table has no active workflow or the user can't see the record.
 */
create function public.workflow_panel(p_table text, p_id bigint)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  wf public.workflows%rowtype;
  st public.record_workflow_state%rowtype;
  lv public.workflow_levels%rowtype;
begin
  select * into wf from public.workflows where table_name = p_table and active;
  if not found or not app.user_can_see(p_table, p_id) then
    return null;
  end if;
  select * into st from public.record_workflow_state where table_name = p_table and record_id = p_id;
  if found then
    select * into lv from public.workflow_levels where id = st.level_id;
  end if;

  return jsonb_build_object(
    'workflow', jsonb_build_object('id', wf.id, 'name', wf.name, 'start_on', wf.start_on),
    'state', case when st.level_id is null then null else jsonb_build_object(
      'level_id', lv.id, 'title', lv.title, 'color', lv.color, 'entered_at', st.entered_at, 'allow_comments', lv.allow_comments) end,
    'may_act', st.level_id is not null and app.may_act_on_level(st.level_id),
    'outcomes', coalesce((
      select jsonb_agg(jsonb_build_object('id', o.id, 'title', o.title, 'kind', o.kind, 'target_color', t.color) order by o.place)
      from public.workflow_outcomes o left join public.workflow_levels t on t.id = o.target_level_id
      where o.level_id = st.level_id), '[]'),
    'levels', coalesce((
      select jsonb_agg(jsonb_build_object('id', l.id, 'title', l.title, 'color', l.color, 'place', l.place) order by l.place)
      from public.workflow_levels l where l.workflow_id = wf.id), '[]'),
    'events', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', e.id, 'outcome', e.outcome, 'comment', e.comment, 'at', e.at,
        'from', fl.title, 'to', tl.title, 'to_color', tl.color,
        'actor', coalesce(nullif(trim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')), ''), p.email, 'System')
      ) order by e.at desc)
      from public.workflow_events e
      left join public.workflow_levels fl on fl.id = e.from_level_id
      left join public.workflow_levels tl on tl.id = e.to_level_id
      left join public.profiles p on p.id = e.actor
      where e.table_name = p_table and e.record_id = p_id), '[]')
  );
end;
$$;

revoke execute on function public.workflow_start(text, bigint, text), public.workflow_panel(text, bigint) from public, anon;
grant execute on function public.workflow_start(text, bigint, text), public.workflow_panel(text, bigint) to authenticated;
