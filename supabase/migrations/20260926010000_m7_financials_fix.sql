-- M7 fix (SPEC §9.1): Projects › Approved / Invoiced / Paid count only transactions whose
-- Payment Type is "Apply to Project". A transaction switched to "Pay Individual/Organization"
-- keeps its hidden project and type values, and must not change a project's totals.

create or replace function public.project_financials(p_project_ids bigint[])
returns table (project_id bigint, approved_amount numeric, invoiced_amount numeric, paid_amount numeric)
language sql stable security definer set search_path = ''
as $$
  select p.id,
    coalesce(sum(t.amount) filter (where t.type = 'Proposal'), 0),
    coalesce(sum(t.amount) filter (where t.type = 'Invoice'), 0),
    coalesce(sum(t.amount) filter (where t.type = 'Payment'), 0)
  from public.projects p
  left join public.transactions t
    on t.project_id = p.id and t.deleted_at is null and t.payment_type = 'Apply to Project'
  where p.id = any (p_project_ids)
    and (app.can_view_all('projects') or (p.created_by = auth.uid() and app.can_view_page('projects')))
  group by p.id;
$$;
