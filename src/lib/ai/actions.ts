"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { requireUser } from "@/lib/auth/session";
import { getRecord, recordsDb } from "@/lib/records/data";
import { adminDb, hasAdminKey } from "@/lib/supabase/admin";
import { getTable } from "@/registry";
import { canDo } from "@/registry/permissions";
import { recordHref } from "@/registry/routes";
import { aiConfigured, ping, type Ping } from "./claude";
import { AiSettingsSchema, loadAiSettings } from "./review-queue";
import { rebuildSiteSummary } from "./site-history";
import { rewriteBrief, setEventKind } from "./route-email";
import { EMAIL_KINDS, type EmailKind } from "./route-engine";

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

/** Admin › AI: the on / off switch for the reading of project emails (F26-3). */
export async function setAiRouteAction(on: boolean): Promise<{ ok: true } | { ok: false; message: string }> {
  const me = await requireUser();
  if (!me.isSysadmin) return { ok: false, message: "Only an administrator can change this." };
  const db = await recordsDb();
  const value = AiSettingsSchema.parse({ ...(await loadAiSettings(db)), route_emails: on });
  const { error } = await db.from("app_settings").upsert({ key: "ai", value });
  if (error) return { ok: false, message: error.message };
  revalidatePath("/admin/ai");
  return { ok: true };
}

/** Timeline › an email's kind, corrected by the office (F26-3). */
export async function setEventKindAction(eventId: number, kind: EmailKind): Promise<{ ok: true } | { ok: false; message: string }> {
  const user = await requireUser();
  if (!canDo(user.permissions, getTable("projects"), "modify", getTable)) return { ok: false, message: "You don't have permission to do that." };
  if (!EMAIL_KINDS.includes(kind)) return { ok: false, message: "Unknown kind." };
  if (!hasAdminKey()) return { ok: false, message: "The server has no admin key." };
  const db = adminDb();
  const { data } = await db.from("project_events").select("project_id").eq("id", eventId).maybeSingle();
  const projectId = (data as { project_id: number } | null)?.project_id;
  if (!projectId) return { ok: false, message: "This event no longer exists." };
  const r = await setEventKind(db, eventId, kind, user.id);
  if (!r.ok) return r;
  after(() => rewriteBrief(db, projectId).catch(() => undefined));
  revalidatePath(recordHref(getTable("projects"), projectId));
  return { ok: true };
}

/** Project › Project brief: write it again now (F26-3; people who may edit projects). */
export async function rebuildBriefAction(projectId: number): Promise<{ ok: true } | { ok: false; message: string }> {
  const user = await requireUser();
  if (!canDo(user.permissions, getTable("projects"), "modify", getTable)) return { ok: false, message: "You don't have permission to do that." };
  if (!aiConfigured()) return { ok: false, message: "The AI key is not set (Admin › AI)." };
  if (!hasAdminKey()) return { ok: false, message: "The server has no admin key." };
  const row = await getRecord(getTable("projects"), projectId);
  if (!row) return { ok: false, message: "This project no longer exists or you can't see it." };
  const r = await rewriteBrief(adminDb(), projectId);
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
