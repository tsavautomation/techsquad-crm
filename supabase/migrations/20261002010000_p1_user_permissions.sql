-- P1 Simple permissions (Fred 2026-10-02, SPEC §9.1 P1-a…c): permissions per person instead of groups.
-- Each login holds its own keys (user_permissions) and an Administrator flag (profiles.is_admin).
-- Today's rights are carried over: every person gets the union of their groups' grants (plus Everyone),
-- System Administrators become administrators, and "may act on a workflow level" becomes one key per
-- workflow. The group tables and the WebAuthor-only permissions (features this app doesn't have) go.

-- ---------------------------------------------------------------- 1. administrator flag + per-person grants
alter table public.profiles add column is_admin boolean not null default false;
comment on column public.profiles.is_admin is 'Administrator: holds every permission and may edit permissions.';

create table public.user_permissions (
  user_id uuid not null references public.profiles (id) on delete cascade,
  permission_key text not null references public.permissions (key) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, permission_key)
);
create index user_permissions_key_idx on public.user_permissions (permission_key);
comment on table public.user_permissions is 'What each person may do (SPEC §9.1 P1).';
alter table public.user_permissions enable row level security;

-- ---------------------------------------------------------------- 2. one key per workflow
insert into public.permissions (key, module, resource, action, kind, area, label, description)
select 'workflow.' || w.id || '.act', 'workflow', w.id, 'act', 'action', 'Workflows', 'Act on ' || w.name, 'Move records through the ' || w.name || ' workflow'
from public.workflows w;

-- ---------------------------------------------------------------- 3. carry today's rights over
update public.profiles p
set is_admin = true
where exists (
  select 1 from public.group_members gm join public.groups g on g.id = gm.group_id
  where gm.user_id = p.id and g.slug = 'system_administrators' and g.active
);

-- The union of the person's groups and Everyone. System Administrators' own grants are not copied:
-- administrators hold everything through the flag.
insert into public.user_permissions (user_id, permission_key)
select distinct p.id, gp.permission_key
from public.profiles p
join public.groups g on g.active and g.slug <> 'system_administrators'
  and (g.slug = 'everyone' or exists (select 1 from public.group_members gm where gm.group_id = g.id and gm.user_id = p.id))
join public.group_permissions gp on gp.group_id = g.id
on conflict do nothing;

insert into public.user_permissions (user_id, permission_key)
select distinct gm.user_id, 'workflow.' || l.workflow_id || '.act'
from public.workflow_level_groups lg
join public.workflow_levels l on l.id = lg.level_id
join public.groups g on g.id = lg.group_id and g.active and g.slug <> 'system_administrators'
join public.group_members gm on gm.group_id = lg.group_id
on conflict do nothing;

-- ---------------------------------------------------------------- 4. resolution now reads the person's own rows
create or replace function app.is_sysadmin(p_user uuid default auth.uid())
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.profiles where id = p_user and active and is_admin);
$$;

create or replace function app.has_permission(p_key text, p_user uuid default auth.uid())
returns boolean
language sql stable security definer set search_path = ''
as $$
  select p_user is not null
    and exists (select 1 from public.profiles where id = p_user and active)
    and (
      app.is_sysadmin(p_user)
      or exists (select 1 from public.user_permissions where user_id = p_user and permission_key = p_key)
    );
$$;

create or replace function public.my_permissions()
returns text[]
language sql stable security definer set search_path = ''
as $$
  select case
    when auth.uid() is null or not exists (select 1 from public.profiles where id = auth.uid() and active)
      then array[]::text[]
    when app.is_sysadmin() then (select coalesce(array_agg(key order by key), array[]::text[]) from public.permissions)
    else (select coalesce(array_agg(permission_key order by permission_key), array[]::text[]) from public.user_permissions where user_id = auth.uid())
  end;
$$;

create or replace function app.may_act_on_level(p_level bigint)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select app.is_sysadmin() or exists (
    select 1 from public.workflow_levels l
    where l.id = p_level and app.has_permission('workflow.' || l.workflow_id || '.act')
  );
$$;

-- ---------------------------------------------------------------- 5. who may see and change grants
-- People see their own; user admins see everyone's (the Users screen); only administrators change them.
create policy "read grants" on public.user_permissions
  for select to authenticated
  using (user_id = auth.uid() or app.has_permission('site.admin.members'));
create policy "administrators manage grants" on public.user_permissions
  for all to authenticated
  using (app.is_sysadmin())
  with check (app.is_sysadmin());

-- Only an administrator may make or unmake an administrator.
create or replace function app.profile_guard()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if auth.uid() is null then
    return new;
  end if;
  if (new.active is distinct from old.active or new.email is distinct from old.email)
     and not app.has_permission('site.admin.members') then
    raise exception 'Only user admins can change that.' using errcode = '42501';
  end if;
  if new.is_admin is distinct from old.is_admin and not app.is_sysadmin() then
    raise exception 'Only an administrator can change who is an administrator.' using errcode = '42501';
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------- 6. the groups go
drop table public.workflow_level_groups;
drop table public.group_permissions;
drop table public.group_members;
drop table public.groups;

-- ---------------------------------------------------------------- 7. only the keys this app checks stay
-- (src/lib/permissions/checklist.ts). The WebAuthor-only ones changed nothing here.
delete from public.permissions
where module <> 'workflow' and key not in (
'administrative.employees.archive',
'administrative.employees.create',
'administrative.employees.delete',
'administrative.employees.modify',
'administrative.employees.view_all',
'administrative.employees.view_page',
'administrative.inventory-checkout.archive',
'administrative.inventory-checkout.create',
'administrative.inventory-checkout.delete',
'administrative.inventory-checkout.modify',
'administrative.inventory-checkout.view_all',
'administrative.inventory-checkout.view_page',
'administrative.module.activity_history_add',
'administrative.module.activity_history_view',
'administrative.module.audit_log',
'administrative.module.deleted_items',
'administrative.module.files_add_new',
'administrative.module.files_allow_delete',
'administrative.module.files_view_files_pod',
'administrative.module.notes_allow_delete',
'administrative.module.notes_allow_delete_of_my_notes',
'administrative.module.options_utility_tables',
'administrative.payroll.archive',
'administrative.payroll.create',
'administrative.payroll.delete',
'administrative.payroll.modify',
'administrative.payroll.view_all',
'administrative.payroll.view_page',
'administrative.records.delete_locked',
'administrative.records.lock_unlock',
'administrative.records.modify_locked',
'administrative.rma.archive',
'administrative.rma.create',
'administrative.rma.delete',
'administrative.rma.modify',
'administrative.rma.view_all',
'administrative.rma.view_page',
'administrative.tasks.archive',
'administrative.tasks.create',
'administrative.tasks.delete',
'administrative.tasks.modify',
'administrative.tasks.view_all',
'administrative.tasks.view_page',
'administrative.transactions.archive',
'administrative.transactions.create',
'administrative.transactions.delete',
'administrative.transactions.modify',
'administrative.transactions.view_all',
'administrative.transactions.view_page',
'administrative.vehicles.archive',
'administrative.vehicles.create',
'administrative.vehicles.delete',
'administrative.vehicles.modify',
'administrative.vehicles.view_all',
'administrative.vehicles.view_page',
'forms.job-reports.archive',
'forms.job-reports.create',
'forms.job-reports.delete',
'forms.job-reports.modify',
'forms.job-reports.view_all',
'forms.job-reports.view_page',
'forms.module.activity_history_add',
'forms.module.activity_history_view',
'forms.module.audit_log',
'forms.module.deleted_items',
'forms.module.files_add_new',
'forms.module.files_allow_delete',
'forms.module.files_view_files_pod',
'forms.module.notes_allow_delete',
'forms.module.notes_allow_delete_of_my_notes',
'forms.module.options_utility_tables',
'forms.notes.archive',
'forms.notes.create',
'forms.notes.delete',
'forms.notes.modify',
'forms.notes.view_all',
'forms.notes.view_page',
'forms.records.delete_locked',
'forms.records.lock_unlock',
'forms.records.modify_locked',
'forms.staff-performance.archive',
'forms.staff-performance.create',
'forms.staff-performance.delete',
'forms.staff-performance.modify',
'forms.staff-performance.view_all',
'forms.staff-performance.view_page',
'forms.survey-and-proposals.archive',
'forms.survey-and-proposals.create',
'forms.survey-and-proposals.delete',
'forms.survey-and-proposals.modify',
'forms.survey-and-proposals.view_all',
'forms.survey-and-proposals.view_page',
'forms.tv-installations.archive',
'forms.tv-installations.create',
'forms.tv-installations.delete',
'forms.tv-installations.modify',
'forms.tv-installations.view_all',
'forms.tv-installations.view_page',
'inventory.module.activity_history_add',
'inventory.module.activity_history_view',
'inventory.module.audit_log',
'inventory.module.deleted_items',
'inventory.module.files_add_new',
'inventory.module.files_allow_delete',
'inventory.module.files_view_files_pod',
'inventory.module.notes_allow_delete',
'inventory.module.notes_allow_delete_of_my_notes',
'inventory.module.options_utility_tables',
'inventory.products.archive',
'inventory.products.create',
'inventory.products.delete',
'inventory.products.delete_locked',
'inventory.products.lock_unlock',
'inventory.products.modify',
'inventory.products.modify_locked',
'inventory.products.view_all',
'inventory.products.view_page',
'inventory.sales.archive',
'inventory.sales.create',
'inventory.sales.delete',
'inventory.sales.modify',
'inventory.sales.view_all',
'inventory.sales.view_page',
'inventory.stock.archive',
'inventory.stock.create',
'inventory.stock.delete',
'inventory.stock.modify',
'inventory.stock.view_all',
'inventory.stock.view_page',
'projects.buildings.archive',
'projects.buildings.create',
'projects.buildings.delete',
'projects.buildings.modify',
'projects.buildings.view_all',
'projects.buildings.view_page',
'projects.contacts.archive',
'projects.contacts.create',
'projects.contacts.delete',
'projects.contacts.modify',
'projects.contacts.view_all',
'projects.contacts.view_page',
'projects.module.activity_history_add',
'projects.module.activity_history_view',
'projects.module.audit_log',
'projects.module.deleted_items',
'projects.module.design_design',
'projects.module.design_triggers',
'projects.module.files_add_new',
'projects.module.files_allow_delete',
'projects.module.files_view_files_pod',
'projects.module.notes_allow_delete',
'projects.module.notes_allow_delete_of_my_notes',
'projects.module.options_utility_tables',
'projects.organizations.archive',
'projects.organizations.create',
'projects.organizations.delete',
'projects.organizations.modify',
'projects.organizations.view_all',
'projects.organizations.view_page',
'projects.permits.archive',
'projects.permits.create',
'projects.permits.delete',
'projects.permits.modify',
'projects.permits.view_all',
'projects.permits.view_page',
'projects.projects.archive',
'projects.projects.create',
'projects.projects.delete',
'projects.projects.delete_locked',
'projects.projects.lock_unlock',
'projects.projects.modify',
'projects.projects.modify_locked',
'projects.projects.view_all',
'projects.projects.view_page',
'projects.punch-list.archive',
'projects.punch-list.create',
'projects.punch-list.delete',
'projects.punch-list.modify',
'projects.punch-list.view_all',
'projects.punch-list.view_page',
'schedule.module.activity_history_add',
'schedule.module.activity_history_view',
'schedule.module.audit_log',
'schedule.module.deleted_items',
'schedule.module.files_add_new',
'schedule.module.files_allow_delete',
'schedule.module.files_view_files_pod',
'schedule.module.notes_allow_delete',
'schedule.module.notes_allow_delete_of_my_notes',
'schedule.module.options_utility_tables',
'schedule.visits.archive',
'schedule.visits.create',
'schedule.visits.delete',
'schedule.visits.modify',
'schedule.visits.view_all',
'schedule.visits.view_page',
'site.admin.add_new_member',
'site.admin.members'
);
