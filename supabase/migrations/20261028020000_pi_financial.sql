-- PI (2026-10-28, after the first sandbox sync): the detail keeps the money under financialSummary; keep its parts too.
alter table public.portal_proposals add column financial jsonb;  -- {parts, labor, fee, subtotal, tax}
