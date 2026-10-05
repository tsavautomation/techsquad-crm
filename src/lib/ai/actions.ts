"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/session";
import { recordsDb } from "@/lib/records/data";
import { ping, type Ping } from "./claude";
import { AiSettingsSchema, loadAiSettings } from "./review-queue";

/** Admin › AI: send one tiny request to Claude to prove the key works (administrators only). */
export async function testClaudeAction(): Promise<Ping> {
  const me = await requireUser();
  if (!me.isSysadmin) return { ok: false, message: "Only an administrator can test the AI connection." };
  return ping();
}

/** Admin › AI: the on / off switch for the review of new Job Reports (F17-d). */
export async function setAiReviewAction(on: boolean): Promise<{ ok: true } | { ok: false; message: string }> {
  const me = await requireUser();
  if (!me.isSysadmin) return { ok: false, message: "Only an administrator can change this." };
  const db = await recordsDb();
  const value = AiSettingsSchema.parse({ ...(await loadAiSettings(db)), review_reports: on });
  const { error } = await db.from("app_settings").upsert({ key: "ai", value });
  if (error) return { ok: false, message: error.message };
  revalidatePath("/admin/ai");
  return { ok: true };
}
