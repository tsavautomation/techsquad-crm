import "server-only";
import type { ExtractKind } from "@/registry/types";
import { parseDate } from "./parse";

// Reads values from uploaded photos with Claude (e.g. the expiry date on a driver's licence).
// Needs ANTHROPIC_API_KEY. The result only pre-fills the form; the person checks it before saving.

const MODEL = "claude-haiku-4-5-20251001"; // fast and inexpensive; plenty for reading a card
const IMAGE_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp"];

const PROMPTS: Record<ExtractKind, string> = {
  license_expiration:
    "This is a photo or scan of a US driver's licence or ID card (front or back). Find its EXPIRATION date " +
    '(often labelled "EXP" or "4b"; on the back barcode text it may be "DBA"). Do not return the date of birth or issue date. ' +
    'Answer with only JSON: {"date": "YYYY-MM-DD"} or {"date": null} if you cannot read it with confidence.',
};

export const hasAiKey = () => Boolean(process.env.ANTHROPIC_API_KEY);

export type ExtractResult = { ok: true; value: string | null } | { ok: false; message: string };

export async function extractFromFile(what: ExtractKind, bytes: Buffer, mime: string): Promise<ExtractResult> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return { ok: false, message: "Photo reading isn't set up yet (no AI key)." };
  const media = mime === "image/jpg" ? "image/jpeg" : mime;
  const source = { type: "base64", media_type: media, data: bytes.toString("base64") };
  const block = IMAGE_TYPES.includes(media) ? { type: "image", source } : media === "application/pdf" ? { type: "document", source } : null;
  if (!block) return { ok: false, message: "Only JPG, PNG or PDF files can be read." };

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({ model: MODEL, max_tokens: 100, messages: [{ role: "user", content: [block, { type: "text", text: PROMPTS[what] }] }] }),
  });
  if (!res.ok) return { ok: false, message: `The AI service answered ${res.status}.` };
  const body = (await res.json()) as { content?: { type: string; text?: string }[] };
  const text = body.content?.find((c) => c.type === "text")?.text ?? "";
  return { ok: true, value: parseDate(text) };
}
