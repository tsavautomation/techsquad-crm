-- FIN Part 2 (Fred 2026-10-28, SPEC §9.1 FIN-h → FIN-i…FIN-l): the Portal.io sync writes Approved Proposals (main +
-- change orders, with items), Invoices (payment requests) and Payments (paid requests) under the linked project.
-- Idempotent by the Portal.io ids; a person's edits that the sync must respect are marked on the row.

-- A payment request becomes an Invoice and, once paid, a Payment too: the same request id on two rows of different type.
drop index if exists public.transactions_portal_request_key;
create unique index transactions_portal_request_key on public.transactions (portal_request_id, type) where portal_request_id is not null and deleted_at is null;

-- What the sync last wrote, so a person's change to Amount / Description / Status is never written over (FIN-k).
alter table public.transactions add column portal_synced jsonb;
comment on column public.transactions.portal_synced is 'FIN-k: the values the Portal.io sync wrote last ({amount, description, invoice_status, due_date}); a field that differs from it was edited by a person and is left alone';

-- Linked proposals re-read every hour while a payment request is open (FIN-j).
alter table public.portal_proposals add column tx_synced_at timestamptz;
alter table public.portal_proposals add column change_order_details jsonb not null default '{}'::jsonb;  -- {co id: GET …/changeorders/{id}} (items for Parts)
alter table public.portal_proposals add column auto_linked boolean not null default false;             -- FIN-l: linked by the customer rule, not by a person
create index portal_proposals_customer_idx on public.portal_proposals (((customer->>'id')::bigint));
