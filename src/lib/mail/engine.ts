// F26-2 Gmail intake (SPEC §9.1 F26-a): pure helpers — reading a parsed email, matching it to a project,
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

/** Google's own notices to the mailbox (security alerts, welcome mails): never project emails, ignored on arrival. */
export const isSystemMail = (fromEmail: string | null | undefined) => /^(no-?reply|noreply)@(accounts.|mail.)?google.com$/i.test((fromEmail ?? "").trim());

// ---------------------------------------------------------------- matching

export type MatchBy = "id" | "thread" | "subject" | "sender";
/** `category` is the project's Category (Low Voltage / Electrical …), used when a client has one project of each. */
export type ProjectForMatch = { id: number; title: string | null; emails: string[]; category?: string | null };
export type MailForMatch = { subject: string | null; senders: string[]; threadId: string | null };

const MIN_TITLE = 5;

/**
 * Fred 2026-10-21: every forwarded email's subject says LV or EL, because most clients have a low-voltage
 * and an electrical project. "LV", "L.V.", "Low Voltage" → Low Voltage; "EL", "ELEC", "Electrical" → Electrical.
 */
export function subjectDiscipline(subject: string | null | undefined): "Low Voltage" | "Electrical" | null {
  const s = ` ${normalizeText(subject)} `;
  const lv = / (lv|l v|low voltage|baixa tensao) /.test(s);
  const el = / (el|elec|electrical|eletrica) /.test(s);
  if (lv && !el) return "Low Voltage";
  if (el && !lv) return "Electrical";
  return null;
}

/** Several candidate projects: the LV / EL word in the subject picks one when exactly one has that Category. */
function pickByDiscipline(candidates: ProjectForMatch[], subject: string | null | undefined): ProjectForMatch | null {
  if (candidates.length === 1) return candidates[0];
  const want = subjectDiscipline(subject);
  if (!want) return null;
  const hits = candidates.filter((p) => p.category === want);
  return hits.length === 1 ? hits[0] : null;
}

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

  // The longest project name found in the subject; several of the same length → LV / EL decides.
  const subject = ` ${normalizeText(cleanSubject(m.subject))} `;
  let best: { len: number; list: ProjectForMatch[] } | null = null;
  for (const p of projects) {
    const title = normalizeText(p.title);
    if (title.length < MIN_TITLE || !subject.includes(` ${title} `)) continue;
    if (!best || title.length > best.len) best = { len: title.length, list: [p] };
    else if (title.length === best.len) best.list.push(p);
  }
  const byName = best ? pickByDiscipline(best.list, m.subject) : null;
  if (byName) return { projectId: byName.id, by: "subject" };

  // The sender (or the forwarded "From:") is a project's owner contact; several projects → LV / EL decides.
  const senders = m.senders.map((s) => s.toLowerCase()).filter(Boolean);
  if (senders.length) {
    const hits = projects.filter((p) => p.emails.some((e) => senders.includes(e.toLowerCase())));
    const bySender = hits.length ? pickByDiscipline(hits, m.subject) : null;
    if (bySender) return { projectId: bySender.id, by: "sender" };
  }
  return null;
}

// ---------------------------------------------------------------- parsed emails

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

/** What the engine needs from a parsed email (the shape mailparser gives, kept small so tests stay plain). */
export type MailInput = {
  from?: string | null;
  to?: string | null;
  subject?: string | null;
  date?: Date | string | null;
  messageId?: string | null;
  text?: string | null;
  html?: string | false | null;
  attachments?: { filename?: string | null; contentType?: string | null; size?: number | null; contentId?: string | null; contentDisposition?: string | null }[];
};

export type MailAttachment = { name: string; mime: string; size: number; index: number };

export type ParsedMail = {
  /** Gmail's message id (X-GM-MSGID) when the server gave one, else the Message-ID header, else the UID. */
  gmailId: string;
  threadId: string | null;
  uid: number;
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

/** The real attachments: parts with a file name that are not inline images of the HTML. `index` is their position in the parsed list. */
export function attachmentsOf(list: MailInput["attachments"]): MailAttachment[] {
  const out: MailAttachment[] = [];
  (list ?? []).forEach((a, index) => {
    if (!a.filename) return;
    if (a.contentId && a.contentDisposition === "inline") return;
    out.push({ name: a.filename, mime: a.contentType ?? "application/octet-stream", size: a.size ?? 0, index });
  });
  return out;
}

export function parseMessage(mail: MailInput, meta: { uid: number; uidValidity: number; emailId: string | null; threadId: string | null }): ParsedMail {
  const subject = (mail.subject ?? "").trim();
  const text = ((mail.text ?? "").trim() || (typeof mail.html === "string" ? htmlToText(mail.html) : "")).replace(/\r\n/g, "\n").trim().slice(0, TEXT_CAP);
  const received = mail.date ? new Date(mail.date) : new Date();
  return {
    gmailId: meta.emailId || (mail.messageId ?? "").trim() || `uid:${meta.uidValidity}:${meta.uid}`,
    threadId: meta.threadId,
    uid: meta.uid,
    receivedAt: (Number.isNaN(received.getTime()) ? new Date() : received).toISOString(),
    from: parseAddress(mail.from),
    to: mail.to ?? "",
    subject,
    cleanSubject: cleanSubject(subject) || "(no subject)",
    snippet: text.replace(/\s+/g, " ").slice(0, 200),
    text,
    innerSenders: innerSenders(text),
    attachments: attachmentsOf(mail.attachments),
  };
}

/** The OneDrive folder of one email's files: "<date> <subject>" (Eastern date), safe for OneDrive. */
export function emailFolderName(receivedAt: string, subject: string): string {
  return safeName(`${toDateTimeLocalET(receivedAt).slice(0, 10)} ${cleanSubject(subject) || "(no subject)"}`.slice(0, 100));
}

/** The Gmail label a filed email moves to: Projects/<project> (<id>), the OneDrive folder's name (Fred 2026-10-21). */
export const projectLabel = (title: string | null, projectId: number) => `Projects/${safeName(`${title ?? "Project"} (${projectId})`)}`;

/** Who to show as the event's author: "Name <email>" or just the address. */
export const actorLabel = (a: Address) => (a.name && a.name.toLowerCase() !== a.email ? `${a.name} <${a.email}>` : a.email);
