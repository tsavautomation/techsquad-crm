-- F9-d Visits (Fred 2026-10-04, looking at Stern Residence - 6070 NBR after the archive import: "it shows
-- 3 times visited… not computing all"): the visits imported from Google Calendar (F15) carry no check-in,
-- so their days never counted. A day with a Done visit that has already happened now counts as a day on
-- the job, alongside the Job Report dates and the check-ins. Still computed on read, never stored.
create or replace function public.project_visit_days(p_project_ids bigint[])
returns table (project_id bigint, visit_days integer)
language sql stable security definer set search_path = ''
as $$
  select p.id,
    (select count(*)::integer from (
       select jr.date as d
         from public.job_reports jr
        where jr.project_id = p.id and jr.deleted_at is null and jr.date is not null
       union
       select (v.checked_in_at at time zone 'America/New_York')::date
         from public.visits v
        where v.project_id = p.id and v.deleted_at is null and v.checked_in_at is not null
          and coalesce(v.status, '') <> 'Cancelled'
       union
       select (v.starts_at at time zone 'America/New_York')::date
         from public.visits v
        where v.project_id = p.id and v.deleted_at is null and v.starts_at is not null
          and v.status = 'Done' and v.starts_at < now()
     ) days)
  from public.projects p
  where p.id = any (p_project_ids)
    and (app.can_view_all('projects') or (p.created_by = auth.uid() and app.can_view_page('projects')));
$$;
