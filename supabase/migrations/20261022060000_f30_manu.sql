-- F30: Emmanuele's login is manu@tsav.net (Fred 2026-10-22); she is part of the office that shares the logins.
insert into public.user_permissions (user_id, permission_key)
select p.id, k
from public.profiles p
cross join unnest(array['administrative.credentials.view_page', 'administrative.credentials.view_all', 'administrative.credentials.create', 'administrative.credentials.modify', 'administrative.credentials.archive', 'administrative.credentials.delete']) k
where lower(p.email) = 'manu@tsav.net'
on conflict do nothing;
