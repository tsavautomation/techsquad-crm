-- F26-2 Gmail intake, second take: the mailbox is read over IMAP with a Gmail app password (the Gmail API's
-- read scope is "restricted": a published app needs Google's security assessment, and Testing mode expires
-- its tokens every 7 days). Each email keeps its IMAP place (UIDVALIDITY + UID) so its attachments can be
-- read again from the mailbox when the office assigns it to a project later.
alter table public.mail_messages
  add column uid bigint,
  add column uid_validity bigint;
create index on public.mail_messages (uid_validity, uid);
