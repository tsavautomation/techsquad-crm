"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/session";
import { myEmployeeIds } from "@/lib/field-day/load";
import { loginsByEmployee } from "@/lib/push/reminders";
import { notifyPush } from "@/lib/push/send";
import { recordsDb } from "@/lib/records/data";
import { adminDb, hasAdminKey } from "@/lib/supabase/admin";
import { canApproveTimesheets, periodApprovedFor } from "./approval-status";
import { decidedMessage, type OvertimeDay } from "./overtime-rules";

// OT-b: the technician's justification and the approver's decision on an overtime day. Both write with the
// service role after the checks below; every step lands in overtime_day_events (who, when, the text).

type Failed = { ok: false; message: string };
type Result = { ok: true } | Failed;
const DENIED: Failed = { ok: false, message: "You don't have permission to do that." };
const NO_KEY: Failed = { ok: false, message: "The server is not configured for this yet (admin key missing)." };

function refresh() {
  revalidatePath("/");
  revalidatePath("/my-time");
  revalidatePath("/time-clock", "layout");
  revalidatePath("/pay-periods");
}

/** The technician writes why a day ran over (required, their own days only); the day goes to the approver's queue. */
export async function justifyOvertimeAction(id: number, text: string): Promise<Result> {
  const user = await requireUser();
  if (!hasAdminKey()) return NO_KEY;
  const reason = text.trim().slice(0, 1000);
  if (reason.length < 3) return { ok: false, message: "Write why the day ran over." };
  const mine = await myEmployeeIds(await recordsDb(), user);
  const db = adminDb();
  const { data } = await db.from("overtime_days").select("id, employee_id, status, excess_minutes").eq("id", id).maybeSingle();
  const row = data as Pick<OvertimeDay, "id" | "employee_id" | "status" | "excess_minutes"> | null;
  if (!row || !mine.includes(row.employee_id)) return DENIED;
  if (row.status !== "awaiting_justification" && row.status !== "pending") return { ok: false, message: "This day was already decided." };
  const stamp = new Date().toISOString();
  const { error } = await db.from("overtime_days").update({ justification: reason, justified_at: stamp, status: "pending", justify_due_at: null }).eq("id", id);
  if (error) return { ok: false, message: error.message };
  await db.from("overtime_day_events").insert({ overtime_day_id: id, employee_id: row.employee_id, action: "justified", minutes: row.excess_minutes, note: reason, by_user: user.id });
  refresh();
  return { ok: true };
}

/**
 * Approve or refuse overtime days (one, a person's, or the week's). A comment is required to refuse. A day whose
 * timesheet period is already approved (TS-c) keeps its decision until that period is reopened.
 */
export async function decideOvertimeAction(ids: number[], approve: boolean, comment: string): Promise<{ ok: true; decided: number; skipped: number } | { ok: false; message: string }> {
  const user = await requireUser();
  if (!canApproveTimesheets(user)) return DENIED;
  if (!hasAdminKey()) return NO_KEY;
  const note = comment.trim().slice(0, 500);
  if (!approve && !note) return { ok: false, message: "Say why you are refusing (the technician reads it)." };
  const list = [...new Set(ids.filter((x) => Number.isInteger(x)))].slice(0, 200);
  if (!list.length) return { ok: false, message: "Pick the days to decide." };
  const db = adminDb();
  const { data } = await db.from("overtime_days").select("id, employee_id, day, status, excess_minutes").in("id", list).neq("status", "void");
  const rows = (data ?? []) as Pick<OvertimeDay, "id" | "employee_id" | "day" | "status" | "excess_minutes">[];
  const stamp = new Date().toISOString();
  const logins = await loginsByEmployee(db, rows.map((r) => r.employee_id));
  let decided = 0;
  let skipped = 0;
  for (const r of rows) {
    const target = approve ? "approved" : "refused";
    if (r.status === target) continue;
    // Changing a decision already made is fine until the person's timesheet period is approved.
    if ((r.status === "approved" || r.status === "refused") && (await periodApprovedFor(db, r.employee_id, r.day))) {
      skipped++;
      continue;
    }
    const { error } = await db.from("overtime_days").update({ status: target, decided_by: user.id, decided_at: stamp, decision_comment: note || null, auto_refused: false, justify_due_at: null }).eq("id", r.id);
    if (error) return { ok: false, message: error.message };
    await db.from("overtime_day_events").insert({ overtime_day_id: r.id, employee_id: r.employee_id, action: target, minutes: r.excess_minutes, note: note || null, by_user: user.id });
    decided++;
    const userId = logins.get(r.employee_id);
    if (userId) await notifyPush("overtime_decided", decidedMessage({ day: r.day, excess: r.excess_minutes, approved: approve, comment: note || null }), userId).catch(() => undefined);
  }
  refresh();
  return { ok: true, decided, skipped };
}
