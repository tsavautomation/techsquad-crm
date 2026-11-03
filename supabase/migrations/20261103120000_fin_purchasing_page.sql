-- FIN-p (Fred 2026-11-03): Purchasing leaves the Finance tab and becomes Administrative › Purchasing with its own
-- permission, so people without Finance can plan the buying. The lines are read through a security-definer function
-- that checks that permission (Transactions and Finance holders see it too), because those people cannot read the
-- transactions table itself.
insert into public.permissions (key, module, resource, action, kind, area, label, description) values
  ('administrative.purchasing.view_page', 'administrative', 'purchasing', 'view_page', 'page', 'Purchasing', 'Purchasing', 'Administrative › Purchasing: cost to buy by manufacturer, supplier or type over the proposals of the open projects')
on conflict (key) do nothing;
-- Starts with the Finance holders; administrators give it to the buyers.
insert into public.user_permissions (user_id, permission_key)
select up.user_id, 'administrative.purchasing.view_page' from public.user_permissions up
where up.permission_key = 'administrative.finance.view_page'
on conflict do nothing;

create or replace function public.purchasing_items(p_statuses text[], p_year integer default null)
returns table (
  id bigint, project_id bigint, project text, job_status text,
  brand text, model text, name text, item_type text, supplier text,
  quantity numeric, cost numeric, sell_price numeric, msrp numeric, total numeric
)
language sql stable security definer set search_path = ''
as $$
  select i.id, p.id, p.title, p.job_status,
         i.brand, i.model, i.name, i.item_type, i.supplier,
         i.quantity, i.cost, i.sell_price, i.msrp, i.total
  from public.proposal_items i
  join public.transactions t on t.id = i.transaction_id and t.deleted_at is null and t.payment_type = 'Apply to Project' and t.type = 'Proposal'
  join public.projects p on p.id = t.project_id and p.deleted_at is null
  where p.category = 'Low Voltage'
    and p.job_status = any (p_statuses)
    and (p_year is null or (t.date >= make_date(p_year, 1, 1) and t.date <= make_date(p_year, 12, 31)))
    and (app.has_permission('administrative.purchasing.view_page') or app.has_permission('administrative.finance.view_page') or app.has_permission('administrative.transactions.view_page'))
  order by i.id;
$$;
revoke execute on function public.purchasing_items(text[], integer) from public, anon;
grant execute on function public.purchasing_items(text[], integer) to authenticated;
