import "server-only";
import { ImapFlow } from "imapflow";
import { simpleParser, type ParsedMail as MailparserMail } from "mailparser";
import { decrypt, encrypt } from "@/lib/crypto";
import { adminDb } from "@/lib/supabase/admin";

// F26-2 Gmail intake (SPEC §9.1 F26-a): the CRM's own free Gmail mailbox (tsavcrm@gmail.com, Fred
// 2026-10-21), read over IMAP with a Gmail **app password** (2-Step Verification on the account, then
// myaccount.google.com/apppasswords). No Google Cloud app, no verification review, no expiring tokens:
// the Gmail API's read scope is "restricted" and a published app needs Google's security assessment,
// while Testing mode expires its tokens every 7 days. The password is kept encrypted in
// app_integrations under 'gmail'. The CRM never deletes anything; a processed email is moved out of the
// inbox into a label (Fred 2026-10-21: "an email on the root of the gmail means it was not processed").

export const KEY = "gmail";
export const MAILBOX = "tsavcrm@gmail.com";
const HOST = "imap.gmail.com";
export const INBOX = "INBOX";
export const ALL_MAIL = "[Gmail]/All Mail";
export const IGNORED_LABEL = "Ignored";
export const TRASH = "[Gmail]/Trash";
/** gmail_label when the email could not be moved (it is no longer in the inbox, or the move failed). */
export const NOT_IN_INBOX = "-";

export type GmailSettings = {
  account: string;
  app_password: string;
  connected_at: string;
  connected_by: string;
  /** Gmail's UIDVALIDITY of INBOX and the last UID read; a new UIDVALIDITY means the numbering started over. */
  uid_validity: number | null;
  last_uid: number | null;
  last_sync_at: string | null;
  last_sync_error: string | null;
  read_total: number;
};

// ---------------------------------------------------------------- settings

export async function loadSettings(): Promise<GmailSettings | null> {
  const { data } = await adminDb().from("app_integrations").select("data").eq("key", KEY).maybeSingle();
  const d = (data as { data: Partial<GmailSettings> } | null)?.data;
  if (!d?.app_password || !d.account) return null;
  const s = d as GmailSettings;
  return { ...s, uid_validity: s.uid_validity ?? null, last_uid: s.last_uid ?? null, last_sync_at: s.last_sync_at ?? null, last_sync_error: s.last_sync_error ?? null, read_total: s.read_total ?? 0, app_password: decrypt(s.app_password) };
}

export async function saveSettings(s: GmailSettings, userId: string | null = null) {
  const { error } = await adminDb()
    .from("app_integrations")
    .upsert({ key: KEY, data: { ...s, app_password: encrypt(s.app_password) }, updated_at: new Date().toISOString(), updated_by: userId });
  if (error) throw new Error(`Could not save the Gmail connection: ${error.message}`);
}

/** Admin › Gmail intake › Connect: try the app password once, then keep it (encrypted). */
export async function connectWithPassword(account: string, password: string, userId: string) {
  const clean = password.replace(/\s+/g, "");
  const client = open(account, clean);
  try {
    await client.connect();
  } finally {
    await client.logout().catch(() => undefined);
  }
  await saveSettings({ account: account.trim().toLowerCase(), app_password: clean, connected_at: new Date().toISOString(), connected_by: userId, uid_validity: null, last_uid: null, last_sync_at: null, last_sync_error: null, read_total: 0 }, userId);
}

export async function disconnect() {
  await adminDb().from("app_integrations").delete().eq("key", KEY);
}

// ---------------------------------------------------------------- IMAP sessions

function open(account: string, password: string) {
  return new ImapFlow({ host: HOST, port: 993, secure: true, auth: { user: account, pass: password }, logger: false, emitLogs: false });
}

export type Session = { client: ImapFlow; path: string; uidValidity: number; uidNext: number };

/** Runs `fn` with a mailbox open (INBOX unless told otherwise), then logs out whatever happened. */
export async function withMailbox<T>(s: GmailSettings, fn: (box: Session) => Promise<T>, o: { path?: string; readOnly?: boolean } = {}): Promise<T> {
  const client = open(s.account, s.app_password);
  await client.connect();
  try {
    const box = await openPath(client, o.path ?? INBOX, o.readOnly ?? false);
    return await fn(box);
  } finally {
    await client.logout().catch(() => undefined);
  }
}

export async function openPath(client: ImapFlow, path: string, readOnly: boolean): Promise<Session> {
  const m = await client.mailboxOpen(path, { readOnly });
  return { client, path, uidValidity: Number(m.uidValidity ?? 0), uidNext: Number(m.uidNext ?? 0) };
}

/** UIDs after `lastUid` (or everything since `since` on the first run), oldest first. */
export async function newUids(box: Session, lastUid: number | null, since: Date): Promise<number[]> {
  const r = lastUid ? await box.client.search({ uid: `${lastUid + 1}:*` }, { uid: true }) : await box.client.search({ since }, { uid: true });
  const uids = Array.isArray(r) ? r : [];
  // Gmail answers "<n>:*" with the last message when nothing is newer.
  return uids.filter((u) => !lastUid || u > lastUid).sort((a, b) => a - b);
}

export type RawMail = { uid: number; emailId: string | null; threadId: string | null; source: Buffer };

/** One message's raw bytes plus Gmail's own message and thread ids. */
export async function fetchRaw(box: Session, uid: number): Promise<RawMail | null> {
  const m = await box.client.fetchOne(String(uid), { uid: true, source: true, emailId: true, threadId: true }, { uid: true });
  if (!m || !m.source) return null;
  return { uid, emailId: m.emailId ?? null, threadId: m.threadId ?? null, source: m.source };
}

/** The UID of a message in the open mailbox by Gmail's message id (X-GM-MSGID), whatever label it is under. */
export async function findUid(box: Session, gmailId: string): Promise<number | null> {
  if (!/^\d+$/.test(gmailId)) return null;
  const r = await box.client.search({ emailId: gmailId }, { uid: true });
  return Array.isArray(r) && r.length ? r[r.length - 1] : null;
}

/**
 * The raw message wherever it is now: by its UID in the open mailbox when it is still there, else through
 * [Gmail]/All Mail by Gmail's message id. The mailbox that was open is opened again afterwards.
 */
export async function fetchAnywhere(box: Session, gmailId: string, uid: number | null, uidValidity: number | null): Promise<RawMail | null> {
  if (uid !== null && (uidValidity === null || uidValidity === box.uidValidity)) {
    const hit = await fetchRaw(box, uid).catch(() => null);
    if (hit && (!hit.emailId || hit.emailId === gmailId)) return hit;
  }
  if (!/^\d+$/.test(gmailId)) return null;
  const all = await openPath(box.client, ALL_MAIL, true);
  try {
    const found = await findUid(all, gmailId);
    return found === null ? null : await fetchRaw(all, found);
  } finally {
    await openPath(box.client, box.path, false);
  }
}

export const parseRaw = (source: Buffer): Promise<MailparserMail> => simpleParser(source);

// ---------------------------------------------------------------- labels (Gmail folders)

/** Creates the label when it does not exist yet, parents first, so Gmail nests Projects › <project>. */
export async function ensureLabel(client: ImapFlow, path: string): Promise<void> {
  const parts = path.split("/");
  for (let i = 1; i <= parts.length; i++) {
    try {
      await client.mailboxCreate(parts.slice(0, i).join("/"));
    } catch (e) {
      // Already there: Gmail answers "[ALREADYEXISTS]".
      if (!/exist/i.test(e instanceof Error ? e.message : String(e))) throw e;
    }
  }
}

/** Deletes one message of the open mailbox the Gmail way: into Trash (Fred 2026-10-22: texts "we no longer need"). */
export async function trashMessage(box: Session, uid: number): Promise<boolean> {
  const r = await box.client.messageMove(String(uid), TRASH, { uid: true });
  return Boolean(r);
}

/** Moves one message of the open mailbox into a label (out of the inbox). */
export async function moveToLabel(box: Session, uid: number, label: string): Promise<boolean> {
  await ensureLabel(box.client, label);
  const r = await box.client.messageMove(String(uid), label, { uid: true });
  return Boolean(r);
}
