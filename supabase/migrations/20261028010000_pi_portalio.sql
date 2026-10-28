-- PI Portal.io integration (Fred 2026-10-28, SPEC §9.1 PI-a…PI-h). Portal.io granted API access; the CRM mirrors
-- proposals, offers accepted ones for linking (never creating clients by itself), computes a payment status every
-- project reader can see, keeps the commission set for a project, and gains Administrative › Finance.

-- PI-b: the mirror. One row per Portal.io proposal, keyed by Portal.io's own id. Filled by the service role only.
create table public.portal_proposals (
  id bigint primary key,                                   -- Portal.io proposal id
  number integer,                                          -- the number people see ("Portal #")
  name text,
  status text,                                             -- Draft / Submitted / ViewedByClient / Accepted / Declined / Delayed / Completed / EmailFailed / Expired
  total numeric(12,2),
  currency text,
  customer jsonb,                                          -- {id, partyType, contactType, firstName, lastName, companyName, email, phone}
  location jsonb,                                          -- {street, suite, city, state, stateAbbrev, postalCode, country}
  salesperson jsonb,                                       -- {id, email, firstName, lastName}
  payment_requests jsonb not null default '[]'::jsonb,     -- [{id, status, amount, dueDate, description, paymentMethod}]
  change_orders jsonb not null default '[]'::jsonb,        -- [{id, number, name, status, total}]
  items_count integer,
  portal_created_at timestamptz,
  portal_modified_at timestamptz,
  accepted_at timestamptz,                                 -- clientLastDecisionDate while status is Accepted
  archived boolean not null default false,
  detail jsonb,                                            -- the full GET /public/proposals/{id} answer
  -- PI-c / PI-e: how the CRM dealt with it
  project_id bigint references public.projects (id) on delete set null,
  transaction_id bigint references public.transactions (id) on delete set null,
  synced_total numeric(12,2),                              -- the total the Transaction carries (Link / Refresh / Replace / Keep as is)
  synced_name text,
  synced_change_orders jsonb,
  link_status text not null default 'new' check (link_status in ('new', 'linked', 'ignored')),
  linked_at timestamptz,
  linked_by uuid references public.profiles (id) on delete set null,
  suggestions jsonb,                                       -- [{id, title, reason, score}] projects suggested for an accepted proposal
  fetched_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.portal_proposals is 'PI-b: mirror of Portal.io proposals (read-only copy; the CRM never writes to Portal.io)';
create index portal_proposals_status_idx on public.portal_proposals (status, link_status);
create index portal_proposals_project_idx on public.portal_proposals (project_id);
create index portal_proposals_number_idx on public.portal_proposals (number);
create trigger portal_proposals_touch before update on public.portal_proposals
  for each row execute function app.touch_updated_at();

-- PI-h: the Finance tab. Everyone who has Transactions today (Fred 2026-10-13 list) gets it; administrators always.
insert into public.permissions (key, module, resource, action, kind, area, label, description) values
  ('administrative.finance.view_page', 'administrative', 'finance', 'view_page', 'page', 'Finance', 'Finance', 'Administrative › Finance: projects by payment status, totals by client, Portal.io proposals to review')
on conflict (key) do nothing;
insert into public.user_permissions (user_id, permission_key)
select p.id, 'administrative.finance.view_page' from public.profiles p
where lower(p.email) in ('fred@tsav.net', 'karina@tsav.net', 'luana@tsav.net', 'saulo@tsav.net', 'uli@tsav.net')
on conflict do nothing;

alter table public.portal_proposals enable row level security;
-- Read with Transactions or Finance; every change goes through the server actions (service role) after their own check.
create policy "portal proposals read" on public.portal_proposals for select to authenticated
  using ((select app.has_permission('administrative.transactions.view_page')) or (select app.has_permission('administrative.finance.view_page')));

-- PI-g: the commission set for a project (seen only with Transactions: View page, enforced by the registry `requires`).
alter table public.projects
  add column commission_contact_id bigint references public.contacts (id) on delete set null,
  add column commission_organization_id bigint references public.organizations (id) on delete set null,
  add column commission_percent numeric(5,2),
  add column commission_amount numeric(12,2);
-- (Commission Notes already exists from WebAuthor: projects.commission_notes, shown with a referral.)

-- PI-c: a Timeline line when a proposal is linked.
alter table public.project_events drop constraint project_events_channel_check;
alter table public.project_events add constraint project_events_channel_check
  check (channel in ('email', 'whatsapp', 'call', 'note', 'request', 'portal', 'other'));

-- PI-f: payment status everyone who may open the project can see; no amounts leave this function.
-- Overdue: an open Portal.io payment request past its due date, or Financial Status = Delinquent.
-- Paid: every request paid (none open, at least one paid), or Invoiced <= Paid with at least one invoice.
-- Current: there are requests, invoices or approved proposals. No data: nothing.
create or replace function public.project_payment_status(p_project_ids bigint[])
returns table (project_id bigint, status text, next_due date, open_requests integer)
language sql stable security definer set search_path = ''
as $$
  with fin as (
    select p.id, p.financial_status,
      coalesce(sum(t.amount) filter (where t.type = 'Proposal'), 0) as approved,
      coalesce(sum(t.amount) filter (where t.type = 'Invoice'), 0) as invoiced,
      coalesce(sum(t.amount) filter (where t.type = 'Payment'), 0) as paid
    from public.projects p
    left join public.transactions t on t.project_id = p.id and t.deleted_at is null and t.payment_type = 'Apply to Project'
    where p.id = any (p_project_ids)
      and (app.can_view_all('projects') or (p.created_by = auth.uid() and app.can_view_page('projects')))
    group by p.id
  ),
  req as (
    select pp.project_id,
      r->>'status' as status,
      nullif(r->>'dueDate', '')::timestamptz as due
    from public.portal_proposals pp
    cross join lateral jsonb_array_elements(coalesce(pp.payment_requests, '[]'::jsonb)) r
    where pp.project_id = any (p_project_ids) and pp.link_status = 'linked'
  ),
  agg as (
    select project_id,
      count(*) filter (where status not in ('Paid', 'Cancelled', 'Draft', 'Refunded')) as open_count,
      count(*) filter (where status = 'Paid') as paid_count,
      count(*) filter (where status not in ('Paid', 'Cancelled', 'Draft', 'Refunded') and due is not null
                         and (due at time zone 'America/New_York')::date < (now() at time zone 'America/New_York')::date) as overdue_count,
      min(due) filter (where status not in ('Paid', 'Cancelled', 'Draft', 'Refunded')) as next_due
    from req group by project_id
  )
  select f.id,
    case
      when f.financial_status = 'Delinquent' or coalesce(a.overdue_count, 0) > 0 then 'Overdue'
      when (coalesce(a.paid_count, 0) > 0 and coalesce(a.open_count, 0) = 0) or (f.invoiced > 0 and f.paid >= f.invoiced) then 'Paid'
      when coalesce(a.open_count, 0) > 0 or f.invoiced > 0 or f.approved > 0 then 'Current'
      else 'No data'
    end,
    (a.next_due at time zone 'America/New_York')::date,
    coalesce(a.open_count, 0)::integer
  from fin f left join agg a on a.project_id = f.id;
$$;
revoke execute on function public.project_payment_status(bigint[]) from public, anon;
grant execute on function public.project_payment_status(bigint[]) to authenticated;
