// F26-3 AI reading and routing of project emails (SPEC §9.1 F26-b): the pure parts — the prompts, reading
// Claude's answer, and deciding what the CRM does with it. No database or network; tests/f26-ai-routing.test.ts.
import { z } from "zod";
import { scrubSummary } from "./review-apply";

export const EMAIL_KINDS = ["rfi", "change_order", "answer", "scheduling", "document", "info"] as const;
export type EmailKind = (typeof EMAIL_KINDS)[number];

/** On-screen names (translated through the screen language). */
export const KIND_LABEL: Record<EmailKind, string> = { rfi: "RFI", change_order: "Change order", answer: "Answer", scheduling: "Scheduling", document: "Document", info: "Information" };
export const KIND_COLOR: Record<EmailKind, string> = { rfi: "#2563eb", change_order: "#d97706", answer: "#16a34a", scheduling: "#7c3aed", document: "#6b7280", info: "#64748b" };

/** The Project request type a kind becomes (SPEC §9.1 F26-b: RFI / change order → a request line). */
export const REQUEST_TYPE: Partial<Record<EmailKind, "RFI" | "Change order">> = { rfi: "RFI", change_order: "Change order" };

// ---------------------------------------------------------------- reading one email

export type OpenRequest = { id: number; type: string; date: string; description: string | null };

export type RouteInput = {
  projectTitle: string;
  subject: string;
  from: string;
  receivedAt: string;
  text: string;
  attachments: string[];
  openRequests: OpenRequest[];
};

export const ROUTE_SYSTEM = `You read emails for Tech Squad, an audio / video, network and home-automation installer in Florida. Each email was forwarded to the company's project mailbox because it is about one project. Classify it and pull out the essentials. Answer with one JSON object and nothing else:
{
  "kind": "rfi" | "change_order" | "answer" | "scheduling" | "document" | "info",
  "summary": "the ask or the news in one plain sentence, at most 200 characters, in English",
  "asked_by": "who is asking or informing (name and company when known), or null",
  "deadline": "YYYY-MM-DD when a date by which something is needed is stated or clearly implied, else null",
  "answers_request_id": the id of the open request this email answers or settles, else null,
  "confidence": 0 to 1
}
Kinds: "rfi" = someone asks Tech Squad a question or for information, drawings, specs, a decision; "change_order" = someone asks to add, remove or change scope or price; "answer" = the email settles one of the open requests listed (an answer, approval, decision); "scheduling" = someone asks for a visit, a meeting or a date; "document" = the email mainly delivers files (plans, invoices, proposals) with no ask; "info" = news with no ask. Forwarded emails: judge the original message, not the forwarding note. Never invent a deadline or a request id. Do not include passwords, codes or logins in the summary.`;

export function routePrompt(i: RouteInput): string {
  const open = i.openRequests.length ? i.openRequests.map((r) => `- id ${r.id} · ${r.type} · ${r.date} · ${(r.description ?? "").replace(/\s+/g, " ").slice(0, 300)}`).join("\n") : "(none)";
  return [
    `Project: ${i.projectTitle}`,
    `Open requests on this project:\n${open}`,
    `Email received ${i.receivedAt.slice(0, 10)} from ${i.from}`,
    `Subject: ${i.subject}`,
    i.attachments.length ? `Attachments: ${i.attachments.join(", ")}` : "Attachments: none",
    `Body:\n${i.text.slice(0, 12_000)}`,
  ].join("\n\n");
}

const AnswerSchema = z.object({
  kind: z.enum(EMAIL_KINDS),
  summary: z.string().trim().max(400).default(""),
  asked_by: z.string().trim().max(200).nullable().default(null),
  deadline: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .default(null),
  answers_request_id: z.number().int().positive().nullable().default(null),
  confidence: z.number().min(0).max(1).default(0.5),
});
export type RouteAnswer = z.infer<typeof AnswerSchema>;

/** The model's JSON (with or without a code fence) → a checked answer, or null when it is unusable. */
export function parseRouteAnswer(text: string): RouteAnswer | null {
  const cleaned = text.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    const r = AnswerSchema.safeParse(JSON.parse(cleaned.slice(start, end + 1)));
    if (!r.success) return null;
    const a = r.data;
    if (a.deadline && !validDate(a.deadline)) a.deadline = null;
    return { ...a, summary: scrubSummary(a.summary).slice(0, 200), asked_by: a.asked_by ? scrubSummary(a.asked_by) : null };
  } catch {
    return null;
  }
}

function validDate(s: string) {
  const [y, m, d] = s.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d && y >= 2000 && y <= 2100;
}

// ---------------------------------------------------------------- what the CRM does with it

export type RouteActions = {
  /** A Project request line to add (RFI / change order). */
  createRequest?: { type: "RFI" | "Change order"; description: string };
  /** An open request this email settles (only ids that are really open). */
  closeRequestId?: number;
  /** A task for the office (a visit, a meeting, a date was asked for). */
  createTask?: { details: string; dueDate: string | null };
};

/** The description of the request line: the ask, who asks, the deadline, and where it came from. */
export function requestDescription(a: RouteAnswer, mail: { subject: string; from: string; receivedAt: string }): string {
  const lines = [a.summary || mail.subject];
  if (a.asked_by) lines.push(`Asked by ${a.asked_by}`);
  if (a.deadline) lines.push(`Needed by ${a.deadline}`);
  lines.push(`From the email "${mail.subject}" of ${mail.receivedAt.slice(0, 10)} (${mail.from})`);
  return lines.join("\n");
}

/** The decision table of SPEC §9.1 F26-b. `openIds` guards against the model naming a request that is not open. */
export function decide(a: RouteAnswer, mail: { subject: string; from: string; receivedAt: string }, openIds: number[]): RouteActions {
  const out: RouteActions = {};
  const type = REQUEST_TYPE[a.kind];
  if (type) out.createRequest = { type, description: requestDescription(a, mail) };
  if (a.kind === "answer" && a.answers_request_id && openIds.includes(a.answers_request_id)) out.closeRequestId = a.answers_request_id;
  if (a.kind === "scheduling") out.createTask = { details: `Scheduling request from the email "${mail.subject}" (${mail.from}, ${mail.receivedAt.slice(0, 10)}):\n${a.summary || mail.subject}${a.asked_by ? `\nAsked by ${a.asked_by}` : ""}`, dueDate: a.deadline };
  return out;
}

// ---------------------------------------------------------------- the project brief

export const BRIEF_SYSTEM = `You keep the short "project brief" of one Tech Squad project (audio / video, network, home automation, electrical). The office reads it at the top of the project card to know where things stand without reading everything. Write in English, plain sentences, at most 1200 characters, under these short headings exactly: Status, Open requests, Decisions, Next step, Last contact. Under Open requests say who is waiting on whom. Under Last contact give the date and who it was with. Use only the facts given, never invent, keep what is still true and drop what newer facts contradict. Never include a password, PIN, login, gate code or anything that looks like one. Answer with the brief only, no preamble.`;

export type BriefInput = {
  title: string;
  jobStatus: string | null;
  openRequests: OpenRequest[];
  /** Newest last; each line is dated. */
  events: { date: string; text: string }[];
  previous: string | null;
};

export function briefPrompt(i: BriefInput): string {
  const open = i.openRequests.length ? i.openRequests.map((r) => `- ${r.type} (${r.date}): ${(r.description ?? "").replace(/\s+/g, " ").slice(0, 300)}`).join("\n") : "(none)";
  return [
    `Project: ${i.title}${i.jobStatus ? ` · Job status: ${i.jobStatus}` : ""}`,
    `Open requests:\n${open}`,
    `What happened, oldest first:\n${i.events.map((e) => `[${e.date}] ${e.text.replace(/\s+/g, " ").slice(0, 700)}`).join("\n")}`,
    i.previous ? `Previous brief (keep what is still true):\n${i.previous}` : "There is no previous brief.",
  ].join("\n\n");
}

export const scrubBrief = (text: string) => scrubSummary(text).slice(0, 1500);
