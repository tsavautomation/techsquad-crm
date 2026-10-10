-- F6 Client portal (SPEC §9.1 F6, Fred 2026-10-10): customers get their own login and see, per project,
-- the visits, the money, the system credentials, the apps they use, documents the office picked, their
-- maintenance plan and their own service requests (with photos / videos). Nothing is shown unless a view
-- below selects it on purpose: client logins hold no staff permission at all.

-- ---------------------------------------------------------------- 1. client logins
alter table public.profiles add column contact_id bigint references public.contacts (id) on delete set null;
comment on column public.profiles.contact_id is 'Set = a client login for the customer portal (the Contact it belongs to). Null = staff.';
create unique index profiles_contact_id_key on public.profiles (contact_id) where contact_id is not null;

create or replace function app.is_client(p_user uuid default auth.uid())
returns boolean
language sql stable security definer set search_path = ''
as $$
  select p_user is not null and exists (select 1 from public.profiles where id = p_user and contact_id is not null);
$$;
revoke execute on function app.is_client(uuid) from public, anon;
grant execute on function app.is_client(uuid) to authenticated;

-- Clients hold no staff permission, whatever user_permissions says.
create or replace function app.has_permission(p_key text, p_user uuid default auth.uid())
returns boolean
language sql stable security definer set search_path = ''
as $$
  select p_user is not null
    and exists (select 1 from public.profiles where id = p_user and active and contact_id is null)
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
    when auth.uid() is null or not exists (select 1 from public.profiles where id = auth.uid() and active and contact_id is null)
      then array[]::text[]
    when app.is_sysadmin() then (select coalesce(array_agg(key order by key), array[]::text[]) from public.permissions)
    else (select coalesce(array_agg(permission_key order by permission_key), array[]::text[]) from public.user_permissions where user_id = auth.uid())
  end;
$$;

-- The invite carries the contact id in the user metadata.
create or replace function app.handle_new_user()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, email, first_name, last_name, contact_id)
  values (
    new.id,
    new.email,
    nullif(new.raw_user_meta_data ->> 'first_name', ''),
    nullif(new.raw_user_meta_data ->> 'last_name', ''),
    nullif(new.raw_user_meta_data ->> 'contact_id', '')::bigint
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

-- ---------------------------------------------------------------- 2. who sees which project
create table public.portal_access (
  project_id bigint not null references public.projects (id) on delete cascade,
  contact_id bigint not null references public.contacts (id) on delete cascade,
  invited_at timestamptz,
  invited_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (project_id, contact_id)
);
comment on table public.portal_access is 'Customer portal: which Contact may see which Project (F6).';
create index on public.portal_access (contact_id);

create or replace function app.portal_contact(p_user uuid default auth.uid())
returns bigint
language sql stable security definer set search_path = ''
as $$
  select contact_id from public.profiles where id = p_user and active;
$$;
create or replace function app.portal_project(p_project bigint)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.portal_access a
    where a.project_id = p_project and a.contact_id = app.portal_contact()
  );
$$;
revoke execute on function app.portal_contact(uuid), app.portal_project(bigint) from public, anon;
grant execute on function app.portal_contact(uuid), app.portal_project(bigint) to authenticated;

alter table public.portal_access enable row level security;
create policy "staff view" on public.portal_access for select to authenticated
  using (exists (select 1 from public.projects p where p.id = project_id));
create policy "staff add" on public.portal_access for insert to authenticated
  with check ((select app.can_do('projects', 'modify')) and exists (select 1 from public.projects p where p.id = project_id));
create policy "staff update" on public.portal_access for update to authenticated
  using ((select app.can_do('projects', 'modify')) and exists (select 1 from public.projects p where p.id = project_id));
create policy "staff remove" on public.portal_access for delete to authenticated
  using ((select app.can_do('projects', 'modify')) and exists (select 1 from public.projects p where p.id = project_id));

-- ---------------------------------------------------------------- 3. maintenance plan details and plan visits
alter table public.projects
  add column maintenance_expires_on date,
  add column maintenance_visits_included integer,
  add column maintenance_includes text;
comment on column public.projects.maintenance_expires_on is 'Expires on';
comment on column public.projects.maintenance_visits_included is 'Visits included';
comment on column public.projects.maintenance_includes is 'What it includes';

alter table public.visits add column maintenance_visit boolean not null default false;
comment on column public.visits.maintenance_visit is 'Counts toward the maintenance plan';

-- ---------------------------------------------------------------- 4. documents for clients
create table public.portal_documents (
  id bigint generated by default as identity primary key,
  title text,
  category text,
  project_id bigint references public.projects (id) on delete cascade,
  notes text,
  locked boolean not null default false,
  submitted_at timestamptz,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid() references public.profiles (id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid default auth.uid() references public.profiles (id) on delete set null,
  archived_at timestamptz,
  deleted_at timestamptz
);
comment on table public.portal_documents is 'Client Documents — PDFs the customer portal can show: manuals, guides, warranties (library) or a file for one project (F6)';
comment on column public.portal_documents.title is 'Title';
comment on column public.portal_documents.category is 'Category';
comment on column public.portal_documents.project_id is 'Only for this project';
comment on column public.portal_documents.notes is 'Notes';
create index on public.portal_documents (project_id);

-- Library documents ticked for a project.
create table public.portal_document_projects (
  document_id bigint not null references public.portal_documents (id) on delete cascade,
  project_id bigint not null references public.projects (id) on delete cascade,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid() references public.profiles (id) on delete set null,
  primary key (document_id, project_id)
);
create index on public.portal_document_projects (project_id);

-- ---------------------------------------------------------------- 5. apps the client uses
create table public.portal_apps (
  id bigint generated by default as identity primary key,
  title text,
  purpose text,
  ios_url text,
  android_url text,
  web_url text,
  locked boolean not null default false,
  submitted_at timestamptz,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid() references public.profiles (id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid default auth.uid() references public.profiles (id) on delete set null,
  archived_at timestamptz,
  deleted_at timestamptz
);
comment on table public.portal_apps is 'Client Apps — the apps a customer may need (Crestron Home, Lutron…) with their store links (F6)';
comment on column public.portal_apps.title is 'App';
comment on column public.portal_apps.purpose is 'What it is for';
comment on column public.portal_apps.ios_url is 'App Store link (iPhone)';
comment on column public.portal_apps.android_url is 'Google Play link (Android)';
comment on column public.portal_apps.web_url is 'Website';

create table public.portal_app_projects (
  app_id bigint not null references public.portal_apps (id) on delete cascade,
  project_id bigint not null references public.projects (id) on delete cascade,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid() references public.profiles (id) on delete set null,
  primary key (app_id, project_id)
);
create index on public.portal_app_projects (project_id);

-- ---------------------------------------------------------------- 6. service requests from the portal
create table public.service_requests (
  id bigint generated by default as identity primary key,
  title text,
  project_id bigint not null references public.projects (id) on delete cascade,
  contact_id bigint references public.contacts (id) on delete set null,
  kind text,
  description text,
  status text not null default 'Requested',
  visit_id bigint references public.visits (id) on delete set null,
  office_notes text,
  locked boolean not null default false,
  submitted_at timestamptz,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid() references public.profiles (id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid default auth.uid() references public.profiles (id) on delete set null,
  archived_at timestamptz,
  deleted_at timestamptz
);
comment on table public.service_requests is 'Service Requests — what a customer asked for in the portal; the office confirms by phone and schedules (F6)';
comment on column public.service_requests.kind is 'Type';
comment on column public.service_requests.description is 'What is going on';
comment on column public.service_requests.status is 'Status';
comment on column public.service_requests.visit_id is 'Visit';
comment on column public.service_requests.office_notes is 'Office notes';
create index on public.service_requests (project_id);
create index on public.service_requests (status) where status = 'Requested';

insert into app.record_types (table_name, label, module, resource, parent_table, parent_column, lock_resource, sensitive_columns) values
  ('service_requests', 'Service Requests', 'projects', null, 'projects', 'project_id', null, '{}'),
  ('portal_documents', 'Client Documents', 'administrative', 'portal-documents', null, null, null, '{}'),
  ('portal_apps', 'Client Apps', 'administrative', 'portal-apps', null, null, null, '{}');

create trigger before_write before insert or update on public.service_requests for each row execute function app.record_before_write();
create trigger audit after insert or update on public.service_requests for each row execute function app.record_audit();
create trigger before_write before insert or update on public.portal_documents for each row execute function app.record_before_write();
create trigger audit after insert or update on public.portal_documents for each row execute function app.record_audit();
create trigger before_write before insert or update on public.portal_apps for each row execute function app.record_before_write();
create trigger audit after insert or update on public.portal_apps for each row execute function app.record_audit();

-- ---------------------------------------------------------------- 7. policies
alter table public.portal_documents enable row level security;
create policy "view" on public.portal_documents for select to authenticated using ((select app.can_view_all('portal_documents')) or (created_by = (select auth.uid()) and (select app.can_view_page('portal_documents'))));
create policy "create" on public.portal_documents for insert to authenticated with check ((select app.can_do('portal_documents', 'create')));
create policy "modify" on public.portal_documents for update to authenticated using (((select app.can_view_all('portal_documents')) or (created_by = (select auth.uid()) and (select app.can_view_page('portal_documents')))) and ((select app.can_do('portal_documents', 'modify')) or (select app.can_do('portal_documents', 'delete')) or (select app.can_do('portal_documents', 'archive')))) with check (((select app.can_do('portal_documents', 'modify')) or (select app.can_do('portal_documents', 'delete')) or (select app.can_do('portal_documents', 'archive'))));

alter table public.portal_apps enable row level security;
create policy "view" on public.portal_apps for select to authenticated using ((select app.can_view_all('portal_apps')) or (created_by = (select auth.uid()) and (select app.can_view_page('portal_apps'))));
create policy "create" on public.portal_apps for insert to authenticated with check ((select app.can_do('portal_apps', 'create')));
create policy "modify" on public.portal_apps for update to authenticated using (((select app.can_view_all('portal_apps')) or (created_by = (select auth.uid()) and (select app.can_view_page('portal_apps')))) and ((select app.can_do('portal_apps', 'modify')) or (select app.can_do('portal_apps', 'delete')) or (select app.can_do('portal_apps', 'archive')))) with check (((select app.can_do('portal_apps', 'modify')) or (select app.can_do('portal_apps', 'delete')) or (select app.can_do('portal_apps', 'archive'))));

-- Ticking documents / apps for a project = modifying the project.
alter table public.portal_document_projects enable row level security;
create policy "staff view" on public.portal_document_projects for select to authenticated using (exists (select 1 from public.projects p where p.id = project_id));
create policy "staff add" on public.portal_document_projects for insert to authenticated with check ((select app.can_do('projects', 'modify')) and exists (select 1 from public.projects p where p.id = project_id));
create policy "staff remove" on public.portal_document_projects for delete to authenticated using ((select app.can_do('projects', 'modify')) and exists (select 1 from public.projects p where p.id = project_id));
alter table public.portal_app_projects enable row level security;
create policy "staff view" on public.portal_app_projects for select to authenticated using (exists (select 1 from public.projects p where p.id = project_id));
create policy "staff add" on public.portal_app_projects for insert to authenticated with check ((select app.can_do('projects', 'modify')) and exists (select 1 from public.projects p where p.id = project_id));
create policy "staff remove" on public.portal_app_projects for delete to authenticated using ((select app.can_do('projects', 'modify')) and exists (select 1 from public.projects p where p.id = project_id));

-- Service requests: staff as a sub-list of the project; clients see and add their own projects' requests.
alter table public.service_requests enable row level security;
create policy "view" on public.service_requests for select to authenticated using (exists (select 1 from public.projects p where p.id = project_id));
create policy "create" on public.service_requests for insert to authenticated with check (exists (select 1 from public.projects p where p.id = project_id) and (select app.can_do('service_requests', 'create')));
create policy "modify" on public.service_requests for update to authenticated using (exists (select 1 from public.projects p where p.id = project_id) and (select app.can_do('service_requests', 'modify'))) with check (exists (select 1 from public.projects p where p.id = project_id));
create policy "client view" on public.service_requests for select to authenticated using ((select app.portal_project(project_id)));
create policy "client add" on public.service_requests for insert to authenticated
  with check ((select app.portal_project(project_id)) and contact_id = (select app.portal_contact()) and status = 'Requested' and visit_id is null and office_notes is null);

-- Photos and videos on a client's own request.
create policy "portal add" on public.attachments for insert to authenticated
  with check (
    (select app.is_client()) and table_name = 'service_requests' and field = 'media' and created_by = (select auth.uid())
    and exists (select 1 from public.service_requests r where r.id = record_id and app.portal_project(r.project_id))
  );
create policy "portal upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'attachments' and (select app.is_client()) and (storage.foldername(name))[1] = 'service_requests');

-- ---------------------------------------------------------------- 8. what the portal shows (security-definer views: the WHERE is the whole access rule)
create view public.portal_projects as
  select p.id, p.title, p.job_status, p.type, p.job_address, p.apartment_or_unit, p.start_date,
         p.system_credentials, p.systems,
         p.maintenance_plan, p.maintenance_type, p.maintenance_status, p.maintenance_purchase_date, p.maintenance_amount,
         p.maintenance_expires_on, p.maintenance_visits_included, p.maintenance_includes,
         (select coalesce(sum(t.amount), 0) from public.transactions t where t.project_id = p.id and t.deleted_at is null and t.type = 'Proposal') as approved_amount,
         (select coalesce(sum(t.amount), 0) from public.transactions t where t.project_id = p.id and t.deleted_at is null and t.type = 'Invoice') as invoiced_amount,
         (select coalesce(sum(t.amount), 0) from public.transactions t where t.project_id = p.id and t.deleted_at is null and t.type = 'Payment') as paid_amount,
         (select count(*) from public.visits v where v.project_id = p.id and v.deleted_at is null and v.maintenance_visit and v.status = 'Done'
            and (p.maintenance_purchase_date is null or v.starts_at::date >= p.maintenance_purchase_date)
            and (p.maintenance_expires_on is null or v.starts_at::date <= p.maintenance_expires_on)) as maintenance_visits_used
  from public.projects p
  where p.deleted_at is null and app.portal_project(p.id);

create view public.portal_visits as
  select v.id, v.project_id, v.starts_at, v.duration, v.arrival_window, v.service_type, v.status, v.billing,
         v.on_way_at, v.checked_in_at, v.checked_out_at, v.maintenance_visit,
         e.first_name as technician_first_name
  from public.visits v
  left join public.employees e on e.id = v.technician_id
  where v.deleted_at is null and v.status in ('Scheduled', 'On the way', 'On site', 'Done') and app.portal_project(v.project_id);

create view public.portal_transactions as
  select t.id, t.project_id, t.type, t.amount, t.date, t.description, t.portal_number
  from public.transactions t
  where t.deleted_at is null and t.archived_at is null and t.type in ('Proposal', 'Invoice', 'Payment', 'Credit') and app.portal_project(t.project_id);

create view public.portal_my_documents as
  select d.id, d.title, d.category, d.notes, d.created_at, pr.project_id
  from public.portal_documents d
  join lateral (
    select d.project_id where d.project_id is not null
    union
    select dp.project_id from public.portal_document_projects dp where dp.document_id = d.id and d.project_id is null
  ) pr on true
  where d.deleted_at is null and d.archived_at is null and app.portal_project(pr.project_id);

create view public.portal_my_apps as
  select a.id, a.title, a.purpose, a.ios_url, a.android_url, a.web_url, ap.project_id
  from public.portal_apps a
  join public.portal_app_projects ap on ap.app_id = a.id
  where a.deleted_at is null and a.archived_at is null and app.portal_project(ap.project_id);

-- Files a client may open: documents shown to them, proposal / invoice PDFs of their projects, their own requests' media.
create view public.portal_files as
  select at.id, at.table_name, at.record_id, at.field, at.provider, at.provider_path, at.file_name, at.mime_type, at.size_bytes
  from public.attachments at
  where at.deleted_at is null and (
       (at.table_name = 'portal_documents' and at.record_id in (select id from public.portal_my_documents))
    or (at.table_name = 'transactions' and at.field = 'pdf' and at.record_id in (select id from public.portal_transactions))
    or (at.table_name = 'service_requests' and at.record_id in (select r.id from public.service_requests r where r.deleted_at is null and app.portal_project(r.project_id)))
  );

grant select on public.portal_projects, public.portal_visits, public.portal_transactions, public.portal_my_documents, public.portal_my_apps, public.portal_files to authenticated;

-- ---------------------------------------------------------------- 9. permissions for the two admin lists
insert into public.permissions (key, module, resource, action, kind, area, label, description) values
  ('administrative.portal-documents.view_page', 'administrative', 'portal-documents', 'view_page', 'page', 'Client portal', 'Client Documents', 'See the documents the customer portal can show'),
  ('administrative.portal-documents.view_all', 'administrative', 'portal-documents', 'view_all', 'action', 'Client portal', 'Client Documents: View All', 'See every client document, not only the ones you added'),
  ('administrative.portal-documents.create', 'administrative', 'portal-documents', 'create', 'action', 'Client portal', 'Client Documents: Add', 'Add client documents'),
  ('administrative.portal-documents.modify', 'administrative', 'portal-documents', 'modify', 'action', 'Client portal', 'Client Documents: Modify', 'Change client documents'),
  ('administrative.portal-documents.delete', 'administrative', 'portal-documents', 'delete', 'action', 'Client portal', 'Client Documents: Delete', 'Delete client documents (they can be restored)'),
  ('administrative.portal-documents.archive', 'administrative', 'portal-documents', 'archive', 'action', 'Client portal', 'Client Documents: Archive', 'Archive and unarchive client documents'),
  ('administrative.portal-apps.view_page', 'administrative', 'portal-apps', 'view_page', 'page', 'Client portal', 'Client Apps', 'See the apps list the customer portal can show'),
  ('administrative.portal-apps.view_all', 'administrative', 'portal-apps', 'view_all', 'action', 'Client portal', 'Client Apps: View All', 'See every client app, not only the ones you added'),
  ('administrative.portal-apps.create', 'administrative', 'portal-apps', 'create', 'action', 'Client portal', 'Client Apps: Add', 'Add client apps'),
  ('administrative.portal-apps.modify', 'administrative', 'portal-apps', 'modify', 'action', 'Client portal', 'Client Apps: Modify', 'Change client apps'),
  ('administrative.portal-apps.delete', 'administrative', 'portal-apps', 'delete', 'action', 'Client portal', 'Client Apps: Delete', 'Delete client apps (they can be restored)'),
  ('administrative.portal-apps.archive', 'administrative', 'portal-apps', 'archive', 'action', 'Client portal', 'Client Apps: Archive', 'Archive and unarchive client apps');

-- Everyone on staff sees both lists; the office (as for Documents, F23) keeps them. Administrators always can.
insert into public.user_permissions (user_id, permission_key)
select p.id, k
from public.profiles p
cross join unnest(array['administrative.portal-documents.view_page', 'administrative.portal-documents.view_all', 'administrative.portal-apps.view_page', 'administrative.portal-apps.view_all']) k
where p.contact_id is null
on conflict do nothing;
insert into public.user_permissions (user_id, permission_key)
select p.id, k
from public.profiles p
cross join unnest(array[
  'administrative.portal-documents.create', 'administrative.portal-documents.modify', 'administrative.portal-documents.archive', 'administrative.portal-documents.delete',
  'administrative.portal-apps.create', 'administrative.portal-apps.modify', 'administrative.portal-apps.archive', 'administrative.portal-apps.delete']) k
where lower(p.email) in ('jessica@tsav.net', 'luana@tsav.net', 'lucas@tsav.net', 'saulo@tsav.net')
on conflict do nothing;
