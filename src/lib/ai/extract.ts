import "server-only";
import type Anthropic from "@anthropic-ai/sdk";
import type { ExtractKind } from "@/registry/types";
import { aiConfigured, claude, describeError } from "./claude";
import { parseDate } from "./parse";

// Reads values from uploaded photos with Claude (e.g. the expiry date on a driver's licence).
// Needs ANTHROPIC_API_KEY. The result only pre-fills the form; the person checks it before saving.

const MODEL = "claude-haiku-4-5-20251001"; // fast and inexpensive; plenty for reading a card (SPEC §9.1 B1-a)
const IMAGE_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp"] as const;
type ImageType = (typeof IMAGE_TYPES)[number];

const PROMPTS: Record<ExtractKind, string> = {
  license_expiration:
    "This is a photo or scan of a US driver's licence or ID card (front or back). Find its EXPIRATION date " +
    '(often labelled "EXP" or "4b"; on the back barcode text it may be "DBA"). Do not return the date of birth or issue date. ' +
    'Answer with only JSON: {"date": "YYYY-MM-DD"} or {"date": null} if you cannot read it with confidence.',
};

export const hasAiKey = aiConfigured;

export type ExtractResult = { ok: true; value: string | null } | { ok: false; message: string };

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

  try {
    const res = await claude().messages.create({
      model: MODEL,
      max_tokens: 100,
      messages: [{ role: "user", content: [block, { type: "text", text: PROMPTS[what] }] }],
    });
    const text = res.content.find((c) => c.type === "text")?.text ?? "";
    return { ok: true, value: parseDate(text) };
  } catch (e) {
    return { ok: false, message: describeError(e) };
  }
}
