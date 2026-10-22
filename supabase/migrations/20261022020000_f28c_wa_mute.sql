-- F28-c Mute a WhatsApp chat (Fred 2026-10-22, "some groups are just internal chit chat and are cluttering the
-- board … reverse it just like a mute group option"). A muted chat's messages are still stored (flagged) but make
-- no card and are never read by the AI; Unmute on WhatsApp › Muted chats brings the chat back.

create table public.wa_muted_chats (
  chat text primary key,
  muted_at timestamptz not null default now(),
  muted_by uuid references public.profiles (id) on delete set null
);
comment on table public.wa_muted_chats is 'F28-c: WhatsApp chats (groups or contacts) whose messages make no cards';
alter table public.wa_muted_chats enable row level security;
create policy "whatsapp read muted" on public.wa_muted_chats for select to authenticated
  using ((select app.has_permission('whatsapp.page.view')));
create policy "whatsapp mute" on public.wa_muted_chats for insert to authenticated
  with check ((select app.has_permission('whatsapp.page.view')));
create policy "whatsapp unmute" on public.wa_muted_chats for delete to authenticated
  using ((select app.has_permission('whatsapp.page.view')));

alter table public.wa_messages add column muted boolean not null default false;
comment on column public.wa_messages.muted is 'F28-c: arrived while the chat was muted; no card, not read';
