-- PU-b (Fred 2026-11-03, "Shair Residence: why can't I see the material list?"): a mirror proposal whose number a
-- project's Transaction already carries links itself. When that proposal is archived in Portal.io (Completed, settled
-- before the integration), only its lines are attached to the transaction: link_status 'materials' keeps it out of the
-- review cards, the money sync and project_financials (which read 'linked' alone).
alter table public.portal_proposals drop constraint portal_proposals_link_status_check;
alter table public.portal_proposals add constraint portal_proposals_link_status_check check (link_status in ('new', 'linked', 'ignored', 'materials'));
comment on column public.portal_proposals.link_status is 'new / linked / ignored / materials (PU-b: lines attached to the transaction carrying its number, money never synced)';
