-- Pickers for Team / Tag Someone (employees) and Vehicle (fleet) read these views, so technicians, who have no
-- Employees or Fleet permission, still get the lists (Fred 2026-10-05: "vehicle and team are not populating").
-- archived_at is added to employee_names because the pickers filter on it.
create or replace view public.employee_names as
select id, title, first_name, last_name, email, status, departments, clock_group, deleted_at, archived_at
from public.employees;

create view public.vehicle_names as
select id, title, populate_on_reports, deleted_at, archived_at
from public.vehicles;
comment on view public.vehicle_names is 'Vehicle names for pickers, readable by every signed-in user. The vehicles table keeps its own permissions.';
grant select on public.vehicle_names to authenticated;
