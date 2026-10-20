-- Jessica's test round, 2026-10-20, second part (SPEC §9.1 J-k, J-l, J-n).

-- ---------------------------------------------------------------- J-k internal events on the calendar
-- A visit is a client visit (needs a project) or an internal event (warehouse, training…) with a subject instead.
alter table public.visits add column if not exists kind text not null default 'Visit';
alter table public.visits add column if not exists subject text;
comment on column public.visits.kind is 'Visit (client visit, needs a project) or Internal (warehouse, training…; no project). Jessica 2026-10-20.';
comment on column public.visits.subject is 'What an internal event is for (shown as its title on the calendar).';

-- ---------------------------------------------------------------- J-l a declined renewal leaves the alerts
-- The three date automations (Active / Renewal Alert / Expired) rewrite the status every day; a plan the client
-- declined to renew keeps "Renewal Declined" and leaves Today's renewals and the tile.
update public.automations
  set conditions = jsonb_set(conditions, '{rules}', (conditions -> 'rules') || '[{"field":"maintenance_status","op":"!=","value":"Renewal Declined"}]'::jsonb)
  where id in (686, 689, 690) and not (conditions -> 'rules') @> '[{"field":"maintenance_status"}]'::jsonb;

-- ---------------------------------------------------------------- J-n undo "On my way" / check-in
-- The person going (or anyone who may change visits) takes the last step back: On the way → Scheduled (On my way
-- time cleared), On site → the step before (check-in cleared). The time-clock entries of that step, with the phone's
-- position, are removed. A visit already checked out is left alone (its report flow has started).
create or replace function public.visit_undo_step(p_id bigint)
returns public.visits
language plpgsql security definer set search_path = ''
as $$
declare
  v public.visits;
  me text := (select lower(email) from auth.users where id = auth.uid());
  going boolean;
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
    raise exception 'Only the people going on this visit can undo a step' using errcode = '42501';
  end if;

  perform set_config('app.engine', 'on', true);
  if v.status = 'On the way' then
    update public.visits set status = 'Scheduled', on_way_at = null, updated_by = auth.uid() where id = p_id returning * into v;
    update public.time_entries set deleted_at = now() where visit_id = p_id and kind = 'on_way' and deleted_at is null;
  elsif v.status = 'On site' and v.checked_out_at is null then
    update public.visits
       set status = case when on_way_at is not null then 'On the way' else 'Scheduled' end, checked_in_at = null, updated_by = auth.uid()
     where id = p_id returning * into v;
    update public.time_entries set deleted_at = now() where visit_id = p_id and kind = 'visit_in' and deleted_at is null;
  else
    raise exception 'There is nothing to undo on this visit' using errcode = '22023';
  end if;
  perform set_config('app.engine', 'off', true);
  return v;
end;
$$;
grant execute on function public.visit_undo_step(bigint) to authenticated;
