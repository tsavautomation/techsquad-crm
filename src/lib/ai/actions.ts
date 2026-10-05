"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/session";
import { getRecord, recordsDb } from "@/lib/records/data";
import { adminDb, hasAdminKey } from "@/lib/supabase/admin";
import { getTable } from "@/registry";
import { canDo } from "@/registry/permissions";
import { recordHref } from "@/registry/routes";
import { aiConfigured, ping, type Ping } from "./claude";
import { AiSettingsSchema, loadAiSettings } from "./review-queue";
import { rebuildSiteSummary } from "./site-history";

/** Admin › AI: send one tiny request to Claude to prove the key works (administrators only). */
export async function testClaudeAction(): Promise<Ping> {
  const me = await requireUser();
  if (!me.isSysadmin) return { ok: false, message: "Only an administrator can test the AI connection." };
  return ping();
}

/** Project › Site history: rebuild the AI note from the last 30 Job Reports (F19-d; people who may edit projects). */
export async function rebuildSiteHistoryAction(projectId: number): Promise<{ ok: true } | { ok: false; message: string }> {
  const user = await requireUser();
  if (!canDo(user.permissions, getTable("projects"), "modify", getTable)) return { ok: false, message: "You don't have permission to do that." };
  if (!aiConfigured()) return { ok: false, message: "The AI key is not set (Admin › AI)." };
  if (!hasAdminKey()) return { ok: false, message: "The server has no admin key." };
  const row = await getRecord(getTable("projects"), projectId);
  if (!row) return { ok: false, message: "This project no longer exists or you can't see it." };
  const r = await rebuildSiteSummary(adminDb(), projectId);
  if (!r.ok) return { ok: false, message: r.message };
  revalidatePath(recordHref(getTable("projects"), projectId));
  return { ok: true };
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
