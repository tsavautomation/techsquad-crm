import { z } from "zod";
import { formatDate } from "@/lib/dates";

// J-z AI "looks done" (Jessica via Fred 2026-10-26): the pure part — prompt, answer. Tests: tests/j3-round.test.ts.

export const TASK_DONE_AUTOMATION_ID = 900504;
export const MIN_CONFIDENCE = 0.8;

export const TASK_DONE_SYSTEM = `You check whether a pending task of an AV / electrical service company was completed, by reading Job Reports written after the task. Answer ONLY a JSON object: {"done": true|false, "confidence": 0-1, "report_id": number|null, "quote": "the exact sentence(s) of the report that confirm it, verbatim, max 300 characters"|null, "why": "one short sentence"}. Say done only when a report explicitly states that this specific pending item was completed (not merely mentioned, planned, or partially done). When in doubt, done = false.`;

export type TaskForCheck = { id: number; details: string; checklist: string[]; createdAt: string };
export type ReportForCheck = { id: number; date: string | null; technician: string | null; result: string | null; text: string };

export function taskDonePrompt(task: TaskForCheck, reports: ReportForCheck[]): string {
  const list = reports.map((r) => `--- Report #${r.id} (${r.date ? formatDate(r.date) : "?"}, ${r.technician ?? "?"}, result: ${r.result ?? "?"}) ---\n${r.text.slice(0, 4000)}`).join("\n\n");
  return `Pending task (created ${formatDate(task.createdAt.slice(0, 10))}):\n${task.details.slice(0, 2000)}${task.checklist.length ? `\nChecklist still open:\n- ${task.checklist.join("\n- ")}` : ""}\n\nJob Reports written after it, same project:\n${list}`;
}

const Answer = z.object({
  done: z.unknown().optional().transform((v) => v === true || v === "true"),
  confidence: z.unknown().optional().transform((v) => (typeof v === "number" ? v : Number(v) || 0)),
  report_id: z.unknown().optional().transform((v) => (v == null ? null : Number(v) || null)),
  quote: z.unknown().optional().transform((v) => (v == null ? null : String(v).trim().slice(0, 300) || null)),
  why: z.unknown().optional().transform((v) => (v == null ? null : String(v).trim().slice(0, 200) || null)),
});
export type TaskDoneAnswer = z.infer<typeof Answer>;

export function parseTaskDone(raw: string): TaskDoneAnswer | null {
  const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    const r = Answer.safeParse(JSON.parse(cleaned.slice(start, end + 1)));
    return r.success ? r.data : null;
  } catch {
    return null;
  }
}

