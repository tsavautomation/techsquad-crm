"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/session";
import { getRecord, recordsDb } from "@/lib/records/data";
import { saveRecord } from "@/lib/records/save";
import { getTable } from "@/registry";
import { recordHref } from "@/registry/routes";
import { SharedAlertsSchema } from "./engine";
import { isRecipient, loadSharedAlerts, logAck } from "./load";

// F26-1 Project requests and shared alerts: the Done button, the bell's "Got it" / "Clear for everyone",
// and the recipients list in Admin › Shared alerts. Every change to a request goes through saveRecord.

export type ActionResult = { ok: true } | { ok: false; message: string };

async function requestProject(id: number): Promise<number | null> {
  const row = await getRecord(getTable("project_requests"), id);
  return row && typeof row.project_id === "number" ? row.project_id : null;
}

const projectPath = (projectId: number) => recordHref(getTable("projects"), projectId);

/** Marks a request Done (the trigger keeps who and when) and clears its alert for everyone. */
export async function closeRequestAction(id: number): Promise<ActionResult> {
  const user = await requireUser();
  const projectId = await requestProject(id);
  if (!projectId) return { ok: false, message: "This request no longer exists or you can't see it." };
  const r = await saveRecord("project_requests", id, { status: "Done" });
  if (!r.ok) return { ok: false, message: r.message ?? Object.values(r.errors)[0] ?? "Could not save" };
  await logAck(await recordsDb(), user.id, [id], "cleared");
  revalidatePath(projectPath(projectId));
  return { ok: true };
}

/** Back to Open: the alert rings again for everyone who has not acknowledged it (a new clear is needed). */
export async function reopenRequestAction(id: number): Promise<ActionResult> {
  await requireUser();
  const projectId = await requestProject(id);
  if (!projectId) return { ok: false, message: "This request no longer exists or you can't see it." };
  const r = await saveRecord("project_requests", id, { status: "Open" });
  if (!r.ok) return { ok: false, message: r.message ?? Object.values(r.errors)[0] ?? "Could not save" };
  const db = await recordsDb();
  // The old clear must not hide the reopened request: the log keeps it, the alert looks at rows after the reopening.
  await db.from("alert_acks").delete().eq("kind", "project_request").eq("ref_id", id).in("action", ["acknowledged", "cleared"]);
  revalidatePath(projectPath(projectId));
  return { ok: true };
}

/** "Got it" (hides it for me) or "Clear for everyone" (hides it for every recipient), logged in my name. */
export async function ackRequestAction(id: number, action: "acknowledged" | "cleared"): Promise<ActionResult> {
  const user = await requireUser();
  const db = await recordsDb();
  if (!(await isRecipient(db, user)) && !user.isSysadmin) return { ok: false, message: "Only the people on the alert list can do this (Admin › Shared alerts)." };
  const projectId = await requestProject(id);
  if (!projectId) return { ok: false, message: "This request no longer exists or you can't see it." };
  await logAck(db, user.id, [id], action);
  revalidatePath(projectPath(projectId));
  return { ok: true };
}

/** Admin › Shared alerts: who gets the request alerts. */
export async function saveSharedAlertsAction(emails: string[]): Promise<ActionResult> {
  const me = await requireUser();
  if (!me.isSysadmin && !me.permissions.has("projects.module.design_design")) return { ok: false, message: "You don't have permission to do that." };
  const parsed = SharedAlertsSchema.safeParse({ request_recipient_emails: emails.map((e) => e.trim().toLowerCase()).filter(Boolean) });
  if (!parsed.success) return { ok: false, message: "One of the addresses is not an email." };
  const db = await recordsDb();
  const value = { ...(await loadSharedAlerts(db)), ...parsed.data };
  const { error } = await db.from("app_settings").upsert({ key: "shared_alerts", value });
  if (error) return { ok: false, message: error.message };
  revalidatePath("/admin/alerts");
  return { ok: true };
}
