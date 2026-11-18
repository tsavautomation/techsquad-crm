-- SS-a (Fred 2026-11-18): a visit nobody closed gets its "Left the job" from the system, at the time of whatever
-- ended it (on the way to / arrived at another job, the clock-out, the end of the day). The entry is marked
-- auto_closed ("by the system") and stays editable like the automatic clock-out. These two functions let the
-- server (service role only) write and move those entries even inside an approved timesheet period: they never
-- change anyone's hours (only clock-in / clock-out count).

create or replace function public.system_left_job_add(p_employee bigint, p_user uuid, p_visit bigint, p_at timestamptz, p_note text)
returns bigint
language plpgsql security definer set search_path = ''
as $$
declare
  new_id bigint;
begin
  -- Idempotent: the same system entry is never written twice.
  select id into new_id from public.time_entries
   where employee_id = p_employee and visit_id = p_visit and kind = 'visit_out' and at = p_at and deleted_at is null limit 1;
  if new_id is not null then return new_id; end if;
  perform set_config('app.engine', 'on', true);
  insert into public.time_entries (employee_id, user_id, kind, at, visit_id, place, note, auto_closed)
  values (p_employee, p_user, 'visit_out', p_at, p_visit, 'Unknown', p_note, true)
  returning id into new_id;
  perform set_config('app.engine', 'off', true);
  return new_id;
end;
$$;

create or replace function public.system_left_job_move(p_id bigint, p_at timestamptz, p_note text)
returns boolean
language plpgsql security definer set search_path = ''
as $$
declare
  n integer;
begin
  perform set_config('app.engine', 'on', true);
  update public.time_entries set at = p_at, note = p_note
   where id = p_id and kind = 'visit_out' and auto_closed and corrected_at is null and deleted_at is null;
  get diagnostics n = row_count;
  perform set_config('app.engine', 'off', true);
  return n > 0;
end;
$$;

revoke all on function public.system_left_job_add(bigint, uuid, bigint, timestamptz, text) from public, anon, authenticated;
revoke all on function public.system_left_job_move(bigint, timestamptz, text) from public, anon, authenticated;
grant execute on function public.system_left_job_add(bigint, uuid, bigint, timestamptz, text) to service_role;
grant execute on function public.system_left_job_move(bigint, timestamptz, text) to service_role;
