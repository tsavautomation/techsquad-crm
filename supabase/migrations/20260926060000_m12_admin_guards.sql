-- M12: admin screens. Holders of the WebAuthor "Groups" page (site.admin.groups) manage groups and
-- memberships, but only System Administrators may touch the built-in groups (System Administrators,
-- Everyone) or put someone into System Administrators — otherwise a group admin could make
-- themselves a full administrator.

drop policy "group admins manage groups" on public.groups;
create policy "group admins manage groups" on public.groups
  for all to authenticated
  using (app.is_sysadmin() or (app.has_permission('site.admin.groups') and not is_system))
  with check (app.is_sysadmin() or (app.has_permission('site.admin.groups') and not is_system));

drop policy "group admins manage memberships" on public.group_members;
create policy "group admins manage memberships" on public.group_members
  for all to authenticated
  using (
    app.is_sysadmin()
    or (app.has_permission('site.admin.groups') and not exists (select 1 from public.groups g where g.id = group_id and g.is_system))
  )
  with check (
    app.is_sysadmin()
    or (app.has_permission('site.admin.groups') and not exists (select 1 from public.groups g where g.id = group_id and g.is_system))
  );

-- Last-login time for the Users screen (auth.users is not exposed to the API).
create function public.user_last_sign_in()
returns table (id uuid, last_sign_in_at timestamptz)
language sql stable security definer set search_path = ''
as $$
  select u.id, u.last_sign_in_at
  from auth.users u
  where app.has_permission('site.admin.members');
$$;
revoke execute on function public.user_last_sign_in() from public, anon;
grant execute on function public.user_last_sign_in() to authenticated;
