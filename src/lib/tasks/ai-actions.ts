"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/session";
import { recordsDb } from "@/lib/records/data";
import { saveRecordAction } from "@/lib/records/actions";

// J-z: what the office does with an AI "Looks done" suggestion on a task: complete it (through the ordinary
// save, so the audit log and the report's pending state follow) or keep it open and drop the suggestion.

export type Result = { ok: true } | { ok: false; message: string };

export async function acceptAiDoneAction(taskId: number): Promise<Result> {
  await requireUser();
  if (!Number.isInteger(taskId)) return { ok: false, message: "Bad request." };
  const r = await saveRecordAction("tasks", taskId, { status: "Completed" });
  if (!r.ok) return { ok: false, message: r.message ?? "Could not complete the task." };
  revalidatePath("/tasks");
  return { ok: true };
}

export async function dismissAiDoneAction(taskId: number): Promise<Result> {
  await requireUser();
  if (!Number.isInteger(taskId)) return { ok: false, message: "Bad request." };
  const db = await recordsDb();
  const { error } = await db.from("tasks").update({ ai_done_dismissed_at: new Date().toISOString(), ai_done_at: null }).eq("id", taskId);
  if (error) return { ok: false, message: error.message };
  revalidatePath("/tasks");
  return { ok: true };
}
