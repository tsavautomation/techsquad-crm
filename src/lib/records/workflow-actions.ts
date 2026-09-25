"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { requireUser } from "@/lib/auth/session";
import { runAutomationsSafely } from "@/lib/engine/automations";
import { getTable } from "@/registry";
import { recordHref, tableHref } from "@/registry/routes";
import { recordsDb } from "./data";
import type { ActionResult } from "./record-actions";

/**
 * Take a workflow outcome (SPEC §6). All checks — may this user act at this stage,
 * is the option valid here — happen inside the database function workflow_move.
 */
export async function moveWorkflowAction(table: string, id: number, outcomeId: number, targetLevelId: number | null, comment: string): Promise<ActionResult> {
  await requireUser();
  const t = getTable(table);
  const db = await recordsDb();
  const { error } = await db.rpc("workflow_move", {
    p_table: t.name,
    p_id: id,
    p_outcome: outcomeId,
    p_target: targetLevelId,
    p_comment: comment.trim() || null,
  });
  if (error) return { ok: false, message: error.message };
  after(runAutomationsSafely);
  revalidatePath(recordHref(t, id));
  revalidatePath(tableHref(t));
  return { ok: true };
}
