-- FIN-o Finance data fix (Luana via Fred 2026-11-02, Prompt 2; approved 2026-11-03). SPEC §9.1 FIN-o.
-- The columns scripts/finance-apply.ts writes:
--   superseded_by_id        a proposal replaced by a newer version (the row is also soft-deleted, so the
--                           Approved sum and the views ignore it; the link keeps the history)
--   proposal_transaction_id the proposal (or change order) a payment belongs to; payment numbers
--                           ("1st of #3115") are per proposal from now on
--   date_estimated          the date came from the portal's payment request or from the sheet column,
--                           not from a processed payment (shown with ≈ in the UI)
alter table public.transactions
  add column superseded_by_id bigint references public.transactions (id) on delete set null,
  add column proposal_transaction_id bigint references public.transactions (id) on delete set null,
  add column date_estimated boolean not null default false;

create index transactions_proposal_idx on public.transactions (proposal_transaction_id) where proposal_transaction_id is not null;
create index transactions_superseded_idx on public.transactions (superseded_by_id) where superseded_by_id is not null;

comment on column public.transactions.superseded_by_id is 'FIN-o: the proposal that replaced this one (row soft-deleted)';
comment on column public.transactions.proposal_transaction_id is 'FIN-o: the proposal or change order this payment pays';
comment on column public.transactions.date_estimated is 'FIN-o: date taken from a payment request / sheet column, not a processed payment';
