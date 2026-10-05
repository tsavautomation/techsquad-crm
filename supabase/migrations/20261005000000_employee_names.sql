-- Everyone who is signed in may see who their colleagues are (Fred 2026-10-05: "no issues on all people seeing all people").
-- Technicians have no Employees permission, so maps, calendars, visit pages and task boards showed "No technician"
-- and numbered pins to them, and "My visits today" could not find their own Employee record.
-- The view carries names and the few work fields the screens need; home address, documents, pay and the like
-- stay behind the Employees permission on the table itself.
create view public.employee_names as
select id, title, first_name, last_name, email, status, departments, clock_group, deleted_at
from public.employees;
comment on view public.employee_names is 'Names and work fields of employees, readable by every signed-in user (map, calendar, tasks, field day). The employees table keeps its own permissions.';
grant select on public.employee_names to authenticated;
