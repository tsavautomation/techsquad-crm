-- UI-m Brand colours (SPEC §9.1 UI-m, Fred 2026-10-14): each person picks a colour theme named after a brand we work
-- with. The list of palettes lives in the app (src/lib/palettes.ts + globals.css); unknown values fall back to Tech Squad.
alter table public.profiles add column palette text not null default 'techsquad';
