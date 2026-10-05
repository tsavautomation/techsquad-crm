import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

// F17-d Open pending items: return cards (tasks made from a Partial / Not done Job Report, F2-c)
// that are not Completed yet, per project. Read with the viewer's client, so RLS applies: someone
// who can't see tasks simply sees no warning.

export type PendingItem = {
  taskId: number;
  title: string;
  status: string;
  due: string | null;
  priority: string | null;
  reportId: number | null;
  reportDate: string | null;
  /** The return card's open checklist lines (the report's "What's missing"). */
  items: string[];
};

type TaskRow = { id: number; title: string | null; status: string | null; due_date: string | null; priority: string | null; project_id: number; job_report_id: number | null; job_reports: { date: string | null } | null };

/** Open pending items for each of `projectIds` (projects with none are absent from the map). */
export async function openPendingByProject(db: SupabaseClient, projectIds: number[]): Promise<Map<number, PendingItem[]>> {
  const out = new Map<number, PendingItem[]>();
  const ids = [...new Set(projectIds.filter((x) => Number.isInteger(x)))];
  if (!ids.length) return out;
  const { data } = await db
    .from("tasks")
    .select("id, title, status, due_date, priority, project_id, job_report_id, job_reports(date)")
    .in("project_id", ids)
    .not("job_report_id", "is", null)
    .neq("status", "Completed")
    .is("deleted_at", null)
    .is("archived_at", null)
    .order("due_date", { ascending: true, nullsFirst: false })
    .order("id");
  const rows = (data ?? []) as unknown as TaskRow[];
  if (!rows.length) return out;
  const { data: check } = await db
    .from("record_checklist_items")
    .select("record_id, item")
    .eq("table_name", "tasks")
    .in("record_id", rows.map((r) => r.id))
    .is("completed_at", null)
    .order("id");
  const linesOf = new Map<number, string[]>();
  for (const c of (check ?? []) as { record_id: number; item: string }[]) linesOf.set(c.record_id, [...(linesOf.get(c.record_id) ?? []), c.item]);
  for (const r of rows) {
    const list = out.get(r.project_id) ?? [];
    list.push({
      taskId: r.id,
      title: r.title ?? `Task #${r.id}`,
      status: r.status ?? "Pending",
      due: r.due_date,
      priority: r.priority,
      reportId: r.job_report_id,
      reportDate: r.job_reports?.date ?? null,
      items: linesOf.get(r.id) ?? [],
    });
    out.set(r.project_id, list);
  }
  return out;
}

/** One project's open pending items. */
export async function openPendingFor(db: SupabaseClient, projectId: number): Promise<PendingItem[]> {
  return (await openPendingByProject(db, [projectId])).get(projectId) ?? [];
}
