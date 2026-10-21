-- BD-a (Fred 2026-10-21): the birthday strip on Today is shown to every signed-in user, technicians included,
-- who cannot read the employees table. The name view gains the birthday as month-day only ('MM-DD'):
-- the year, and so the age, never leaves the database.
create or replace view public.employee_names as
select id, title, first_name, last_name, email, status, departments, clock_group, deleted_at, archived_at,
  to_char(date_of_birth, 'MM-DD') as birthday_md
from public.employees;
