import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { aiConfigured, claude, describeError } from "@/lib/ai/claude";
import { NOT_IN_INBOX, trashMessage, TRASH, type Session } from "@/lib/mail/client";
import type { ParsedMail } from "@/lib/mail/engine";
import { actorLabel } from "@/lib/mail/engine";
import { ebayKind, EMPTY, EXTRACT_SYSTEM, extractPrompt, heuristics, linksIn, merge, parseExtraction, titleKey, type EbayKind, type Extracted } from "./engine";

// F32: one eBay email → the ebay_sales row it belongs to (the sale email starts it, the label email completes
// it; either may come first), a mail_messages row for the record (status ignored, matched_by 'ebay'), and the
// Gmail copy into the Trash. Claude reads the email; when the key is missing or it fails, the regex reading
// stands and the row says so (extraction = fallback), with the raw text kept for a later re-read.

export const EXTRACT_MODEL = "claude-haiku-5-5";

export const isEbayMail = (fromEmail: string | null | undefined, subject: string | null | undefined) => ebayKind(fromEmail, subject) !== null;

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

type SaleRow = { id: number; order_number: string | null; item_title: string | null; status: string; sale_mail_id: number | null; label_mail_id: number | null; sold_at: string | null };

/** The sale this email belongs to: by order number, else a recent sale of the same item still waiting for its other email. */
async function findSale(db: SupabaseClient, kind: EbayKind, x: Extracted): Promise<SaleRow | null> {
  if (x.order_number) {
    const { data } = await db.from("ebay_sales").select("id, order_number, item_title, status, sale_mail_id, label_mail_id, sold_at").eq("order_number", x.order_number).maybeSingle();
    if (data) return data as SaleRow;
  }
  const key = titleKey(x.item_title);
  if (!key) return null;
  const since = new Date(Date.now() - 14 * 86_400_000).toISOString();
  const { data } = await db.from("ebay_sales").select("id, order_number, item_title, status, sale_mail_id, label_mail_id, sold_at").gte("created_at", since).is(kind === "sale" ? "sale_mail_id" : "label_mail_id", null).order("created_at", { ascending: false }).limit(50);
  return ((data ?? []) as SaleRow[]).find((s) => titleKey(s.item_title) === key) ?? null;
}

export async function ingestEbay(db: SupabaseClient, box: Session, parsed: ParsedMail, uid: number): Promise<boolean> {
  const kind = ebayKind(parsed.from.email, parsed.subject);
  if (!kind) return false;
  const { data: mailRow, error } = await db
    .from("mail_messages")
    .insert({ gmail_id: parsed.gmailId, thread_id: parsed.threadId, uid, uid_validity: box.uidValidity, received_at: parsed.receivedAt, from_name: parsed.from.name || null, from_email: parsed.from.email || null, to_text: parsed.to || null, subject: parsed.cleanSubject, snippet: parsed.snippet || null, body_text: parsed.text || null, inner_senders: [], attachments: [], status: "ignored", matched_by: "ebay" })
    .select("id")
    .single();
  if (error) return false;
  const mailId = (mailRow as { id: number }).id;

  const { data: x, mode, error: xerr } = await extract(kind, parsed);
  const existing = await findSale(db, kind, x);
  const common = {
    order_number: x.order_number ?? undefined,
    item_id: x.item_id ?? undefined,
    item_title: x.item_title ?? undefined,
    quantity: x.quantity ?? undefined,
    price: x.price ?? undefined,
    shipping: x.shipping ?? undefined,
    total: x.total ?? undefined,
    buyer_name: x.buyer_name ?? undefined,
    buyer_username: x.buyer_username ?? undefined,
    ship_to: x.ship_to ?? undefined,
    tracking: x.tracking ?? undefined,
  };
  const own =
    kind === "sale"
      ? { sale_mail_id: mailId, sold_at: x.sold_at ?? parsed.receivedAt, raw_sale_text: parsed.text.slice(0, 20_000) }
      : { label_mail_id: mailId, label_url: x.label_url ?? undefined, label_ready_at: parsed.receivedAt, raw_label_text: parsed.text.slice(0, 20_000) };
  const clean = Object.fromEntries(Object.entries({ ...common, ...own }).filter(([, v]) => v !== undefined));

  if (existing) {
    const status = existing.status === "shipped" ? "shipped" : (kind === "label" ? existing.sale_mail_id : existing.label_mail_id) ? "label_ready" : kind === "label" ? "label_ready" : "sold";
    await db.from("ebay_sales").update({ ...clean, status, ...(mode === "fallback" ? { extraction: "fallback", extraction_error: xerr } : {}) }).eq("id", existing.id);
  } else {
    await db.from("ebay_sales").insert({ ...EMPTY, ...clean, status: kind === "label" ? "label_ready" : "sold", extraction: mode, extraction_error: xerr });
  }
  const trashed = await trashMessage(box, uid).catch(() => false);
  await db.from("mail_messages").update({ gmail_label: trashed ? TRASH : NOT_IN_INBOX }).eq("id", mailId);
  return true;
}
