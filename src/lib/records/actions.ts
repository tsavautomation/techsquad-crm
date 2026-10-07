"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { reviewQueuedSafely } from "@/lib/ai/review";
import { fromDateTimeLocalET } from "@/lib/dates";
import { addDays } from "@/lib/schedule/dates";
import { adminDb } from "@/lib/supabase/admin";
import { runAutomationsNow, sendQueuedSafely } from "@/lib/engine/automations";
import { wantsPdf } from "@/lib/files/pdf-name";
import { dumpRecordPdfSafely } from "@/lib/files/record-pdf";
import type { Values } from "@/lib/rules/evaluate";
import { getTable } from "@/registry";
import { tableHref } from "@/registry/routes";
import { lastChangeId } from "./record-actions";
import { saveRecord, type SaveResult } from "./save";

/**
 * Called by RecordForm. Validation errors come back to the form; success returns the record id and,
 * for an edit, the history entry it wrote (`undoId`) so the Saved toast can offer Undo (F7).
 * Automations run before the reply (statuses are current); their emails go after it.
 */
export async function saveRecordAction(tableName: string, id: number | null, values: Values): Promise<SaveResult & { undoId?: number | null }> {
  const result = await saveRecord(tableName, id, values);
  const t = getTable(tableName);
  if (result.ok) {
    await runAutomationsNow();
    after(sendQueuedSafely);
    // SPEC §9.1 OD-c/OD-d: the PDF copy in OneDrive is written right after every form save.
    if (wantsPdf(t)) after(() => dumpRecordPdfSafely(tableName, result.id));
    // F24-a: a report saved without its visit is tied to the day's visit on that project, so the home
    // screen, the PDF and the briefing all know the report was sent.
    if (tableName === "job_reports" && !values.visit_id) await linkReportToVisit(result.id, values);
    // F17: a new Job Report is read by Claude after the reply (the hourly tick catches any left over).
    if (tableName === "job_reports") after(reviewQueuedSafely);
  }
  if (result.ok && (t.tab || t.module === "utility")) revalidatePath(tableHref(t), "layout");
  if (result.ok && id) return { ...result, undoId: await lastChangeId(tableName, id) };
  return result;
}

/**
 * F24-a (Fred 2026-10-07): the visit a report belongs to, when the form left it blank — the one visit
 * on the same project and Eastern day with one of the report's Team on it. Two or none: left alone.
 */
async function linkReportToVisit(reportId: number, values: Values) {
  const projectId = typeof values.project_id === "number" ? values.project_id : null;
  const date = typeof values.date === "string" ? values.date.slice(0, 10) : null;
  const team = Array.isArray(values.team_ids) ? (values.team_ids as number[]) : [];
  if (!projectId || !date) return;
  const db = adminDb();
  const { data } = await db
    .from("visits")
    .select("id, technician_id, visits_team(target_id)")
    .eq("project_id", projectId)
    .gte("starts_at", fromDateTimeLocalET(`${date}T00:00`))
    .lt("starts_at", fromDateTimeLocalET(`${addDays(date, 1)}T00:00`))
    .neq("status", "Cancelled")
    .is("deleted_at", null);
  const visits = ((data ?? []) as { id: number; technician_id: number | null; visits_team: { target_id: number }[] }[]).filter((v) => !team.length || [v.technician_id, ...v.visits_team.map((x) => x.target_id)].some((id) => id !== null && team.includes(id)));
  if (visits.length !== 1) return;
  await db.from("job_reports").update({ visit_id: visits[0].id }).eq("id", reportId).is("visit_id", null);
}
