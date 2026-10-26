-- SV Survey visits (Fred 2026-10-26): a third visit type, Survey, with no project (the team was using the fake
-- project SURVEY #1271, which polluted Site history, Job costing and the billing tasks). A survey carries its own
-- address and the contact met there; later the office assigns the visit and its report to a project.
-- Additive only: nothing becomes required, nothing is migrated (SURVEY #1271 is moved by hand, SPEC SV-d).

alter table public.visits
  add column if not exists contact_name text,
  add column if not exists contact_phone text,
  add column if not exists contact_email text,
  add column if not exists contact_id bigint references public.contacts (id) on delete set null;
comment on column public.visits.contact_name is 'SV-a: who the technician meets at a survey (no project yet)';
