"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { reviewQueuedSafely } from "@/lib/ai/review";
import { runAutomationsNow, sendQueuedSafely } from "@/lib/engine/automations";
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
    // F17: a new Job Report is read by Claude after the reply (the hourly tick catches any left over).
    if (tableName === "job_reports") after(reviewQueuedSafely);
  }
  if (result.ok && (t.tab || t.module === "utility")) revalidatePath(tableHref(t), "layout");
  if (result.ok && id) return { ...result, undoId: await lastChangeId(tableName, id) };
  return result;
}
