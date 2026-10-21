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
// app_integrations under 'gmail'. The mailbox is opened read-only: nothing is ever moved or deleted.

export const KEY = "gmail";
export const MAILBOX = "tsavcrm@gmail.com";
const HOST = "imap.gmail.com";

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

// ---------------------------------------------------------------- IMAP

function open(account: string, password: string) {
  return new ImapFlow({ host: HOST, port: 993, secure: true, auth: { user: account, pass: password }, logger: false, emitLogs: false });
}

export type Inbox = { client: ImapFlow; uidValidity: number; uidNext: number };

/** Runs `fn` with INBOX open read-only, then logs out whatever happened. */
export async function withInbox<T>(s: GmailSettings, fn: (inbox: Inbox) => Promise<T>): Promise<T> {
  const client = open(s.account, s.app_password);
  await client.connect();
  try {
    const box = await client.mailboxOpen("INBOX", { readOnly: true });
    return await fn({ client, uidValidity: Number(box.uidValidity ?? 0), uidNext: Number(box.uidNext ?? 0) });
  } finally {
    await client.logout().catch(() => undefined);
  }
}

/** UIDs after `lastUid` (or everything since `since` on the first run), oldest first. */
export async function newUids(inbox: Inbox, lastUid: number | null, since: Date): Promise<number[]> {
  const r = lastUid ? await inbox.client.search({ uid: `${lastUid + 1}:*` }, { uid: true }) : await inbox.client.search({ since }, { uid: true });
  const uids = Array.isArray(r) ? r : [];
  // Gmail answers "<n>:*" with the last message when nothing is newer.
  return uids.filter((u) => !lastUid || u > lastUid).sort((a, b) => a - b);
}

export type RawMail = { uid: number; emailId: string | null; threadId: string | null; source: Buffer };

/** One message's raw bytes plus Gmail's own message and thread ids. */
export async function fetchRaw(inbox: Inbox, uid: number): Promise<RawMail | null> {
  const m = await inbox.client.fetchOne(String(uid), { uid: true, source: true, emailId: true, threadId: true }, { uid: true });
  if (!m || !m.source) return null;
  return { uid, emailId: m.emailId ?? null, threadId: m.threadId ?? null, source: m.source };
}

export const parseRaw = (source: Buffer): Promise<MailparserMail> => simpleParser(source);
