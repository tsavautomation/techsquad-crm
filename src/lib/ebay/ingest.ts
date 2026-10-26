import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { aiConfigured, claude, describeError } from "@/lib/ai/claude";
import { ALL_MAIL, fetchRaw, findUid, loadSettings, NOT_IN_INBOX, openPath, parseRaw, trashMessage, TRASH, withMailbox, type Session } from "@/lib/mail/client";
import { actorLabel, parseMessage, type ParsedMail } from "@/lib/mail/engine";
import { ebayKind, EMPTY, EXTRACT_SYSTEM, extractPrompt, fieldsFor, heuristics, linksIn, merge, parseExtraction, titleKey, type EbayKind, type Extracted } from "./engine";

// F32: one eBay email → the ebay_sales row it belongs to (the sale email starts it, the label email completes
// it; either may come first), a mail_messages row for the record (status ignored, matched_by 'ebay'), and the
// Gmail copy into the Trash. Claude reads the email; when the key is missing or it fails, the regex reading
// stands and the row says so (extraction = fallback), with the raw text kept for a later re-read.

export const EXTRACT_MODEL = "claude-haiku-5-5";

export const isEbayMail = (parsed: Pick<ParsedMail, "from" | "subject" | "innerSenders" | "text">) => ebayKind(parsed.from.email, parsed.subject, { innerSenders: parsed.innerSenders, text: parsed.text }) !== null;

async function extract(kind: EbayKind, parsed: ParsedMail): Promise<{ data: Extracted; mode: "ai" | "fallback"; error: string | null }> {
  const links = linksIn(parsed.html);
  const fallback = heuristics(kind, parsed.text, links);
  if (!aiConfigured()) return { data: fallback, mode: "fallback", error: "ANTHROPIC_API_KEY is not set" };
  try {
    const res = await claude().messages.create({ model: EXTRACT_MODEL, max_tokens: 900, system: EXTRACT_SYSTEM, messages: [{ role: "user", content: extractPrompt({ subject: parsed.subject, from: actorLabel(parsed.from), receivedAt: parsed.receivedAt, text: parsed.text, links }) }] });
    const ai = parseExtraction(res.content.find((b) => b.type === "text")?.text ?? "");
    if (!ai) return { data: fallback, mode: "fallback", error: "The AI answer could not be read" };
    return { data: merge(ai, fallback), mode: "ai", error: null };
  } catch (e) {
    return { data: fallback, mode: "fallback", error: describeError(e) };
  }
}

type SaleRow = Extracted & { id: number; status: string; sale_mail_id: number | null; label_mail_id: number | null };
const SALE_COLS = "id, status, sale_mail_id, label_mail_id, order_number, item_id, item_title, quantity, price, shipping, total, buyer_name, buyer_username, ship_to, sold_at, label_url, tracking";

/** The sale this email belongs to: by order number, else a recent sale of the same item still waiting for its other email. */
async function findSale(db: SupabaseClient, kind: EbayKind, x: Extracted): Promise<SaleRow | null> {
  if (x.order_number) {
    const { data } = await db.from("ebay_sales").select(SALE_COLS).eq("order_number", x.order_number).maybeSingle();
    if (data) return data as SaleRow;
  }
  const key = titleKey(x.item_title);
  if (!key) return null;
  const since = new Date(Date.now() - 14 * 86_400_000).toISOString();
  const { data } = await db.from("ebay_sales").select(SALE_COLS).gte("created_at", since).is(kind === "sale" ? "sale_mail_id" : "label_mail_id", null).order("created_at", { ascending: false }).limit(50);
  return ((data ?? []) as SaleRow[]).find((s) => titleKey(s.item_title) === key) ?? null;
}

/** Reads the email into its sale row. `mailId` is the mail_messages row already stored for it. */
async function fileSale(db: SupabaseClient, kind: EbayKind, parsed: ParsedMail, mailId: number): Promise<void> {
  const { data: x, mode, error: xerr } = await extract(kind, parsed);
  const existing = await findSale(db, kind, x);
  const fields = fieldsFor(kind, x, existing);
  const own =
    kind === "sale"
      ? { sale_mail_id: mailId, sold_at: fields.sold_at ?? existing?.sold_at ?? parsed.receivedAt, raw_sale_text: parsed.text.slice(0, 20_000) }
      : { label_mail_id: mailId, label_ready_at: parsed.receivedAt, raw_label_text: parsed.text.slice(0, 20_000) };
  if (existing) {
    const both = kind === "label" ? Boolean(existing.sale_mail_id) : Boolean(existing.label_mail_id);
    const status = existing.status === "shipped" ? "shipped" : both || kind === "label" ? "label_ready" : "sold";
    await db.from("ebay_sales").update({ ...fields, ...own, status, ...(mode === "fallback" ? { extraction: "fallback", extraction_error: xerr } : {}) }).eq("id", existing.id);
  } else {
    await db.from("ebay_sales").insert({ ...EMPTY, ...fields, ...own, status: kind === "label" ? "label_ready" : "sold", extraction: mode, extraction_error: xerr });
  }
}

export async function ingestEbay(db: SupabaseClient, box: Session, parsed: ParsedMail, uid: number): Promise<boolean> {
  const kind = ebayKind(parsed.from.email, parsed.subject, { innerSenders: parsed.innerSenders, text: parsed.text });
  if (!kind) return false;
  const { data: mailRow, error } = await db
    .from("mail_messages")
    .insert({ gmail_id: parsed.gmailId, thread_id: parsed.threadId, uid, uid_validity: box.uidValidity, received_at: parsed.receivedAt, from_name: parsed.from.name || null, from_email: parsed.from.email || null, to_text: parsed.to || null, subject: parsed.cleanSubject, snippet: parsed.snippet || null, body_text: parsed.text || null, inner_senders: parsed.innerSenders, attachments: [], status: "ignored", matched_by: "ebay" })
    .select("id")
    .single();
  if (error) return false;
  const mailId = (mailRow as { id: number }).id;
  await fileSale(db, kind, parsed, mailId);
  const trashed = await trashMessage(box, uid).catch(() => false);
  await db.from("mail_messages").update({ gmail_label: trashed ? TRASH : NOT_IN_INBOX }).eq("id", mailId);
  return true;
}

/**
 * An eBay email the mailbox check filed somewhere else (before F32, or forwarded in a way it did not recognise):
 * fetched again from Gmail, read into its sale, taken off the project (its timeline event is deleted), trashed.
 */
export async function reprocessEbay(db: SupabaseClient, mailId: number): Promise<{ ok: true; kind: EbayKind; trashed: boolean } | { ok: false; message: string }> {
  const { data } = await db.from("mail_messages").select("id, gmail_id, uid, uid_validity, project_id, event_id").eq("id", mailId).maybeSingle();
  const row = data as { id: number; gmail_id: string; uid: number | null; uid_validity: number | null; project_id: number | null; event_id: number | null } | null;
  if (!row) return { ok: false, message: "mail not found" };
  const settings = await loadSettings();
  if (!settings) return { ok: false, message: "Gmail is not connected" };
  if (!/^\d+$/.test(row.gmail_id)) return { ok: false, message: "no Gmail id" };
  return withMailbox(settings, async (box) => {
    const all = await openPath(box.client, ALL_MAIL, false);
    const uid = await findUid(all, row.gmail_id);
    const raw = uid === null ? null : await fetchRaw(all, uid);
    if (!raw || uid === null) return { ok: false as const, message: "not found in Gmail" };
    const mail = await parseRaw(raw.source);
    const parsed = parseMessage({ from: mail.from?.text, to: Array.isArray(mail.to) ? mail.to.map((t) => t.text).join(", ") : mail.to?.text, subject: mail.subject, date: mail.date, messageId: mail.messageId, text: mail.text, html: mail.html, attachments: mail.attachments }, { uid, uidValidity: all.uidValidity, emailId: raw.emailId, threadId: raw.threadId });
    const kind = ebayKind(parsed.from.email, parsed.subject, { innerSenders: parsed.innerSenders, text: parsed.text });
    if (!kind) return { ok: false as const, message: "not an eBay email" };
    if (row.event_id) await db.from("project_events").update({ deleted_at: new Date().toISOString() }).eq("id", row.event_id);
    await db.from("mail_messages").update({ status: "ignored", matched_by: "ebay", project_id: null, event_id: null, filed_at: null, suggestions: [] }).eq("id", mailId);
    await fileSale(db, kind, parsed, mailId);
    const trashed = await trashMessage(all, uid).catch(() => false);
    await db.from("mail_messages").update({ gmail_label: trashed ? TRASH : NOT_IN_INBOX }).eq("id", mailId);
    return { ok: true as const, kind, trashed };
  });
}
