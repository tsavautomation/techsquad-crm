import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { decrypt, encrypt } from "@/lib/crypto";
import { fromDateTimeLocalET } from "@/lib/dates";
import { runAutomationsForRecord } from "@/lib/engine/automations";
import { returnDueDate } from "@/lib/field-day/day";
import { loadFieldDay } from "@/lib/field-day/return-card";
import { buildTitle } from "@/lib/records/title";
import { realityCheckForReport } from "@/lib/reports/reality-run";
import { adminDb, hasAdminKey } from "@/lib/supabase/admin";
import { getTable } from "@/registry";
import { recordHref } from "@/registry/routes";
import { aiConfigured, claude, describeError } from "./claude";
import { applyReview, parseAnswer, proposedStart, REVIEW_MODEL, SYSTEM_PROMPT, userPrompt, type ReviewInput } from "./review-apply";
import { AI_REVIEW_AUTOMATION_ID, loadAiSettings } from "./review-queue";
import { updateSiteSummary } from "./site-history";

// F17 AI review of Job Reports (SPEC §9.1 F17) + F19 report intelligence: runs the queue. Called right
// after a save (next/server after(), so the technician never waits) and by the hourly tick as a backup.
// Writes go through the service role: the technician who wrote the report may not edit the project,
// but the review may. Every run is logged in automation_runs under automation 900501.

type Row = {
  id: number;
  project_id: number | null;
  visit_id: number | null;
  vehicle_id: number | null;
  date: string | null;
  report: string | null;
  problems: string | null;
  materials_used: string | null;
  result: string | null;
  partial_reason: string | null;
  missing_items: string | null;
  logins_and_passwords: string | null;
  created_by: string | null;
  ai_review_status: string | null;
  team: { target_id: number }[];
};
const COLS = "id, project_id, visit_id, vehicle_id, date, report, problems, materials_used, result, partial_reason, missing_items, logins_and_passwords, created_by, ai_review_status, team:job_reports_team(target_id)";

export type ReviewSummary = { reviewed: number; skipped: number; errors: number };

async function log(db: SupabaseClient, id: number, status: "done" | "error", detail: Record<string, unknown>) {
  await db.from("automation_runs").insert({ automation_id: AI_REVIEW_AUTOMATION_ID, table_name: "job_reports", record_id: id, event: "ai_review", status, detail });
}

async function finish(db: SupabaseClient, id: number, status: "done" | "skipped" | "error", patch: Record<string, unknown> = {}) {
  const { error } = await db.from("job_reports").update({ ...patch, ai_review_status: status }).eq("id", id);
  if (error) throw new Error(`AI review write: ${error.message}`);
}

/** Issue keys already used on this project (so Claude reuses them for the same problem). */
async function knownIssueKeys(db: SupabaseClient, projectId: number | null): Promise<string[]> {
  if (!projectId) return [];
  const { data } = await db.from("job_reports").select("issue_keys").eq("project_id", projectId).is("deleted_at", null).not("issue_keys", "eq", "{}").order("id", { ascending: false }).limit(50);
  return [...new Set(((data ?? []) as { issue_keys: string[] }[]).flatMap((r) => r.issue_keys))].slice(0, 40);
}

/** F19-a: one proposed return visit per report, for the PM to approve or discard on the calendar. */
async function proposeReturnVisit(db: SupabaseClient, row: Row, why: string, days: number | null, parts: string[]): Promise<string | null> {
  if (!row.project_id || !row.date) return null;
  const { data: existing } = await db.from("visits").select("id").eq("proposed_from_report_id", row.id).is("deleted_at", null).limit(1);
  if (existing?.length) return null;
  const settings = await loadFieldDay(db);
  const when = days ?? (row.partial_reason ? Number(returnDueDate(row.partial_reason, row.date, settings).slice(8, 10)) - Number(row.date.slice(8, 10)) : null);
  const startsAt = fromDateTimeLocalET(proposedStart(row.date, when && when > 0 ? when : null));
  const { data: task } = await db.from("tasks").select("id").eq("job_report_id", row.id).is("deleted_at", null).limit(1);
  const lines = [`Proposed by the AI review of Job Report #${row.id} (${row.date}): ${why}`, parts.length ? `Parts to order: ${parts.join(", ")}` : null].filter(Boolean);
  const vt = getTable("visits");
  const values: Record<string, unknown> = {
    project_id: row.project_id,
    starts_at: startsAt,
    duration: "120",
    arrival_window: "60",
    technician_id: row.team[0]?.target_id ?? null,
    vehicle_id: row.vehicle_id,
    service_type: null,
    status: "Proposed",
    instructions: lines.join("\n"),
    proposed_from_report_id: row.id,
    return_task_id: (task?.[0] as { id: number } | undefined)?.id ?? null,
  };
  values.title = await buildTitle(vt, values, null, db);
  const { data: v, error } = await db.from("visits").insert(values).select("id").single();
  if (error) throw new Error(`proposed visit: ${error.message}`);
  const id = (v as { id: number }).id;
  const others = row.team.slice(1).map((t) => ({ record_id: id, target_id: t.target_id }));
  if (others.length) await db.from("visits_team").insert(others);
  return `proposed return visit #${id} (${startsAt.slice(0, 10)})`;
}

/** F19-c: the 3rd report with the same issue key on a project raises one Root Cause task for the scheduler. */
async function rootCauseCheck(db: SupabaseClient, row: Row, keys: string[]): Promise<string[]> {
  if (!row.project_id || !keys.length) return [];
  const did: string[] = [];
  const settings = await loadFieldDay(db);
  const site = (process.env.NEXT_PUBLIC_SITE_URL ?? "").replace(/\/$/, "");
  for (const key of keys) {
    const { data } = await db.from("job_reports").select("id, date").eq("project_id", row.project_id).contains("issue_keys", [key]).is("deleted_at", null).order("date").order("id");
    const reports = (data ?? []) as { id: number; date: string | null }[];
    if (reports.length < 3) continue;
    const marker = `[root-cause:${key}]`;
    const { data: have } = await db.from("tasks").select("id").eq("project_id", row.project_id).like("details", `%${marker}%`).is("deleted_at", null).limit(1);
    if (have?.length) continue;
    const links = reports.map((r) => `${r.date ?? "?"} ${site}${recordHref(getTable("job_reports"), r.id)}`).join("\n");
    const values: Record<string, unknown> = {
      member_id: settings.scheduler_employee_id,
      status: "Pending",
      priority: "Urgent",
      due_date: row.date,
      details: `Root cause needed: "${key}" was reported ${reports.length} times on this site.\n${links}\n${marker}`,
      project_id: row.project_id,
      job_report_id: row.id,
      labels: ["Technical", "Root cause"],
    };
    values.title = await buildTitle(getTable("tasks"), values, null, db);
    const { data: t, error } = await db.from("tasks").insert(values).select("id").single();
    if (error) throw new Error(`root cause task: ${error.message}`);
    did.push(`root cause task #${(t as { id: number }).id} for "${key}" (${reports.length} reports)`);
  }
  return did;
}

/** Review one claimed report: ask Claude, write the patch, append to the project, run the follow-up automations. */
export async function reviewReport(db: SupabaseClient, id: number): Promise<"done" | "skipped" | "error"> {
  const { data } = await db.from("job_reports").select(COLS).eq("id", id).maybeSingle();
  const row = data as unknown as Row | null;
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
    problems: row.problems,
    materials: row.materials_used,
  };
  const started = Date.now();
  try {
    const res = await claude().messages.create({
      model: REVIEW_MODEL,
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userPrompt(input, await knownIssueKeys(db, row.project_id)) }],
    });
    const text = res.content.find((b) => b.type === "text")?.text ?? "";
    const answer = parseAnswer(text);
    if (!answer) {
      await finish(db, id, "error");
      await log(db, id, "error", { error: "The answer was not the expected JSON", model: res.model, ms: Date.now() - started });
      return "error";
    }
    const out = applyReview(input, answer);
    const patch: Record<string, unknown> = { ...out.patch, issue_keys: out.issueKeys };
    if (typeof patch.logins_and_passwords === "string") patch.logins_and_passwords = encrypt(patch.logins_and_passwords);
    const now = new Date().toISOString();
    const extra: string[] = [];
    if (out.parts.length) extra.push(`Parts to order (suggestion): ${out.parts.join(", ")}.`);
    await finish(db, id, "done", { ...patch, ai_reviewed_at: now, ai_review_notes: [...out.notes, ...extra].join("\n") || "Nothing to change." });

    // The project's System Credentials get the same login details, dated (F17-b).
    const followUps: string[] = [];
    if (out.projectCredentials && row.project_id) {
      const { data: p } = await db.from("projects").select("system_credentials").eq("id", row.project_id).maybeSingle();
      const current = (p as { system_credentials: string | null } | null)?.system_credentials;
      const merged = [current ? decrypt(current).trim() : "", out.projectCredentials].filter(Boolean).join("\n\n");
      const { error } = await db.from("projects").update({ system_credentials: encrypt(merged) }).eq("id", row.project_id);
      followUps.push(error ? `project credentials not updated: ${error.message}` : `project #${row.project_id} credentials updated`);
    }
    // What the review changed sets off the usual follow-ups: missing items → project checklist, Partial → return card (F2).
    const changed = Object.keys(out.patch);
    if (changed.length) followUps.push(...(await runAutomationsForRecord(db, "job_reports", id, changed, row.created_by)));
    // F19: return visit, root cause, site history, reality check — each on its own, never breaking the review.
    const safely = async (what: string, fn: () => Promise<string[] | string | null>) => {
      try {
        const r = await fn();
        if (Array.isArray(r)) followUps.push(...r);
        else if (r) followUps.push(r);
      } catch (e) {
        followUps.push(`${what} failed: ${e instanceof Error ? e.message : String(e)}`);
      }
    };
    if (out.returnVisit) await safely("return visit", () => proposeReturnVisit(db, row, out.returnVisit!.why, out.returnVisit!.days, out.parts));
    await safely("root cause", () => rootCauseCheck(db, row, out.issueKeys));
    if (out.siteFacts.length && row.project_id) {
      await safely("site history", async () => {
        const r = await updateSiteSummary(db, row.project_id!, [{ date: row.date, text: out.siteFacts.join("\n") }]);
        return r.ok ? `site history updated (${out.siteFacts.length} facts)` : `site history not updated: ${r.message}`;
      });
    }
    await safely("reality check", () => realityCheckForReport(db, id));
    await log(db, id, "done", {
      actions: [...(out.notes.length ? out.notes : ["Nothing to change."]), ...extra, ...followUps],
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
