-- F8 Map + Bouncie (SPEC §9.1 F8-a/b): tie each Fleet vehicle to its usual driver and its Bouncie device,
-- so the Schedule › Map can show "who is in which van" next to the day's job stops.
--   vehicles.driver_id     the Employee who usually drives it (shown on the vehicle's map marker)
--   vehicles.bouncie_imei  the Bouncie device id when the VIN doesn't match what Bouncie reports
-- The Bouncie connection itself (tokens, encrypted) lives in app_integrations under key 'bouncie'.

alter table public.vehicles add column driver_id bigint references public.employees (id) on delete set null;
create index on public.vehicles (driver_id);
comment on column public.vehicles.driver_id is 'Usual driver (F8, not in WebAuthor)';

alter table public.vehicles add column bouncie_imei text;
comment on column public.vehicles.bouncie_imei is 'Bouncie device IMEI, when the VIN does not match (F8)';
