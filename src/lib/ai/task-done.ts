import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { aiConfigured, claude, describeError } from "./claude";
import { REVIEW_MODEL } from "./review-apply";
import { MIN_CONFIDENCE, parseTaskDone, TASK_DONE_AUTOMATION_ID, TASK_DONE_SYSTEM, taskDonePrompt, type ReportForCheck } from "./task-done-engine";

// J-z (Jessica via Fred 2026-10-26, "avaliar a possibilidade de a IA comparar tarefas pendentes com Reports
// posteriores"): each day, for every project with a new Job Report, Claude reads the open tasks created before
// that report and says whether the report explicitly confirms the pending item was done. A confident yes
// becomes a suggestion on the task ("Looks done", with the report and the sentence); the office completes or
// keeps it. Doubt or a partial confirmation = nothing. The task is never completed by the AI itself.

type TaskRow = { id: number; details: string | null; project_id: number; created_at: string; job_report_id: number | null };
type ReportRow = { id: number; date: string | null; result: string | null; report: string | null; pending_1: string | null; pending_2: string | null; pending_3: string | null; pending_4: string | null; pending_5: string | null; created_at: string; job_reports_who_can: { target_id: number }[] | null };

/** Reports of the last `days` days, grouped by project; then every open task of those projects older than a report. */
export async function suggestDoneTasks(db: SupabaseClient, days = 2, limit = 30): Promise<{ checked: number; suggested: number[]; errors: number }> {
  if (!aiConfigured()) return { checked: 0, suggested: [], errors: 0 };
  const since = new Date(Date.now() - days * 86_400_000).toISOString();
  const { data: recent } = await db.from("job_reports").select("project_id").gte("created_at", since).is("deleted_at", null).not("project_id", "is", null);
  const projectIds = [...new Set(((recent ?? []) as { project_id: number }[]).map((r) => r.project_id))];
  if (!projectIds.length) return { checked: 0, suggested: [], errors: 0 };
  const { data: tasks } = await db
    .from("tasks")
    .select("id, details, project_id, created_at, job_report_id")
    .in("project_id", projectIds)
    .neq("status", "Completed")
    .is("deleted_at", null)
    .is("archived_at", null)
    .is("ai_done_at", null)
    .is("ai_done_dismissed_at", null)
    .order("created_at")
    .limit(limit);
  const out = { checked: 0, suggested: [] as number[], errors: 0 };
  for (const task of (tasks ?? []) as TaskRow[]) {
    if (!task.details) continue;
    const { data: reps } = await db
      .from("job_reports")
      .select("id, date, result, report, pending_1, pending_2, pending_3, pending_4, pending_5, created_at, job_reports_who_can(target_id)")
      .eq("project_id", task.project_id)
      .gt("created_at", task.created_at)
      .is("deleted_at", null)
      .order("created_at")
      .limit(6);
    const reports = ((reps ?? []) as unknown as ReportRow[]).filter((r) => r.id !== task.job_report_id);
    if (!reports.length) continue;
    const { data: items } = await db.from("record_checklist_items").select("item").eq("table_name", "tasks").eq("record_id", task.id).is("completed_at", null);
    const checklist = ((items ?? []) as { item: string }[]).map((i) => i.item);
    const techIds = [...new Set(reports.flatMap((r) => (r.job_reports_who_can ?? []).map((w) => w.target_id)))];
    const { data: techs } = techIds.length ? await db.from("employee_names").select("id, title").in("id", techIds) : { data: [] };
    const techName = new Map(((techs ?? []) as { id: number; title: string | null }[]).map((e) => [e.id, e.title ?? `#${e.id}`]));
    const forCheck: ReportForCheck[] = reports.map((r) => ({ id: r.id, date: r.date, technician: (r.job_reports_who_can ?? []).map((w) => techName.get(w.target_id)).filter(Boolean).join(", ") || null, result: r.result, text: [r.report, r.pending_1, r.pending_2, r.pending_3, r.pending_4, r.pending_5].filter(Boolean).join("\n") }));
    out.checked++;
    try {
      const res = await claude().messages.create({ model: REVIEW_MODEL, max_tokens: 400, system: TASK_DONE_SYSTEM, messages: [{ role: "user", content: taskDonePrompt({ id: task.id, details: task.details, checklist, createdAt: task.created_at }, forCheck) }] });
      const a = parseTaskDone(res.content.find((b) => b.type === "text")?.text ?? "");
      if (!a) throw new Error("The AI answer could not be read");
      const reportId = a.report_id && reports.some((r) => r.id === a.report_id) ? a.report_id : reports[reports.length - 1].id;
      const yes = a.done && a.confidence >= MIN_CONFIDENCE && a.quote;
      if (yes) {
        await db.from("tasks").update({ ai_done_report_id: reportId, ai_done_quote: a.quote, ai_done_at: new Date().toISOString() }).eq("id", task.id);
        out.suggested.push(task.id);
      }
      await db.from("automation_runs").insert({ automation_id: TASK_DONE_AUTOMATION_ID, table_name: "tasks", record_id: task.id, event: "ai_task_done", status: "done", detail: { done: a.done, confidence: a.confidence, report_id: reportId, why: a.why, suggested: Boolean(yes) } });
    } catch (e) {
      out.errors++;
      await db.from("automation_runs").insert({ automation_id: TASK_DONE_AUTOMATION_ID, table_name: "tasks", record_id: task.id, event: "ai_task_done", status: "error", detail: { reason: describeError(e) } });
    }
  }
  return out;
}
