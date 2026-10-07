-- F21 (SPEC §9.1, Fred 2026-10-07):
-- F21-e: a full day is 7 hours, not 8. Visits and reports that chose "8 h (full day)" now say 7 h.
update public.visits set duration = '420' where duration = '480';
update public.job_reports set time_needed = '420' where time_needed = '480';
-- F21-k: no more automatic "offer a maintenance plan" task when a project is marked Complete.
update public.automations set active = false where id = 900403;
-- F21-b: a visit may carry its own address (a survey at a new client, a different site); blank = the project's.
alter table public.visits add column if not exists address jsonb;
-- F21-j: the old Punch List items and Tasks leave the lists (archived, not deleted; the Archived switch still shows them).
update public.punch_list_items set archived_at = now()
  where archived_at is null and deleted_at is null
    and (status in ('Expired', 'Completed', 'Canceled') or updated_at < '2026-01-01');
update public.tasks set archived_at = now()
  where archived_at is null and deleted_at is null
    and (status = 'Completed' or updated_at < '2026-01-01');
