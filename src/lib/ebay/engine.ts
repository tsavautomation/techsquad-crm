import { z } from "zod";

// F32 Ebay sales (SPEC §9.1 F32-a): the pure part. Which emails are eBay's two, what can be read from them
// without a model, how Claude's extraction is read, and how the two emails merge into one sale.
// Tests: tests/f32-ebay.test.ts.

export type EbayKind = "sale" | "label";

const EBAY_SENDER = /@(?:[a-z0-9.-]+\.)?ebay\.(?:com|co\.uk|ca|de|com\.au)$/i;
const SALE_SUBJECT = /\byou made the sale\b|\byour item sold\b|\bsold!?\b.*\bship\b|\bitem sold\b/i;
const LABEL_SUBJECT = /\bshipping label is ready\b|\byour label is ready\b|\bprint your (?:shipping )?label\b/i;

/**
 * The sale email or the label email, by subject and sender; null for anything else. A forwarded copy has the
 * forwarder as sender, so the forwarded "From: eBay <ebay@ebay.com>" line (innerSenders) or "eBay" in the text counts too.
 */
export function ebayKind(fromEmail: string | null | undefined, subject: string | null | undefined, hints: { innerSenders?: string[]; text?: string | null } = {}): EbayKind | null {
  const from = (fromEmail ?? "").trim();
  const subj = subject ?? "";
  const fromEbay = EBAY_SENDER.test(from) || (hints.innerSenders ?? []).some((e) => EBAY_SENDER.test(e.trim())) || /\bebay\b/i.test((hints.text ?? "").slice(0, 3000));
  if (LABEL_SUBJECT.test(subj) && (fromEbay || /\bebay\b/i.test(subj))) return "label";
  if (SALE_SUBJECT.test(subj) && (fromEbay || /\bebay\b/i.test(subj))) return "sale";
  return null;
}

/** eBay order numbers look like 12-34567-89012. */
export const ORDER_NUMBER = /\b(\d{2}-\d{5}-\d{5})\b/;

export type Extracted = {
  order_number: string | null;
  item_id: string | null;
  item_title: string | null;
  quantity: number | null;
  price: number | null;
  shipping: number | null;
  total: number | null;
  buyer_name: string | null;
  buyer_username: string | null;
  ship_to: string | null;
  sold_at: string | null;
  label_url: string | null;
  tracking: string | null;
};

export const EMPTY: Extracted = { order_number: null, item_id: null, item_title: null, quantity: null, price: null, shipping: null, total: null, buyer_name: null, buyer_username: null, ship_to: null, sold_at: null, label_url: null, tracking: null };

export const EXTRACT_SYSTEM = `You read eBay seller notification emails ("You made the sale" and "Your shipping label is ready") for a small AV company and return ONLY a JSON object with these keys (null when the email does not say): order_number (eBay order number like 12-34567-89012), item_id (the numeric eBay item number), item_title, quantity (integer), price (item price as a number, no currency sign), shipping (shipping charged to the buyer), total (order total), buyer_name (the person to ship to), buyer_username (the eBay user id), ship_to (the full shipping address on separate lines joined with \\n, including the name), sold_at (ISO 8601 date-time when the sale happened, if stated), label_url (the link to print or download the shipping label, if any), tracking (the tracking number, if any). Copy values exactly as written; never invent an address or a number. Ignore marketing text and unsubscribe links.`;

/** The user turn: subject, a few headers, the text, and the links (hrefs) found in the HTML. */
export function extractPrompt(m: { subject: string; from: string; receivedAt: string; text: string; links: string[] }): string {
  const links = m.links.length ? `\nLinks in the email:\n${m.links.slice(0, 40).join("\n")}` : "";
  return `Subject: ${m.subject}\nFrom: ${m.from}\nReceived: ${m.receivedAt}\n\n${m.text.slice(0, 12_000)}${links}`;
}

const str = (max: number) =>
  z
    .unknown()
    .optional()
    .transform((v) => (v == null ? null : String(typeof v === "object" ? JSON.stringify(v) : v).trim().slice(0, max) || null));
const num = z
  .unknown()
  .optional()
  .transform((v) => {
    if (v == null) return null;
    const n = typeof v === "number" ? v : Number(String(v).replace(/[^0-9.-]/g, ""));
    return Number.isFinite(n) ? n : null;
  });

const Schema = z.object({
  order_number: str(40),
  item_id: str(40),
  item_title: str(300),
  quantity: num,
  price: num,
  shipping: num,
  total: num,
  buyer_name: str(120),
  buyer_username: str(80),
  ship_to: str(600),
  sold_at: str(40),
  label_url: str(2000),
  tracking: str(80),
});

/** Raw line breaks and tabs inside a JSON string (an address on several lines) become escapes, so JSON.parse accepts them. */
export function repairJson(text: string): string {
  let out = "";
  let inString = false;
  let escaped = false;
  for (const ch of text) {
    if (inString) {
      if (escaped) {
        out += ch;
        escaped = false;
      } else if (ch === "\\") {
        out += ch;
        escaped = true;
      } else if (ch === '"') {
        out += ch;
        inString = false;
      } else if (ch === "\n") out += "\\n";
      else if (ch === "\r") out += "";
      else if (ch === "\t") out += "\\t";
      else out += ch;
    } else {
      out += ch;
      if (ch === '"') inString = true;
    }
  }
  return out;
}

/** Reads Claude's answer: a JSON object, with or without a fence or chatter. Null when unreadable. */
export function parseExtraction(raw: string): Extracted | null {
  const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  let parsed: unknown;
  const slice = cleaned.slice(start, end + 1);
  try {
    parsed = JSON.parse(slice);
  } catch {
    try {
      parsed = JSON.parse(repairJson(slice));
    } catch {
      return null;
    }
  }
  const r = Schema.safeParse(parsed);
  if (!r.success) return null;
  const a = r.data;
  return {
    ...a,
    order_number: a.order_number?.match(ORDER_NUMBER)?.[1] ?? a.order_number,
    quantity: a.quantity !== null ? Math.max(1, Math.round(a.quantity)) : null,
    sold_at: a.sold_at && !Number.isNaN(Date.parse(a.sold_at)) ? new Date(a.sold_at).toISOString() : null,
    label_url: a.label_url && /^https?:\/\//i.test(a.label_url) ? a.label_url : null,
    ship_to: a.ship_to?.replace(/\\n/g, "\n").replace(/[ \t]*\n[ \t]*/g, "\n").trim() || null,
  };
}

/** The hrefs of an HTML email, unescaped and without duplicates (tracking-pixel and image links dropped). */
export function linksIn(html: string | null | undefined): string[] {
  if (!html) return [];
  const out: string[] = [];
  for (const m of html.matchAll(/href\s*=\s*["']([^"']+)["']/gi)) {
    const url = m[1].replace(/&amp;/g, "&").trim();
    if (!/^https?:\/\//i.test(url) || /\.(?:png|jpe?g|gif|svg)(?:\?|$)/i.test(url) || /mailto:/i.test(url)) continue;
    if (!out.includes(url)) out.push(url);
  }
  return out;
}

/** The URLs written in a plain-text email ("Download label <https://…>"). */
export function textLinks(text: string | null | undefined): string[] {
  const out: string[] = [];
  for (const m of (text ?? "").matchAll(/https?:\/\/[^\s<>"')\]]+/g)) if (!out.includes(m[0])) out.push(m[0]);
  return out;
}

/** What can be read without a model: the order number, a label link, a price, a tracking number. */
export function heuristics(kind: EbayKind, text: string, htmlLinks: string[], subject = ""): Extracted {
  const e: Extracted = { ...EMPTY };
  const links = [...htmlLinks, ...textLinks(text)];
  e.item_title = itemTitle(kind, text, subject);
  e.order_number = text.match(ORDER_NUMBER)?.[1] ?? null;
  const price = text.match(/(?:sold for|price|item price|you made)[^$\n]{0,40}\$\s?([\d,]+\.\d{2})/i) ?? text.match(/\$\s?([\d,]+\.\d{2})/);
  if (price) e.price = Number(price[1].replace(/,/g, ""));
  const total = text.match(/(?:order total|total)[^$\n]{0,30}\$\s?([\d,]+\.\d{2})/i);
  if (total) e.total = Number(total[1].replace(/,/g, ""));
  const item = text.match(/item(?: number| id| #)?\s*[:#]?\s*(\d{9,15})\b/i);
  if (item) e.item_id = item[1];
  const tracking = text.match(/tracking(?: number)?\s*[:#]?\s*([A-Z0-9]{10,34})\b/i);
  if (tracking) e.tracking = tracking[1];
  if (kind === "label") e.label_url = links.find((u) => /ebay\.com\/ship\/.*print/i.test(u)) ?? links.find((u) => /label/i.test(u) && /ebay/i.test(u) && !/packing/i.test(u)) ?? links.find((u) => /label/i.test(u)) ?? null;
  const user = text.match(/\bbuyer\s*\n+\s*([A-Za-z0-9._*-]{3,40})\s*\n/i);
  if (user && !/^(name|user)/i.test(user[1])) e.buyer_username = user[1];
  return e;
}

/**
 * The item's name: the subject "You made the sale for <item>", the sale email's "[<item>]<link to the order>",
 * or, on the label email, the line just above "Order number".
 */
export function itemTitle(kind: EbayKind, text: string, subject: string): string | null {
  const clean = (t: string) => t.replace(/\s+/g, " ").replace(/^[\[\s]+|[\]\s]+$/g, "").trim().slice(0, 300) || null;
  const fromSubject = subject.match(/\b(?:sale|sold)\s+for\s+(.+?)\s*$/i)?.[1];
  if (fromSubject && !/^(?:your|the)\s+item$/i.test(fromSubject)) return clean(fromSubject);
  const bracket = text.match(/\[([^\]\n]{3,200})\]\s*<https?:\/\/(?:www\.)?(?:cgi\.)?ebay\.com\/(?:mesh\/ord|itm|ws\/eBayISAPI)/i)?.[1];
  if (bracket && !/^(?:alt|image|logo|shop ebay)$/i.test(bracket.trim())) return clean(bracket);
  if (kind === "label") {
    const lines = text.split("\n").map((l) => l.trim());
    const at = lines.findIndex((l) => /^order number\b/i.test(l));
    for (let i = at - 1; i >= 0 && i >= at - 4; i--) {
      const l = lines[i];
      if (l && !/^(?:<https?:|\[alt\]|\[image)/i.test(l) && !/^https?:\/\//i.test(l) && l.length >= 3) return clean(l);
    }
  }
  return null;
}

/** Heuristic values fill the gaps the model left; the model wins where both answer. */
export function merge(ai: Extracted | null, fallback: Extracted): Extracted {
  if (!ai) return fallback;
  const out = { ...fallback };
  for (const k of Object.keys(EMPTY) as (keyof Extracted)[]) if (ai[k] !== null && ai[k] !== undefined) (out as Record<string, unknown>)[k] = ai[k];
  return out;
}

/** What the label email owns on the row; everything else it may only fill in where the sale email left a blank. */
export const LABEL_FIELDS: (keyof Extracted)[] = ["label_url", "tracking"];
const MONEY_FIELDS: (keyof Extracted)[] = ["price", "shipping", "total"];

/**
 * Values to write when an email lands on an existing row: the sale email sets its facts; the label email sets
 * the label link and tracking, and fills blanks (the sale email's price is never replaced by the postage).
 */
export function fieldsFor(kind: EbayKind, x: Extracted, existing: Partial<Record<keyof Extracted, unknown>> | null): Partial<Extracted> {
  const out: Partial<Extracted> = {};
  for (const k of Object.keys(EMPTY) as (keyof Extracted)[]) {
    const v = x[k];
    if (v === null || v === undefined) continue;
    // The label email's money is the postage the seller paid, never the order's price, shipping or total.
    if (kind === "label" && MONEY_FIELDS.includes(k)) continue;
    if (kind === "label" && !LABEL_FIELDS.includes(k) && existing && existing[k] !== null && existing[k] !== undefined) continue;
    (out as Record<string, unknown>)[k] = v;
  }
  if (kind === "sale") {
    delete out.label_url;
    if (existing?.tracking) delete out.tracking;
  }
  return out;
}

/** Shown on the tile: "sold", "label ready" (both emails in), "shipped". */
export type SaleStatus = "sold" | "label_ready" | "shipped";

/** Two words of the title that make a loose key when eBay gave no order number (e.g. the label email). */
export function titleKey(title: string | null | undefined): string {
  return (title ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2)
    .slice(0, 6)
    .join(" ");
}
