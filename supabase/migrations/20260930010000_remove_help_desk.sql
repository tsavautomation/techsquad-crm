-- Fred 2026-09-30: delete TS Help Desk completely (Tickets, Support Notes, Articles, Knowledge Base
-- Categories). Its WebAuthor data will not be imported. SPEC §9.1 H-a.

-- Workflow "Help Desk" (imported inactive, M9) and anything that ran on these tables.
delete from public.workflow_events where table_name in ('support_tickets', 'support_notes', 'kb_articles', 'kb_categories');
delete from public.record_workflow_state where table_name in ('support_tickets', 'support_notes', 'kb_articles', 'kb_categories');
delete from public.workflows where table_name = 'support_tickets';

-- Generic record features keyed by table name.
delete from public.automations where table_name in ('support_tickets', 'support_notes', 'kb_articles', 'kb_categories');
delete from public.field_settings where table_name in ('support_tickets', 'support_notes', 'kb_articles', 'kb_categories');
delete from public.record_notes where table_name in ('support_tickets', 'support_notes', 'kb_articles', 'kb_categories');
delete from public.record_comments where table_name in ('support_tickets', 'support_notes', 'kb_articles', 'kb_categories');
delete from public.record_checklist_items where table_name in ('support_tickets', 'support_notes', 'kb_articles', 'kb_categories');
delete from public.attachments where table_name in ('support_tickets', 'support_notes', 'kb_articles', 'kb_categories');
delete from public.audit_log where table_name in ('support_tickets', 'support_notes', 'kb_articles', 'kb_categories');

drop table public.kb_articles_audience_group;
drop table public.support_notes;
drop table public.support_tickets;
drop table public.kb_articles;
drop table public.kb_categories;
delete from app.record_types where table_name in ('support_tickets', 'support_notes', 'kb_articles', 'kb_categories');

-- Its permissions (group grants go with them).
delete from public.permissions where module = 'help-desk';

-- Utility lists no longer include the Help Desk "utility tables" permission.
create or replace function app.can_manage_utility()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select app.has_permission('projects.module.options_utility_tables')
      or app.has_permission('administrative.module.options_utility_tables')
      or app.has_permission('inventory.module.options_utility_tables');
$$;
