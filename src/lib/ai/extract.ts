import "server-only";
import type Anthropic from "@anthropic-ai/sdk";
import type { ExtractKind } from "@/registry/types";
import { aiConfigured, claude, DEFAULT_MODEL, describeError } from "./claude";
import { parseDate } from "./parse";

// Reads values from uploaded photos with Claude: the expiry date on a driver's licence (SPEC §9.1 B1-a) and
// the amount, date, number and payee on a check (Payroll, Fred 2026-10-13). Needs ANTHROPIC_API_KEY.
// The result only pre-fills the form; the person checks it before saving.

const FAST_MODEL = "claude-haiku-4-5-20251001"; // plenty for reading a printed card
const IMAGE_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp"] as const;
type ImageType = (typeof IMAGE_TYPES)[number];

const READINGS: Record<ExtractKind, { prompt: string; model: string; maxTokens: number }> = {
  license_expiration: {
    model: FAST_MODEL,
    maxTokens: 100,
    prompt:
      "This is a photo or scan of a US driver's licence or ID card (front or back). Find its EXPIRATION date " +
      '(often labelled "EXP" or "4b"; on the back barcode text it may be "DBA"). Do not return the date of birth or issue date. ' +
      'Answer with only JSON: {"date": "YYYY-MM-DD"} or {"date": null} if you cannot read it with confidence.',
  },
  check: {
    // Handwritten amounts and names: the stronger model earns its few cents here.
    model: DEFAULT_MODEL,
    maxTokens: 300,
    prompt:
      "This is a photo or scan of a payment: usually a US bank check (paper, possibly handwritten), sometimes a Zelle, wire or payroll receipt. Read it carefully. " +
      "Return only JSON with these keys: " +
      '"is_check" (true when it is a paper check), ' +
      '"amount" (the amount paid as a plain number with two decimals, e.g. 1250.00; on a check prefer the numeric box and verify it against the written words), ' +
      '"date" ("YYYY-MM-DD", the date written on the check or receipt), ' +
      '"check_number" (the check number printed at the top right and in the MICR line, digits only), ' +
      '"payee" (the name on the "Pay to the order of" line, or the recipient of the transfer, exactly as written). ' +
      "Use null for anything you cannot read with confidence. Do not return the bank's routing or account numbers.",
  },
};

export const hasAiKey = aiConfigured;

/** What was read, by key ("date" for a licence; "amount", "date", "check_number", "payee", "is_check" for a check). */
export type ExtractResult = { ok: true; values: Record<string, string | null> } | { ok: false; message: string };

function parseCheck(text: string): Record<string, string | null> {
  const m = text.match(/\{[\s\S]*\}/);
  let json: Record<string, unknown> = {};
  try {
    json = m ? (JSON.parse(m[0]) as Record<string, unknown>) : {};
  } catch {
    json = {};
  }
  const amount = typeof json.amount === "number" ? json.amount : typeof json.amount === "string" ? Number(json.amount.replace(/[^0-9.]/g, "")) : NaN;
  const num = typeof json.check_number === "number" ? String(json.check_number) : typeof json.check_number === "string" ? json.check_number.replace(/\D/g, "") : "";
  const payee = typeof json.payee === "string" ? json.payee.trim() : "";
  return {
    is_check: json.is_check === true ? "true" : json.is_check === false ? "false" : null,
    amount: Number.isFinite(amount) && amount > 0 ? amount.toFixed(2) : null,
    date: typeof json.date === "string" ? parseDate(`{"date": "${json.date}"}`) : null,
    check_number: num ? num : null,
    payee: payee ? payee : null,
  };
}

export async function extractFromFile(what: ExtractKind, bytes: Buffer, mime: string): Promise<ExtractResult> {
  if (!aiConfigured()) return { ok: false, message: "Photo reading isn't set up yet (no AI key)." };
  const media = mime === "image/jpg" ? "image/jpeg" : mime;
  const data = bytes.toString("base64");
  const block: Anthropic.ContentBlockParam | null = (IMAGE_TYPES as readonly string[]).includes(media)
    ? { type: "image", source: { type: "base64", media_type: media as ImageType, data } }
    : media === "application/pdf"
      ? { type: "document", source: { type: "base64", media_type: "application/pdf", data } }
      : null;
  if (!block) return { ok: false, message: "Only JPG, PNG or PDF files can be read." };

  const reading = READINGS[what];
  try {
    const res = await claude().messages.create({
      model: reading.model,
      max_tokens: reading.maxTokens,
      messages: [{ role: "user", content: [block, { type: "text", text: reading.prompt }] }],
    });
    const text = res.content.find((c) => c.type === "text")?.text ?? "";
    return { ok: true, values: what === "check" ? parseCheck(text) : { date: parseDate(text) } };
  } catch (e) {
    return { ok: false, message: describeError(e) };
  }
}
