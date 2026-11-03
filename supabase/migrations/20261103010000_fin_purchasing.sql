-- FIN-o (Fred 2026-11-03): purchasing estimate from the proposals' bills of materials. MSRP comes with every
-- Portal.io line and is kept; Finance › Purchasing sums cost × quantity by manufacturer, supplier or type over the
-- approved / in-progress projects, so the office knows how much it has to buy from each brand.
alter table public.proposal_items add column msrp numeric(12,2);
create index proposal_items_brand_idx on public.proposal_items (brand);
