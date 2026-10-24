-- F28-e WhatsApp PC watch (Fred 2026-10-23, "we only received WhatsApp messages till mid afternoon … check what
-- happened"): the capture agent now sends a heartbeat every minute; the CRM shows when the PC was last heard
-- from and pushes a warning (event whatsapp_silent) when the PC is down or has forwarded nothing for two hours
-- in business hours.

create table public.wa_agents (
  device text primary key,
  version text,
  started_at timestamptz,
  last_seen_at timestamptz not null default now(),
  last_message_at timestamptz,
  pending integer not null default 0,
  updated_at timestamptz not null default now()
);
comment on table public.wa_agents is 'F28-e: each WhatsApp capture PC: last heartbeat, last forwarded message, queued messages';
alter table public.wa_agents enable row level security;
create policy "whatsapp read agents" on public.wa_agents for select to authenticated
  using ((select app.has_permission('whatsapp.page.view')));
create trigger wa_agents_touch before update on public.wa_agents
  for each row execute function app.touch_updated_at();

-- Seed from what has already been received, so the status line is not blank before the new agent runs.
insert into public.wa_agents (device, last_seen_at, last_message_at)
select device, max(created_at), max(captured_at) from public.wa_messages where device <> 'ringcentral-email' group by device
on conflict (device) do nothing;

-- The warning goes to the office logins that get the other pushes (Fred 2026-10-21: Fred, Jessica, Saulo).
update public.profiles set push_events = array_append(push_events, 'whatsapp_silent')
where email in ('fred@tsav.net', 'jessica@tsav.net', 'saulo@tsav.net') and not ('whatsapp_silent' = any(push_events));
