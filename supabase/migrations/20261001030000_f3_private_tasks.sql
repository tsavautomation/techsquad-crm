-- F3 Tasks board (docs/portal-features-merge.md §E, SPEC §9.1 F3-a): private tasks.
-- A private task is seen only by the person who made it and the person it's assigned to (matched by
-- the Employee's email, as for "my tasks"), and by System Administrators; "View All" doesn't open it.

alter table public.tasks add column private boolean not null default false;

create or replace function app.my_employee_ids()
returns bigint[]
language sql stable security definer set search_path = ''
as $$
  select coalesce(array_agg(e.id), '{}')
  from public.employees e
  where e.deleted_at is null
    and lower(e.email) = (select lower(u.email) from auth.users u where u.id = auth.uid());
$$;
revoke all on function app.my_employee_ids() from public, anon;
grant execute on function app.my_employee_ids() to authenticated;

create or replace function app.task_visible(p_private boolean, p_created_by uuid, p_member bigint)
returns boolean
language sql stable security invoker set search_path = ''
as $$
  select not p_private
      or p_created_by = auth.uid()
      or p_member = any (app.my_employee_ids())
      or app.is_sysadmin();
$$;
grant execute on function app.task_visible(boolean, uuid, bigint) to authenticated;

drop policy "view" on public.tasks;
create policy "view" on public.tasks for select to authenticated using (
  ((select app.can_view_all('tasks')) or (created_by = (select auth.uid()) and (select app.can_view_page('tasks'))))
  and app.task_visible(private, created_by, member_id)
);

drop policy "modify" on public.tasks;
create policy "modify" on public.tasks for update to authenticated using (
  ((select app.can_view_all('tasks')) or (created_by = (select auth.uid()) and (select app.can_view_page('tasks'))))
  and app.task_visible(private, created_by, member_id)
  and ((select app.can_do('tasks', 'modify')) or (select app.can_do('tasks', 'delete')) or (select app.can_do('tasks', 'archive')))
) with check (
  ((select app.can_do('tasks', 'modify')) or (select app.can_do('tasks', 'delete')) or (select app.can_do('tasks', 'archive')))
);
