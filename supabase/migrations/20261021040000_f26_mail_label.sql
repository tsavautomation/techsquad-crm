-- F26-2 (Fred 2026-10-21): a processed email leaves the Gmail inbox. Filed ones go to the label
-- Projects/<project> (<id>) (the OneDrive folder's name), ignored ones to Ignored; whatever still sits in
-- the inbox was not processed. The label each email was moved to is kept here.
alter table public.mail_messages add column gmail_label text;
