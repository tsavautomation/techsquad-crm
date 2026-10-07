import { z } from "zod";
import { formatDate } from "@/lib/dates";
import { isNotFinished, missingLines } from "@/lib/field-day/day";
import { REASONS } from "@/registry/tables/job_reports";

// F17 AI review of Job Reports (SPEC §9.1 F17-a/b) + F19 report intelligence (return visit, parts,
// site facts, issue keys): the pure part. Claude answers with JSON; this file turns that answer into
// the patch the review writes. No database, no network: tested in tests/f17-ai-review.test.ts.

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
  /** F19: "Problems found" and "Materials used", read for issue keys and site facts; F17-e fills Problems found when blank. */
  problems?: string | null;
  materials?: string | null;
  /** F17-e: the one-line Outcome, filled when blank. */
  outcome?: string | null;
};

export const AnswerSchema = z.object({
  report: z.string().default(""),
  grammar_changed: z.boolean().default(false),
  pending: z.array(z.string()).default([]),
  reason: z.string().nullable().default(null),
  credentials: z.array(z.string()).default([]),
  // F19-a: does the text say someone has to come back? (EN / PT / ES)
  return_visit: z.object({ needed: z.boolean().default(false), why: z.string().nullable().default(null), days: z.number().int().min(0).max(60).nullable().default(null) }).nullable().default(null),
  // F19-a: parts or materials the text says are missing or must be ordered.
  parts: z.array(z.string()).default([]),
  // F19-d: durable facts about the site (equipment and models, IPs, quirks, access), never credentials.
  site_facts: z.array(z.string()).default([]),
  // F19-c: short keys for the problems found, so repeats on the same site can be counted.
  issue_keys: z.array(z.string()).default([]),
  // F17-e: the problems as the technician described them, how the visit ended, and whether the work is finished.
  problems: z.array(z.string()).default([]),
  outcome: z.string().nullable().default(null),
  finished: z.boolean().default(false),
});
export type ReviewAnswer = z.infer<typeof AnswerSchema>;

/** The marker left in the text where login details were (F17-b). */
export const MOVED_MARKER = "(login details moved to the Logins field)";

export const SYSTEM_PROMPT = `You review field-service job reports for Tech Squad, an audio / video, network and home-automation installer in South Florida. The technicians are mostly Brazilian and write in Portuguese, English or Spanish, often by dictation on a phone, so the text may have transcription slips, missing punctuation and run-on sentences.

You receive one report and answer with JSON only (no prose, no code fence) of this shape:
{"report": string, "grammar_changed": boolean, "pending": string[], "reason": string | null, "credentials": string[], "return_visit": {"needed": boolean, "why": string | null, "days": number | null} | null, "parts": string[], "site_facts": string[], "issue_keys": string[], "problems": string[], "outcome": string | null, "finished": boolean}

1. "report": the same text with grammar, spelling, punctuation and clarity corrected. Keep the language it was written in (Portuguese stays Portuguese, English stays English, Spanish stays Spanish, a mixed text keeps its main language; never translate). Keep the meaning, the facts, the order, the line breaks, the brand names, model numbers, room names and quantities. Do not add, summarise, soften or embellish anything. If the text is already clean, return it unchanged and set "grammar_changed" to false.
2. "pending": work the text says is still to be done, missing, waiting on someone or something, or needing a return visit. One short item per entry, in the language of the report, only what the text actually states. Leave out anything already listed under "already_missing". Empty when the job is finished.
3. "reason": when "pending" is not empty, the single best fit from "reasons"; otherwise null.
4. "credentials": every login detail in the text — user names, passwords, PINs, Wi-Fi network names with their passwords, IP addresses with a login, account emails with a password — one line each, like "Router admin: admin / 1234" or "Wi-Fi Casa5G: senha123". In "report", replace each sentence or fragment that carried them with the marker "${MOVED_MARKER}" (in Portuguese: "(dados de acesso movidos para o campo Logins)", in Spanish: "(datos de acceso movidos al campo Logins)"), so no password stays in the text. Gate codes and where to park are not credentials: leave them in the text.
5. "return_visit": whether the text says someone must come back ("need to come back", "precisa voltar", "hay que volver", "waiting on the GC", "aguardando o cliente", "missing part", "falta peça"…). "why" is a short reason in English; "days" is how soon the text suggests (null when it doesn't say). null when nothing says so.
6. "parts": parts, materials or equipment the text says are missing, to be ordered or to be brought next time, one per entry, as written. Empty when none.
7. "site_facts": durable facts about this site a future technician should know, in English, one short sentence each: equipment and models and where they are, network details without passwords (IP ranges, router model, VLANs), quirks ("the Sonos in the den drops when the microwave runs"), access and parking that is not a code. Never a password, PIN, login or gate code. Empty when the text has nothing durable.
8. "issue_keys": for each distinct problem found in the text, one short lowercase key with hyphens naming the thing and the failure, e.g. "wifi-dropouts", "crestron-processor-reboot", "sonos-den-offline", "camera-3-no-video". Reuse a key from "known_issue_keys" when it is the same problem. Empty when the text reports no problem.
9. "problems": the problems found, one short entry each, in the language of the report and in the technician's own words, e.g. ["O cliente estava sem volume nas TVs", "o Crestron tinha perdido a autenticação com o Sonos"]. Only what the text states. Empty when the text reports no problem.
10. "outcome": one short sentence, in the language of the report, saying how the visit ended, taken from the text, e.g. "Tudo ficou funcionando bem." or "Waiting on the GC for the conduit." null when the text does not say.
11. "finished": true only when the text clearly says the work was completed and nothing is pending; false when something is pending, someone must come back, or the text does not say.`;

/** The user turn: the report and what the form already holds. */
export function userPrompt(input: ReviewInput, knownIssueKeys: string[] = []): string {
  return JSON.stringify(
    {
      report: input.report,
      problems_found: input.problems ?? null,
      materials_used: input.materials ?? null,
      outcome: input.outcome ?? null,
      result: input.result,
      already_missing: missingLines(input.missing_items),
      reasons: REASONS,
      known_issue_keys: knownIssueKeys,
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
  /** F19-a: a return visit to propose, or null. */
  returnVisit: { why: string; days: number | null } | null;
  /** F19-a: parts to order (a suggestion only, Fred 2026-10-05). */
  parts: string[];
  /** F19-d: facts for the site history. */
  siteFacts: string[];
  /** F19-c: issue keys for the repeat check. */
  issueKeys: string[];
};

const squash = (s: string) => s.replace(/\s+/g, " ").trim();
const cleanLines = (list: string[]) => [...new Set(list.map((x) => x.replace(/^\s*(?:[-*•·]|\d+[.)])\s*/, "").trim()).filter(Boolean))];
const SECRET = /senha|password|passwd|\bpin\b|login|usu[aá]rio|user ?name|contrase|c[oó]digo do port|gate code|\bcode\b/i;

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
  } else if (!input.result && answer.finished && !answer.return_visit?.needed) {
    // F17-e: a blank Result becomes Completed when the text says the work is done (Fred 2026-10-06).
    patch.result = "Completed";
    notes.push("Result set to Completed.");
  }

  // 2b. F17-e: Problems found and Outcome, filled from the text when the technician left them blank.
  const problems = cleanLines(answer.problems);
  if (!input.problems?.trim() && problems.length) {
    patch.problems = problems.map(squash).join(" / ").slice(0, 4000);
    notes.push("Problems found filled from the text.");
  }
  const outcome = answer.outcome ? squash(answer.outcome).slice(0, 200) : "";
  if (!input.outcome?.trim() && outcome) {
    patch.outcome = outcome;
    notes.push("Outcome filled from the text.");
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

  // 4. F19: return visit, parts, site facts, issue keys. A Completed report never gets a return visit.
  const returnVisit = answer.return_visit?.needed && input.result !== "Completed" ? { why: answer.return_visit.why?.trim() || "The report says someone has to come back.", days: answer.return_visit.days } : null;
  const parts = cleanLines(answer.parts);
  const siteFacts = cleanLines(answer.site_facts).filter((f) => !SECRET.test(f));
  const issueKeys = [...new Set(answer.issue_keys.map((k) => k.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")).filter((k) => k.length >= 3 && k.length <= 60))];

  return { patch, projectCredentials, notes, returnVisit, parts, siteFacts, issueKeys };
}

// ---------------------------------------------------------------- F19-a proposed return visit

/** The start of a proposed return visit: `days` after the report date (3 when unsaid), moved off a weekend, 9:00 AM Eastern local. */
export function proposedStart(reportDate: string, days: number | null): string {
  const [y, m, d] = reportDate.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + Math.max(1, days ?? 3)));
  while (dt.getUTCDay() === 0 || dt.getUTCDay() === 6) dt.setUTCDate(dt.getUTCDate() + 1);
  return `${dt.toISOString().slice(0, 10)}T09:00`;
}

// ---------------------------------------------------------------- F19-d site history

export const SUMMARY_MODEL = "claude-sonnet-5-5";

export const SUMMARY_SYSTEM = `You keep the "site history" of one customer site for Tech Squad, an audio / video, network and home-automation installer. It is a short, factual note the next technician reads before going: what is installed and where (brands, models, rack location), network facts without any password (router model, IP ranges, VLANs, ISP), known quirks and recurring problems, access and parking (never gate codes), and what was left pending at the last visits. Write in English, plain sentences grouped under short headings (Equipment, Network, Quirks, Access, Pending), at most 1500 characters. Keep every fact that is still true, drop what the new reports contradict, never invent, and never include a password, PIN, login, gate code or anything that looks like one. Answer with the note only, no preamble.`;

/** The user turn for a summary rewrite: the previous note plus new facts (or whole reports) with their dates. */
export function summaryPrompt(previous: string | null, items: { date: string | null; text: string }[]): string {
  return JSON.stringify({ previous_note: previous ?? "", new_information: items.map((i) => ({ date: i.date ? formatDate(i.date) : null, text: i.text })) }, null, 2);
}

/** Anything that looks like a credential is cut from a summary before it is stored. */
export function scrubSummary(text: string): string {
  return text
    .split(/\r?\n/)
    .filter((line) => !SECRET.test(line))
    .join("\n")
    .trim()
    .slice(0, 2000);
}
