-- F26-2 tolerant matching (Fred 2026-10-22, "tem que haver uma folga"): an email that no exact rule files is
-- scored by the words it shares with each project (name, street, client); a clear winner is filed, otherwise
-- Claude picks among the best candidates with a confidence it must be sure of. What still waits in the Assign
-- list carries its candidates as clickable suggestions.
alter table public.mail_messages
  add column suggestions jsonb not null default '[]',
  add column match_tried_at timestamptz;
comment on column public.mail_messages.suggestions is '[{ id, title, score }]: the most similar projects, shown on Today › Emails to assign';
comment on column public.mail_messages.match_tried_at is 'When the AI last tried to pick the project (once per email)';
