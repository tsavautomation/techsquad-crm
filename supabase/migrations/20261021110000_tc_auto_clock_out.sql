-- TC-d Forgotten clock-out (SPEC §9.1, Jessica via Fred 2026-10-21): the clock-out the system writes after
-- midnight is marked, so the timesheet shows "Auto clock-out · Needs review" until the office reviews it
-- (TC-b's reviewed_at on the shift's clock-in). The 21 automatic clock-outs F20-b wrote so far (note
-- "Automatic clock-out: the day was never closed (F20)") get the mark too.
alter table public.time_entries add column auto_closed boolean not null default false;
comment on column public.time_entries.auto_closed is 'TC-d: this clock-out was written by the system after midnight (forgotten clock-out), not by the person';
update public.time_entries set auto_closed = true where kind = 'clock_out' and note like 'Automatic clock-out%';
