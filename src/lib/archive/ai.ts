import "server-only";
import type Anthropic from "@anthropic-ai/sdk";
import { aiConfigured, claude, describeError } from "@/lib/ai/claude";

// F16 Report archive: Claude reads the reports the two form parsers can't — typed notes, screenshots,
// scanned PDFs — and returns the Job Report fields. Credentials are separated so they land in the
// encrypted field. Haiku: cheap and good enough for a page of notes.

const MODEL = "claude-haiku-4-5-20251001";

export type AiReport = {
  date: string | null;
  checkIn: string | null;
  checkOut: string | null;
  technicians: string[];
  client: string | null;
  report: string;
  credentials: string | null;
  pending: string[];
  materials: string | null;
  problems: string | null;
  result: "Completed" | "Partial" | "Not done" | null;
  /** Not a job report at all (an invoice, a proposal, a floor plan…). */
  notAReport: boolean;
};

const PROMPT =
  "This is a field report from Tech Squad, an audio-video and automation installer in Miami, written by a technician (often in Portuguese). " +
  "Read it and answer with JSON only, keeping the original language and wording of the report text:\n" +
  '{"date":"YYYY-MM-DD or null","checkIn":"HH:MM 24h or null","checkOut":"HH:MM or null","technicians":["first names of the technicians who went"],' +
  '"client":"client or job name as written or null","report":"the work done, as written, without the credentials","credentials":"every network name, Wi-Fi password, login, PIN, IP address or device code, one per line, or null",' +
  '"pending":["things left to do, one per item"],"materials":"materials used or null","problems":"problems found or null","result":"Completed|Partial|Not done|null","notAReport":false}\n' +
  'Set "notAReport": true when the file is not a visit report (an invoice, a proposal, a plan, a photo without text).';

export async function aiReadReport(input: { text?: string | null; image?: { bytes: Buffer; mime: string }; pdf?: Buffer; hint: string }): Promise<AiReport | { error: string }> {
  if (!aiConfigured()) return { error: "ANTHROPIC_API_KEY is not set" };
  const content: Anthropic.ContentBlockParam[] = [];
  if (input.image) {
    const media = (input.image.mime === "image/jpg" ? "image/jpeg" : input.image.mime) as "image/jpeg" | "image/png" | "image/gif" | "image/webp";
    content.push({ type: "image", source: { type: "base64", media_type: media, data: input.image.bytes.toString("base64") } });
  } else if (input.pdf) {
    content.push({ type: "document", source: { type: "base64", media_type: "application/pdf", data: input.pdf.toString("base64") } });
  } else if (input.text) content.push({ type: "text", text: `REPORT TEXT:\n${input.text.slice(0, 12_000)}` });
  else return { error: "nothing to read" };
  content.push({ type: "text", text: `${PROMPT}\nFile name and folder, as hints: ${input.hint}` });
  try {
    const res = await claude().messages.create({ model: MODEL, max_tokens: 2500, messages: [{ role: "user", content }] });
    const text = res.content.find((c) => c.type === "text")?.text ?? "";
    const json = text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1);
    const r = JSON.parse(json) as Partial<AiReport>;
    return {
      date: typeof r.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(r.date) ? r.date : null,
      checkIn: typeof r.checkIn === "string" && /^\d{2}:\d{2}$/.test(r.checkIn) ? r.checkIn : null,
      checkOut: typeof r.checkOut === "string" && /^\d{2}:\d{2}$/.test(r.checkOut) ? r.checkOut : null,
      technicians: Array.isArray(r.technicians) ? r.technicians.filter((x): x is string => typeof x === "string").slice(0, 10) : [],
      client: typeof r.client === "string" ? r.client : null,
      report: typeof r.report === "string" ? r.report.trim() : "",
      credentials: typeof r.credentials === "string" && r.credentials.trim() ? r.credentials.trim() : null,
      pending: Array.isArray(r.pending) ? r.pending.filter((x): x is string => typeof x === "string").slice(0, 5) : [],
      materials: typeof r.materials === "string" && r.materials.trim() ? r.materials.trim() : null,
      problems: typeof r.problems === "string" && r.problems.trim() ? r.problems.trim() : null,
      result: r.result === "Completed" || r.result === "Partial" || r.result === "Not done" ? r.result : null,
      notAReport: Boolean(r.notAReport),
    };
  } catch (e) {
    return { error: describeError(e) };
  }
}
