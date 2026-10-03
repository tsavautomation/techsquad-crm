-- F9 Job hours (SPEC §9.1 F9-d): how many times we visited a project, regardless of hours.
-- One visit = one Eastern-time day with a Job Report for the project (two reports by two technicians
-- on the same day count once), plus any day a visit was checked in on without a report that day.
-- Computed on read, never stored; the imported WebAuthor job reports count too, so it is retroactive.
-- Same visibility rule as project_financials: the viewer must be able to see the project.
create function public.project_visit_days(p_project_ids bigint[])
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
     ) days)
  from public.projects p
  where p.id = any (p_project_ids)
    and (app.can_view_all('projects') or (p.created_by = auth.uid() and app.can_view_page('projects')));
$$;
revoke execute on function public.project_visit_days(bigint[]) from public, anon;
grant execute on function public.project_visit_days(bigint[]) to authenticated;
