-- FIN-o (2026-11-03): a proposal replaced by a newer version (transactions.superseded_by_id) is history.
-- It stays in the table but never counts as Approved: here in project_financials() and the customer
-- portal views, and in src/lib/finance/load.ts for the Finance pages.

create or replace function public.project_financials(p_project_ids bigint[])
returns table (
  project_id bigint,
  approved_amount numeric, invoiced_amount numeric, paid_amount numeric,
  discount_amount numeric, cc_fee_amount numeric, tip_amount numeric,
  sales_tax numeric, parts_cost numeric,
  open_invoice_dues date[],
  job_status text, category text,
  commission_percent numeric, commission_amount numeric
)
language sql stable security definer set search_path = ''
as $$
  select p.id,
    coalesce(sum(t.amount) filter (where t.type = 'Proposal' and t.superseded_by_id is null), 0),
    coalesce(sum(t.amount) filter (where t.type = 'Invoice'), 0),
    coalesce(sum(t.amount) filter (where t.type = 'Payment'), 0),
    coalesce(sum(t.discount) filter (where t.type = 'Payment'), 0),
    coalesce(sum(t.cc_fee) filter (where t.type = 'Payment'), 0),
    coalesce(sum(t.tip) filter (where t.type = 'Payment'), 0),
    coalesce(sum(t.sales_tax) filter (where t.type = 'Proposal' and t.superseded_by_id is null), 0),
    coalesce(sum(t.parts_cost) filter (where t.type = 'Proposal' and t.superseded_by_id is null), 0),
    -- due dates of invoices still open (no status, or anything but Paid / Declined)
    coalesce(array_agg(t.due_date order by t.due_date) filter (where t.type = 'Invoice' and t.due_date is not null and coalesce(t.invoice_status, '') not in ('Paid', 'Declined')), '{}'::date[]),
    p.job_status, p.category, p.commission_percent, p.commission_amount
  from public.projects p
  left join public.transactions t
    on t.project_id = p.id and t.deleted_at is null and t.payment_type = 'Apply to Project'
  where p.id = any (p_project_ids)
    and (app.can_view_all('projects') or (p.created_by = auth.uid() and app.can_view_page('projects')))
  group by p.id;
$$;

create or replace view public.portal_projects as
  select p.id, p.title, p.job_status, p.type, p.job_address, p.apartment_or_unit, p.start_date,
         p.system_credentials, p.systems,
         p.maintenance_plan, p.maintenance_type, p.maintenance_status, p.maintenance_purchase_date, p.maintenance_amount,
         p.maintenance_expires_on, p.maintenance_visits_included, p.maintenance_includes,
         (select coalesce(sum(t.amount), 0) from public.transactions t where t.project_id = p.id and t.deleted_at is null and t.payment_type = 'Apply to Project' and t.type = 'Proposal' and t.superseded_by_id is null) as approved_amount,
         (select coalesce(sum(t.amount), 0) from public.transactions t where t.project_id = p.id and t.deleted_at is null and t.payment_type = 'Apply to Project' and t.type = 'Invoice') as invoiced_amount,
         (select coalesce(sum(t.amount), 0) from public.transactions t where t.project_id = p.id and t.deleted_at is null and t.payment_type = 'Apply to Project' and t.type = 'Payment') as paid_amount,
         (select count(*) from public.visits v where v.project_id = p.id and v.deleted_at is null and v.maintenance_visit and v.status = 'Done'
            and (p.maintenance_purchase_date is null or v.starts_at::date >= p.maintenance_purchase_date)
            and (p.maintenance_expires_on is null or v.starts_at::date <= p.maintenance_expires_on)) as maintenance_visits_used
  from public.projects p
  where p.deleted_at is null and app.portal_project(p.id);

create or replace view public.portal_transactions as
  select t.id, t.project_id, t.type, t.amount, t.date, t.description, t.portal_number
  from public.transactions t
  where t.deleted_at is null and t.archived_at is null and t.payment_type = 'Apply to Project'
    and t.superseded_by_id is null
    and t.type in ('Proposal', 'Invoice', 'Payment', 'Credit') and app.portal_project(t.project_id);
