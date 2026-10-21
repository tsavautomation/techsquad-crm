// F26-2 Gmail intake (SPEC §9.1 F26-a): pure helpers — reading a Gmail message, matching it to a project,
// naming its OneDrive folder. No database or network here; tests/f26-gmail.test.ts covers them.
import { toDateTimeLocalET } from "@/lib/dates";
import { safeName } from "@/lib/files/paths";

// ---------------------------------------------------------------- addresses and subjects

export type Address = { name: string; email: string };

/** "Ana Lima <ana@x.com>", "\"Lima, Ana\" <ana@x.com>" or "ana@x.com" → name and lower-case address. */
export function parseAddress(s: string | null | undefined): Address {
  const raw = (s ?? "").trim();
  const m = raw.match(/^(.*?)\s*<([^<>\s]+@[^<>\s]+)>\s*$/);
  if (m) return { name: m[1].replace(/^"|"$/g, "").trim(), email: m[2].toLowerCase() };
  const bare = raw.match(/[^\s<>,;"]+@[^\s<>,;"]+/);
  return { name: bare ? raw.replace(bare[0], "").replace(/[<>"]/g, "").trim() : raw, email: bare ? bare[0].toLowerCase() : "" };
}

/** Every address in a To / Cc header. */
export function parseAddressList(s: string | null | undefined): Address[] {
  const out: Address[] = [];
  for (const part of (s ?? "").split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/)) {
    const a = parseAddress(part);
    if (a.email) out.push(a);
  }
  return out;
}

/** Strips the forwarding / reply prefixes in English and Portuguese: "Fwd: RE: Enc: x" → "x". */
export function cleanSubject(s: string | null | undefined): string {
  let out = (s ?? "").replace(/\s+/g, " ").trim();
  for (;;) {
    const next = out.replace(/^(?:(?:fwd?|fw|re|res|enc|aw|tr)\s*:\s*|\[(?:fwd|external|externo)\]\s*)/i, "");
    if (next === out) break;
    out = next;
  }
  return out.trim();
}

/** "#1249" anywhere in the subject → 1249. */
export function projectIdInSubject(subject: string | null | undefined): number | null {
  const m = (subject ?? "").match(/#\s?(\d{1,7})(?!\d)/);
  return m ? Number(m[1]) : null;
}

/** Lower case, no accents, only letters / digits separated by single spaces. */
export function normalizeText(s: string | null | undefined): string {
  return (s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** The original senders of a forwarded email: every "From: … <a@b>" (or "De:") line in the body. */
export function innerSenders(text: string | null | undefined): string[] {
  const out: string[] = [];
  for (const m of (text ?? "").matchAll(/^\s*(?:>\s*)*(?:\*{0,2})(?:from|de)(?:\*{0,2})\s*:\s*(.+)$/gim)) {
    const a = parseAddress(m[1]);
    if (a.email && !out.includes(a.email)) out.push(a.email);
  }
  return out;
}

// ---------------------------------------------------------------- matching

export type MatchBy = "id" | "thread" | "subject" | "sender";
export type ProjectForMatch = { id: number; title: string | null; emails: string[] };
export type MailForMatch = { subject: string | null; senders: string[]; threadId: string | null };

const MIN_TITLE = 5;

/**
 * Which project an email belongs to, in this order: "#id" in the subject (a project that exists), the
 * thread an earlier email was filed under, the project name in the subject (the longest name that
 * appears as whole words; two different projects of the same length = nobody wins), the sender's address
 * against the projects' contacts (exactly one project). Nothing certain → null: the Assign list decides.
 */
export function matchProject(m: MailForMatch, projects: ProjectForMatch[], threads: Map<string, number>): { projectId: number; by: MatchBy } | null {
  const id = projectIdInSubject(m.subject);
  if (id && projects.some((p) => p.id === id)) return { projectId: id, by: "id" };
  const byThread = m.threadId ? threads.get(m.threadId) : undefined;
  if (byThread) return { projectId: byThread, by: "thread" };

  const subject = ` ${normalizeText(cleanSubject(m.subject))} `;
  let best: { id: number; len: number; tie: boolean } | null = null;
  for (const p of projects) {
    const title = normalizeText(p.title);
    if (title.length < MIN_TITLE || !subject.includes(` ${title} `)) continue;
    if (!best || title.length > best.len) best = { id: p.id, len: title.length, tie: false };
    else if (title.length === best.len && p.id !== best.id) best.tie = true;
  }
  if (best && !best.tie) return { projectId: best.id, by: "subject" };

  const senders = m.senders.map((s) => s.toLowerCase()).filter(Boolean);
  if (senders.length) {
    const hits = new Set<number>();
    for (const p of projects) if (p.emails.some((e) => senders.includes(e.toLowerCase()))) hits.add(p.id);
    if (hits.size === 1) return { projectId: [...hits][0], by: "sender" };
  }
  return null;
}

// ---------------------------------------------------------------- Gmail payloads

export type GmailPart = { mimeType?: string; filename?: string; headers?: { name: string; value: string }[]; body?: { data?: string; attachmentId?: string; size?: number }; parts?: GmailPart[] };
export type GmailMessage = { id: string; threadId?: string; internalDate?: string; snippet?: string; labelIds?: string[]; payload?: GmailPart };

export const decodeBase64Url = (s: string | undefined) => (s ? Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8") : "");

export function header(payload: GmailPart | undefined, name: string): string {
  const h = payload?.headers?.find((x) => x.name.toLowerCase() === name.toLowerCase());
  return h?.value ?? "";
}

/** A readable text from an HTML part: blocks become line breaks, tags and entities go. */
export function htmlToText(html: string): string {
  return html
    .replace(/<\s*(style|script|head)[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, "")
    .replace(/<\s*br\s*\/?>/gi, "\n")
    .replace(/<\s*\/\s*(p|div|tr|li|h[1-6]|blockquote|table)\s*>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function walk(part: GmailPart | undefined, visit: (p: GmailPart) => void) {
  if (!part) return;
  visit(part);
  for (const p of part.parts ?? []) walk(p, visit);
}

/** The message text: the text/plain part when there is one, otherwise the HTML made readable. */
export function bodyText(payload: GmailPart | undefined): string {
  let plain = "";
  let html = "";
  walk(payload, (p) => {
    if (p.filename || !p.body?.data) return;
    const mime = (p.mimeType ?? "").toLowerCase();
    if (mime === "text/plain" && !plain) plain = decodeBase64Url(p.body.data);
    else if (mime === "text/html" && !html) html = decodeBase64Url(p.body.data);
  });
  return (plain.trim() || htmlToText(html)).replace(/\r\n/g, "\n").trim();
}

export type MailAttachment = { name: string; mime: string; size: number; attachment_id: string };

/** The real attachments (parts with a file name and an attachment id); inline images without a name are skipped. */
export function attachmentsOf(payload: GmailPart | undefined): MailAttachment[] {
  const out: MailAttachment[] = [];
  walk(payload, (p) => {
    if (p.filename && p.body?.attachmentId) out.push({ name: p.filename, mime: p.mimeType ?? "application/octet-stream", size: p.body.size ?? 0, attachment_id: p.body.attachmentId });
  });
  return out;
}

export type ParsedMail = {
  gmailId: string;
  threadId: string | null;
  receivedAt: string;
  from: Address;
  to: string;
  subject: string;
  cleanSubject: string;
  snippet: string;
  text: string;
  innerSenders: string[];
  attachments: MailAttachment[];
};

const TEXT_CAP = 20_000;

export function parseMessage(msg: GmailMessage): ParsedMail {
  const subject = header(msg.payload, "Subject");
  const text = bodyText(msg.payload).slice(0, TEXT_CAP);
  const received = msg.internalDate ? new Date(Number(msg.internalDate)) : new Date(header(msg.payload, "Date") || Date.now());
  return {
    gmailId: msg.id,
    threadId: msg.threadId ?? null,
    receivedAt: (Number.isNaN(received.getTime()) ? new Date() : received).toISOString(),
    from: parseAddress(header(msg.payload, "From")),
    to: header(msg.payload, "To"),
    subject,
    cleanSubject: cleanSubject(subject) || "(no subject)",
    snippet: msg.snippet ?? "",
    text,
    innerSenders: innerSenders(text),
    attachments: attachmentsOf(msg.payload),
  };
}

/** The OneDrive folder of one email's files: "<date> <subject>" (Eastern date), safe for OneDrive. */
export function emailFolderName(receivedAt: string, subject: string): string {
  return safeName(`${toDateTimeLocalET(receivedAt).slice(0, 10)} ${cleanSubject(subject) || "(no subject)"}`.slice(0, 100));
}

/** Who to show as the event's author: "Name <email>" or just the address. */
export const actorLabel = (a: Address) => (a.name && a.name.toLowerCase() !== a.email ? `${a.name} <${a.email}>` : a.email);
