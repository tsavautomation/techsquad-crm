-- SC-a Calendar view per person (Fred 2026-11-03, SPEC §9.1 SC-a): the Day / Week / Team / List button a person
-- clicks on Schedule › Calendar is remembered on their profile and is where the Calendar opens next time.
alter table public.profiles add column schedule_view text not null default 'day' check (schedule_view in ('day', 'week', 'team', 'list'));
comment on column public.profiles.schedule_view is 'SC-a: the Calendar view this person last chose';
