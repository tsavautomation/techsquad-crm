-- Insights gets its own permission (Fred 2026-10-02: some people must not see the analytics).
-- Until now anyone who could open Projects saw /insights; those people keep it.
insert into public.permissions (key, module, resource, action, kind, area, label, description)
values ('insights.page.view', 'insights', 'page', 'view', 'page', 'Insights', 'Insights', 'The charts-and-numbers page (pipeline, money, partners, field work, maintenance plans)');

insert into public.user_permissions (user_id, permission_key)
select user_id, 'insights.page.view'
from public.user_permissions
where permission_key = 'projects.projects.view_page'
on conflict do nothing;
