import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { decrypt, encrypt } from "@/lib/crypto";
import { runAutomationsForRecord } from "@/lib/engine/automations";
import { adminDb, hasAdminKey } from "@/lib/supabase/admin";
import { aiConfigured, claude, describeError } from "./claude";
import { applyReview, parseAnswer, REVIEW_MODEL, SYSTEM_PROMPT, userPrompt, type ReviewInput } from "./review-apply";
import { AI_REVIEW_AUTOMATION_ID, loadAiSettings } from "./review-queue";

// F17 AI review of Job Reports (SPEC §9.1 F17): runs the queue. Called right after a save
// (next/server after(), so the technician never waits) and by the hourly tick as a backup.
// Writes go through the service role: the technician who wrote the report may not edit the
// project, but the review may. Every run is logged in automation_runs under automation 900501.

type Row = {
  id: number;
  project_id: number | null;
  date: string | null;
  report: string | null;
  result: string | null;
  partial_reason: string | null;
  missing_items: string | null;
  logins_and_passwords: string | null;
  created_by: string | null;
  ai_review_status: string | null;
};
const COLS = "id, project_id, date, report, result, partial_reason, missing_items, logins_and_passwords, created_by, ai_review_status";

export type ReviewSummary = { reviewed: number; skipped: number; errors: number };

async function log(db: SupabaseClient, id: number, status: "done" | "error", detail: Record<string, unknown>) {
  await db.from("automation_runs").insert({ automation_id: AI_REVIEW_AUTOMATION_ID, table_name: "job_reports", record_id: id, event: "ai_review", status, detail });
}

async function finish(db: SupabaseClient, id: number, status: "done" | "skipped" | "error", patch: Record<string, unknown> = {}) {
  const { error } = await db.from("job_reports").update({ ...patch, ai_review_status: status }).eq("id", id);
  if (error) throw new Error(`AI review write: ${error.message}`);
}

/** Review one claimed report: ask Claude, write the patch, append to the project, run the follow-up automations. */
export async function reviewReport(db: SupabaseClient, id: number): Promise<"done" | "skipped" | "error"> {
  const { data } = await db.from("job_reports").select(COLS).eq("id", id).maybeSingle();
  const row = data as Row | null;
  if (!row) return "skipped";
  const skip = async (why: string) => {
    await finish(db, id, "skipped");
    await log(db, id, "done", { actions: [`skipped: ${why}`] });
    return "skipped" as const;
  };
  if (!(await loadAiSettings(db)).review_reports) return skip("AI review is switched off (Admin › AI)");
  if (!aiConfigured()) return skip("ANTHROPIC_API_KEY is not set");
  const report = row.report?.trim() ?? "";
  if (!report) return skip("empty report");

  const input: ReviewInput = {
    report,
    result: row.result,
    partial_reason: row.partial_reason,
    missing_items: row.missing_items,
    logins: row.logins_and_passwords ? decrypt(row.logins_and_passwords) : null,
    date: row.date,
  };
  const started = Date.now();
  try {
    const res = await claude().messages.create({
      model: REVIEW_MODEL,
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userPrompt(input) }],
    });
    const text = res.content.find((b) => b.type === "text")?.text ?? "";
    const answer = parseAnswer(text);
    if (!answer) {
      await finish(db, id, "error");
      await log(db, id, "error", { error: "The answer was not the expected JSON", model: res.model, ms: Date.now() - started });
      return "error";
    }
    const out = applyReview(input, answer);
    const patch: Record<string, unknown> = { ...out.patch };
    if (typeof patch.logins_and_passwords === "string") patch.logins_and_passwords = encrypt(patch.logins_and_passwords);
    const now = new Date().toISOString();
    await finish(db, id, "done", { ...patch, ai_reviewed_at: now, ai_review_notes: out.notes.length ? out.notes.join("\n") : "Nothing to change." });

    // The project's System Credentials get the same login details, dated (F17-b).
    let projectNote: string | null = null;
    if (out.projectCredentials && row.project_id) {
      const { data: p } = await db.from("projects").select("system_credentials").eq("id", row.project_id).maybeSingle();
      const current = (p as { system_credentials: string | null } | null)?.system_credentials;
      const text = [current ? decrypt(current).trim() : "", out.projectCredentials].filter(Boolean).join("\n\n");
      const { error } = await db.from("projects").update({ system_credentials: encrypt(text) }).eq("id", row.project_id);
      projectNote = error ? `project credentials not updated: ${error.message}` : `project #${row.project_id} credentials updated`;
    }
    // What the review changed sets off the usual follow-ups: missing items → project checklist, Partial → return card (F2).
    const changed = Object.keys(out.patch);
    const did = changed.length ? await runAutomationsForRecord(db, "job_reports", id, changed, row.created_by) : [];
    await log(db, id, "done", {
      actions: [...(out.notes.length ? out.notes : ["Nothing to change."]), ...(projectNote ? [projectNote] : []), ...did],
      changed,
      model: res.model,
      ms: Date.now() - started,
      tokens: { in: res.usage.input_tokens, out: res.usage.output_tokens },
    });
    return "done";
  } catch (e) {
    await finish(db, id, "error");
    await log(db, id, "error", { error: describeError(e), ms: Date.now() - started });
    return "error";
  }
}

/**
 * Work through the queue for up to `budgetMs`. Each report is claimed first (pending → running), so
 * the after-save run and the hourly tick never review the same report twice. A run that died
 * (still "running" after 15 minutes) is picked up again.
 */
export async function reviewQueuedReports(budgetMs = 50_000): Promise<ReviewSummary> {
  const out: ReviewSummary = { reviewed: 0, skipped: 0, errors: 0 };
  if (!hasAdminKey()) return out;
  const db = adminDb();
  const started = Date.now();
  while (Date.now() - started < budgetMs) {
    const stale = new Date(Date.now() - 15 * 60_000).toISOString();
    const { data } = await db
      .from("job_reports")
      .select("id, ai_review_status")
      .or(`ai_review_status.eq.pending,and(ai_review_status.eq.running,updated_at.lt.${stale})`)
      .is("deleted_at", null)
      .order("id")
      .limit(1);
    const next = ((data ?? []) as { id: number; ai_review_status: string }[])[0];
    if (!next) break;
    const { data: claimed } = await db.from("job_reports").update({ ai_review_status: "running" }).eq("id", next.id).eq("ai_review_status", next.ai_review_status).select("id");
    if (!claimed?.length) continue; // someone else took it
    const r = await reviewReport(db, next.id);
    if (r === "done") out.reviewed++;
    else if (r === "skipped") out.skipped++;
    else out.errors++;
  }
  return out;
}

/** For after(): never lets the review break a save. */
export async function reviewQueuedSafely() {
  try {
    await reviewQueuedReports();
  } catch (e) {
    console.error("AI review:", e);
  }
}
