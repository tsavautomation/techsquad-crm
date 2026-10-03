-- F10 Vehicle on visits (SPEC §9.1 F10-a): there is no designated driver per van, so each Visit says
-- which vehicle goes (technician + project + vehicle are all required). The Schedule map labels a van
-- with the technician of today's visit that uses it, and falls back to Fleet › Usual driver.
alter table public.visits add column vehicle_id bigint references public.vehicles (id) on delete set null;
create index on public.visits (vehicle_id);
comment on column public.visits.vehicle_id is 'Visit › Vehicle (F10-a)';
