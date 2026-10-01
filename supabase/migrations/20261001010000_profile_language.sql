-- Each person picks the language of their own screens (Fred 2026-09-30): English or Portuguese.
alter table public.profiles add column language text not null default 'en' check (language in ('en', 'pt'));

-- People may edit their own profile (name, language), but only member admins may change
-- whether a login is active or its email. Before this, the "users update own name" policy let
-- anyone change every column of their own row, including reactivating themselves.
create function app.profile_guard()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if auth.uid() is not null
     and (new.active is distinct from old.active or new.email is distinct from old.email)
     and not app.has_permission('site.admin.members') then
    raise exception 'Only user admins can change that.' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger profile_guard before update on public.profiles for each row execute function app.profile_guard();
