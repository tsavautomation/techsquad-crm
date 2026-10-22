import "server-only";
import type { Candidate } from "@/lib/mail/engine";
import { aiConfigured, claude, describeError } from "./claude";
import { REVIEW_MODEL } from "./review-apply";

// F26-2 tolerant matching (Fred 2026-10-22): when no rule and no clear word score settles which project an
// email belongs to, Claude picks among the most similar projects. It files only when sure; otherwise the
// email waits in the Assign list with the candidates as suggestions.

export const PICK_MODEL = REVIEW_MODEL;
export const MIN_CONFIDENCE = 0.8;

const SYSTEM = `You match a forwarded email to one of Tech Squad's projects (an audio / video, network, home-automation and electrical installer in Florida). You get the email and a short list of candidate projects: name, street address, client, category (Low Voltage / Electrical). Pick the one project the email is about, or none when you are not sure or when two candidates fit equally (for example a client's low-voltage and electrical projects when the email does not say LV or EL). Spelling mistakes, nicknames, partial addresses and first names count as evidence; a subject with LV / L.V. / Low Voltage or EL / Elec / Electrical picks the category. Answer with one JSON object only: {"project_id": number or null, "confidence": 0 to 1, "why": "one short sentence"}.`;

export type Pick = { projectId: number | null; confidence: number; why: string; error?: string };

export async function aiPickProject(mail: { subject: string; from: string; text: string; attachments: string[] }, candidates: Candidate[]): Promise<Pick> {
  if (!aiConfigured() || !candidates.length) return { projectId: null, confidence: 0, why: "" };
  const list = candidates.map((c) => `- id ${c.project.id} · ${c.project.title ?? "(no name)"} · ${c.project.street ?? "(no address)"} · client last name: ${c.project.ownerLastName ?? "?"} · ${c.project.category ?? "?"}`).join("\n");
  const prompt = [`Subject: ${mail.subject}`, `From: ${mail.from}`, mail.attachments.length ? `Attachments: ${mail.attachments.join(", ")}` : "", `Body:\n${mail.text.slice(0, 4000)}`, `Candidate projects:\n${list}`].filter(Boolean).join("\n\n");
  try {
    const res = await claude().messages.create({ model: PICK_MODEL, max_tokens: 200, system: SYSTEM, messages: [{ role: "user", content: prompt }] });
    const text = res.content.find((b) => b.type === "text")?.text ?? "";
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start < 0 || end <= start) return { projectId: null, confidence: 0, why: "", error: "unreadable answer" };
    const j = JSON.parse(text.slice(start, end + 1)) as { project_id?: unknown; confidence?: unknown; why?: unknown };
    const id = typeof j.project_id === "number" && candidates.some((c) => c.project.id === j.project_id) ? j.project_id : null;
    const confidence = typeof j.confidence === "number" ? Math.max(0, Math.min(1, j.confidence)) : 0;
    return { projectId: id, confidence, why: typeof j.why === "string" ? j.why.slice(0, 300) : "" };
  } catch (e) {
    return { projectId: null, confidence: 0, why: "", error: describeError(e) };
  }
}
