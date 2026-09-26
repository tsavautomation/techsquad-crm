-- M12 permission review with Fred (SPEC §9.1 M12-a … M12-d).

-- M12-a  Everyone no longer sees all Projects, Contacts, Organizations, Buildings and Permits;
--        each group grants what its people need.
delete from public.group_permissions gp
using public.groups g
where g.id = gp.group_id and g.slug = 'everyone'
  and gp.permission_key ~ '^projects\.(projects|contacts|organizations|buildings|permits)\.';

-- M12-b  Each FLEX form gets its own record permissions (WebAuthor shared one set, so technicians
--        could read everyone's Staff Performance). Lock / unlock permissions stay shared.
with forms(tab, title) as (
  values ('job-reports', 'Job Report'), ('notes', 'Note'), ('staff-performance', 'Staff Performance'),
         ('survey-and-proposals', 'Survey and Proposals'), ('tv-installations', 'TV Installation')
), actions(action, kind, label, description) as (
  values ('view_page', 'page', 'View Records', 'See the tab and records you created'),
         ('view_all', 'action', 'View All', 'See every record, not only your own'),
         ('create', 'action', 'Add Records', 'Add new records'),
         ('modify', 'action', 'Modify Records', 'Change existing records'),
         ('delete', 'action', 'Delete Records', 'Delete records (they can be restored)'),
         ('archive', 'action', 'Archive', 'Archive and unarchive records')
)
insert into public.permissions (key, module, resource, action, kind, area, label, description)
select 'forms.' || f.tab || '.' || a.action, 'forms', f.tab, a.action, a.kind, f.title, f.title || ': ' || a.label, a.description
from forms f cross join actions a;

-- Everyone who had a shared form permission keeps it on every form …
insert into public.group_permissions (group_id, permission_key)
select gp.group_id, 'forms.' || f.tab || '.' || p.action
from public.group_permissions gp
join public.permissions p on p.key = gp.permission_key
cross join (values ('job-reports'), ('notes'), ('staff-performance'), ('survey-and-proposals'), ('tv-installations')) f(tab)
where p.module = 'forms' and p.resource = 'records' and p.action in ('view_page', 'view_all', 'create', 'modify', 'delete', 'archive')
on conflict do nothing;

-- … except Technicians, who no longer see Staff Performance at all.
delete from public.group_permissions gp
using public.groups g
where g.id = gp.group_id and g.slug = 'technician' and gp.permission_key like 'forms.staff-performance.%';

-- The shared keys no longer control anything; their grants go so the matrix isn't misleading.
delete from public.group_permissions
where permission_key in ('forms.records.view_page', 'forms.records.view_all', 'forms.records.create', 'forms.records.modify', 'forms.records.delete', 'forms.records.archive');

update app.record_types set resource = case table_name
    when 'job_reports' then 'job-reports'
    when 'form_notes' then 'notes'
    when 'staff_performance' then 'staff-performance'
    when 'survey_proposals' then 'survey-and-proposals'
    when 'tv_installations' then 'tv-installations'
  end
where table_name in ('job_reports', 'form_notes', 'staff_performance', 'survey_proposals', 'tv_installations');

-- M12-c  The unused "Test" group (no members, near-full access) is switched off.
update public.groups set active = false where slug = 'test';

-- M12-d  Office Management and COO get the same Inventory access as Admin.
insert into public.group_permissions (group_id, permission_key)
select g.id, gp.permission_key
from public.group_permissions gp
join public.groups a on a.id = gp.group_id and a.slug = 'admin'
cross join public.groups g
where g.slug in ('office_management', 'coo') and gp.permission_key like 'inventory.%'
on conflict do nothing;
