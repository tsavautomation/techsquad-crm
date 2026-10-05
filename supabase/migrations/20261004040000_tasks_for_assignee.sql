-- Technicians' logins (Fred 2026-10-04, SPEC §9.1 P1-e): "each technician has access to the tasks and
-- alerts that concern them". A task assigned to one of my Employee records is mine to see and work on,
-- even without "View all" on Tasks; private tasks keep the F3 rule (creator and assignee only).
drop policy "view" on public.tasks;
create policy "view" on public.tasks for select to authenticated using (
  ((select app.can_view_all('tasks'))
    or ((created_by = (select auth.uid()) or member_id = any (app.my_employee_ids())) and (select app.can_view_page('tasks'))))
  and app.task_visible(private, created_by, member_id)
);

drop policy "modify" on public.tasks;
create policy "modify" on public.tasks for update to authenticated using (
  ((select app.can_view_all('tasks'))
    or ((created_by = (select auth.uid()) or member_id = any (app.my_employee_ids())) and (select app.can_view_page('tasks'))))
  and app.task_visible(private, created_by, member_id)
  and ((select app.can_do('tasks', 'modify')) or (select app.can_do('tasks', 'delete')) or (select app.can_do('tasks', 'archive')))
) with check (
  ((select app.can_do('tasks', 'modify')) or (select app.can_do('tasks', 'delete')) or (select app.can_do('tasks', 'archive')))
);
