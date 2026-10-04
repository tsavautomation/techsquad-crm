import "server-only";
import { aiConfigured, claude } from "@/lib/ai/claude";
import type { CatProject } from "./match";

// F15: when the word matching can't tell which project a calendar event belongs to, Claude reads the
// event (title, place, date, first lines) against the list of projects and either names one, says
// "not a job visit" (a holiday, a meeting, a personal entry) or gives up. Only ids come back; the
// result only pre-fills the visit, and anything without a project lands on the "Needs a project" list.

const MODEL = "claude-haiku-4-5-20251001";

export type AiEvent = { key: string; date: string; summary: string; location: string; description: string; candidates: number[] };
export type AiDecision = { projectId: number | null; skip: boolean };

export const aiAvailable = aiConfigured;

const projectLine = (p: CatProject) => `${p.id} | ${p.title} | ${[p.street, p.city].filter(Boolean).join(", ") || "-"} | ${p.owner ?? "-"}`;

/** Decide a batch of events (up to ~40). Unknown keys mean "no decision". */
export async function aiMatch(events: AiEvent[], projects: CatProject[]): Promise<Map<string, AiDecision>> {
  const out = new Map<string, AiDecision>();
  if (!events.length || !aiConfigured()) return out;
  const prompt =
    "You match Google Calendar entries of an audio-video installation company (Tech Squad, Miami) to its projects.\n" +
    "PROJECTS (id | name | address | owner):\n" +
    projects.map(projectLine).join("\n") +
    "\n\nEVENTS (key | date | title | place | notes | likely ids):\n" +
    events.map((e) => `${e.key} | ${e.date} | ${e.summary || "-"} | ${e.location || "-"} | ${e.description.replace(/\s+/g, " ").slice(0, 120) || "-"} | ${e.candidates.join(",") || "-"}`).join("\n") +
    "\n\nFor each event answer with the project id when the title, client name or address clearly points at one project (the likely ids are hints, not the answer). " +
    'Use "skip": true when the entry is clearly not a job at a client (holiday, day off, office meeting, personal appointment, training, note). ' +
    "When unsure, leave the project null and skip false.\n" +
    'Answer with JSON only: [{"k":"<key>","p":<id or null>,"skip":<true|false>}, ...]';
  const res = await claude().messages.create({
    model: MODEL,
    max_tokens: 4000,
    messages: [{ role: "user", content: prompt }],
  });
  const text = res.content.find((c) => c.type === "text")?.text ?? "";
  const json = text.slice(text.indexOf("["), text.lastIndexOf("]") + 1);
  let rows: { k?: string; p?: number | null; skip?: boolean }[] = [];
  try {
    rows = JSON.parse(json) as typeof rows;
  } catch {
    return out;
  }
  const valid = new Set(projects.map((p) => p.id));
  for (const r of rows) {
    if (!r.k) continue;
    const p = typeof r.p === "number" && valid.has(r.p) ? r.p : null;
    out.set(String(r.k), { projectId: p, skip: Boolean(r.skip) && !p });
  }
  return out;
}
