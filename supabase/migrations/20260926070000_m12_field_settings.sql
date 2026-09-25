-- M12: Form settings. Changes an admin makes to a form without code, layered over the
-- registry in src/registry (which stays the source for everything else). One row per changed
-- field; null columns mean "as in the registry".
--   options: the full option list in display order: [{ "value", "label", "color"?, "retired"? }].
--            Stored values never change (renaming changes the label only), so records,
--            rules and automations keep working.

create table public.field_settings (
  table_name text not null,
  field_name text not null,
  label text,
  required boolean,
  help text,
  sort_order int,
  options jsonb,
  updated_at timestamptz not null default now(),
  updated_by uuid default auth.uid() references public.profiles (id) on delete set null,
  primary key (table_name, field_name)
);

alter table public.field_settings enable row level security;
create policy "signed-in users read" on public.field_settings for select to authenticated using (true);
-- WebAuthor "Design" page holders (and System Administrators).
create policy "designers manage" on public.field_settings for all to authenticated
  using (app.has_permission('projects.module.design_design'))
  with check (app.has_permission('projects.module.design_design'));

create trigger field_settings_touch before update on public.field_settings
  for each row execute function app.touch_updated_at();
