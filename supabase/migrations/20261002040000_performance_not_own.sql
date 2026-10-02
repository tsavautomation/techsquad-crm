-- P2-d (Fred 2026-10-02): performance reports are for Fred, Jessica and Saulo — and nobody but an
-- administrator sees reports about themselves. A restrictive policy keeps a person's own reports out of
-- every read and change, whatever their other permissions say.
create policy "not about yourself" on public.staff_performance
  as restrictive for all to authenticated
  using (app.is_sysadmin() or not (employee_id = any (app.my_employee_ids())));
