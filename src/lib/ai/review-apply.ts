import { z } from "zod";
import { formatDate } from "@/lib/dates";
import { isNotFinished, missingLines } from "@/lib/field-day/day";
import { REASONS } from "@/registry/tables/job_reports";

// F17 AI review of Job Reports (SPEC §9.1 F17-a/b): the pure part. Claude answers with JSON; this
// file turns that answer into the patch the review writes. No database, no network: tested in
// tests/f17-ai-review.test.ts.

/** The model Fred chose for the review (2026-10-05, "Sonnet is enough"). */
export const REVIEW_MODEL = "claude-sonnet-5-5";

/** What the report form keeps for the review. `logins` is already decrypted. */
export type ReviewInput = {
  report: string;
  result: string | null;
  partial_reason: string | null;
  missing_items: string | null;
  logins: string | null;
  /** The report's Date (YYYY-MM-DD), for "from Job Report of m/d/yyyy". */
  date: string | null;
};

export const AnswerSchema = z.object({
  report: z.string().default(""),
  grammar_changed: z.boolean().default(false),
  pending: z.array(z.string()).default([]),
  reason: z.string().nullable().default(null),
  credentials: z.array(z.string()).default([]),
});
export type ReviewAnswer = z.infer<typeof AnswerSchema>;

/** The marker left in the text where login details were (F17-b). */
export const MOVED_MARKER = "(login details moved to the Logins field)";

export const SYSTEM_PROMPT = `You review field-service job reports for Tech Squad, an audio / video, network and home-automation installer in South Florida. The technicians are mostly Brazilian and write in Portuguese or English, often by dictation on a phone, so the text may have transcription slips, missing punctuation and run-on sentences.

You receive one report and answer with JSON only (no prose, no code fence) of this shape:
{"report": string, "grammar_changed": boolean, "pending": string[], "reason": string | null, "credentials": string[]}

1. "report": the same text with grammar, spelling, punctuation and clarity corrected. Keep the language it was written in (Portuguese stays Portuguese, English stays English, a mixed text keeps its main language; never translate). Keep the meaning, the facts, the order, the line breaks, the brand names, model numbers, room names and quantities. Do not add, summarise, soften or embellish anything. If the text is already clean, return it unchanged and set "grammar_changed" to false.
2. "pending": work the text says is still to be done, missing, waiting on someone or something, or needing a return visit. One short item per entry, in the language of the report, only what the text actually states. Leave out anything already listed under "already_missing". Empty when the job is finished.
3. "reason": when "pending" is not empty, the single best fit from "reasons"; otherwise null.
4. "credentials": every login detail in the text — user names, passwords, PINs, Wi-Fi network names with their passwords, IP addresses with a login, account emails with a password — one line each, like "Router admin: admin / 1234" or "Wi-Fi Casa5G: senha123". In "report", replace each sentence or fragment that carried them with the marker "${MOVED_MARKER}" (in Portuguese: "(dados de acesso movidos para o campo Logins)"), so no password stays in the text. Gate codes and where to park are not credentials: leave them in the text.`;

/** The user turn: the report and what the form already holds. */
export function userPrompt(input: ReviewInput): string {
  return JSON.stringify(
    {
      report: input.report,
      result: input.result,
      already_missing: missingLines(input.missing_items),
      reasons: REASONS,
    },
    null,
    2,
  );
}

/** Parse Claude's text answer (tolerates a ```json fence). Null when it isn't the expected JSON. */
export function parseAnswer(text: string): ReviewAnswer | null {
  const body = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    const r = AnswerSchema.safeParse(JSON.parse(body.slice(start, end + 1)));
    return r.success ? r.data : null;
  } catch {
    return null;
  }
}

export type ReviewOutcome = {
  /** Columns to write on the report (plain values; the caller encrypts logins_and_passwords). */
  patch: Record<string, unknown>;
  /** Block to append to the project's System Credentials, or null. */
  projectCredentials: string | null;
  /** Plain-English lines for "What the AI changed". Empty when nothing was changed. */
  notes: string[];
};

const squash = (s: string) => s.replace(/\s+/g, " ").trim();
const cleanLines = (list: string[]) => [...new Set(list.map((x) => x.replace(/^\s*(?:[-*•·]|\d+[.)])\s*/, "").trim()).filter(Boolean))];

/**
 * Turn the answer into the patch. Rules (SPEC §9.1 F17-a/b):
 * - the clean text replaces the report when it really differs (the original stays in History);
 *   an answer that lost more than half of the text is not trusted;
 * - pending work goes to What's missing (one per line, nothing twice); a report with no Result,
 *   or marked Completed by mistake, is not overruled: Partial is only set when Result is blank;
 * - login details go to Login and Passwords and come back as a block for the project.
 */
export function applyReview(input: ReviewInput, answer: ReviewAnswer): ReviewOutcome {
  const patch: Record<string, unknown> = {};
  const notes: string[] = [];

  // 1. Grammar and clarity.
  let report = answer.report.trim();
  const original = input.report.trim();
  const credentials = cleanLines(answer.credentials);
  // Belt and braces: a credential line the model left in the text is replaced by the marker here.
  for (const c of credentials) if (c.length >= 4 && report.includes(c)) report = report.replace(c, MOVED_MARKER);
  const trusted = report.length >= original.length * 0.5 || credentials.length > 0;
  if (report && trusted && squash(report) !== squash(original)) {
    patch.report = report;
    if (answer.grammar_changed || squash(report.replace(MOVED_MARKER, "")) !== squash(original)) notes.push("Grammar and clarity corrected; the original text is in History.");
  }

  // 2. Pending work → What's missing (+ Result = Partial when blank).
  const already = missingLines(input.missing_items).map((x) => x.toLowerCase());
  const pending = cleanLines(answer.pending).filter((x) => !already.includes(x.toLowerCase()));
  if (pending.length) {
    if (input.result === "Completed") {
      notes.push(`The text mentions pending work (${pending.join("; ")}), but the report says Completed: nothing was changed.`);
    } else {
      patch.missing_items = [...missingLines(input.missing_items), ...pending].join("\n");
      notes.push(`${pending.length} pending item${pending.length === 1 ? "" : "s"} added to What's missing.`);
      if (!isNotFinished(input.result)) {
        patch.result = "Partial";
        notes.push("Result set to Partial.");
      }
      if (!input.partial_reason) patch.partial_reason = answer.reason && REASONS.includes(answer.reason) ? answer.reason : "Other";
    }
  }

  // 3. Logins and passwords → the report's Login and Passwords field + the project.
  const have = (input.logins ?? "").split(/\r?\n/).map((x) => x.trim().toLowerCase());
  const fresh = credentials.filter((c) => !have.includes(c.toLowerCase()));
  let projectCredentials: string | null = null;
  if (fresh.length) {
    patch.logins_and_passwords = [input.logins?.trim(), ...fresh].filter(Boolean).join("\n");
    projectCredentials = `From Job Report of ${formatDate(input.date) || "unknown date"}:\n${fresh.join("\n")}`;
    notes.push("Login details moved to Login and Passwords and added to the project's System Credentials.");
  }

  return { patch, projectCredentials, notes };
}
