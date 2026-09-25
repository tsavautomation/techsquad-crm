-- Fixes found by supabase/tests/rls_m4.sql.

-- app.record_visible() runs as the caller (so the record table's own RLS applies)
-- and needs to read the record-type catalogue. It only holds table metadata.
grant select on app.record_types to authenticated;

-- Profile guard: engines and admin scripts (service role, no auth.uid()) may change
-- email / active status; signed-in users still need the Members admin permission.
create or replace function app.guard_profile_update()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if auth.uid() is not null
     and not app.has_permission('site.admin.members')
     and (new.email is distinct from old.email or new.active is distinct from old.active) then
    raise exception 'Only member administrators can change email or active status';
  end if;
  return new;
end;
$$;
