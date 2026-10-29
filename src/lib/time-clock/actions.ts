"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/session";
import { fromDateTimeLocalET, toDateTimeLocalET } from "@/lib/dates";
import { isApprover } from "@/lib/field-day/corrections";
import { entryLocked, recordLockedCorrection } from "@/lib/payroll/lock";
import { recordsDb } from "@/lib/records/data";
import type { Geo } from "./clock";
import { weekApprovedFor } from "./week-status";
import { myClockToday, recordEntry } from "./record";

// P2 Time clock actions. Everyone records their own entries; people who may edit Employees correct them.

export type ClockResult = { ok: true; place: string } | { ok: false; message: string };

const cleanGeo = (g: Geo | null): Geo | null =>
  g && Number.isFinite(g.lat) && Number.isFinite(g.lng) && Math.abs(g.lat) <= 90 && Math.abs(g.lng) <= 180 ? { lat: g.lat, lng: g.lng, accuracy_m: g.accuracy_m != null && Number.isFinite(g.accuracy_m) ? Math.round(Math.min(99_999, Math.max(0, g.accuracy_m))) : null } : null;

/** Clock in or out for the day. A second clock-in while still clocked in, or a clock-out without one, is refused. */
export async function clockAction(kind: "clock_in" | "clock_out", geo: Geo | null): Promise<ClockResult> {
  const user = await requireUser();
  if (kind !== "clock_in" && kind !== "clock_out") return { ok: false, message: "Unknown step." };
  const db = await recordsDb();
  const mine = await myClockToday(db, user);
  if (!mine) return { ok: false, message: "Your login isn't linked to an Employee record (same email). Ask the office to fix the employee's email." };
  if (kind === "clock_in" && mine.day.openSince) return { ok: false, message: "You're already clocked in." };
  if (kind === "clock_out" && !mine.day.openSince) return { ok: false, message: "You're not clocked in." };
  const r = await recordEntry(db, user, kind, cleanGeo(geo));
  if (!r.ok) return r;
  // F20: the day is over, so no visit of mine stays "On site".
  if (kind === "clock_out") await db.rpc("close_my_open_visits", { p_except: null, p_reason: "clock_out" });
  revalidatePath("/");
  revalidatePath("/time-clock");
  return { ok: true, place: r.entry.place };
}

/**
 * TC-h: an entry in an approved week is not changed by anyone until the week is reopened on Timesheets.
 * TC-f: an entry in an approved pay period is changed only by an administrator, with a reason; the difference becomes an adjustment.
 */
async function lockCheck(db: Awaited<ReturnType<typeof recordsDb>>, user: Awaited<ReturnType<typeof requireUser>>, id: number, reason: string | undefined): Promise<{ locked: boolean; message?: string }> {
  const { data: e } = await db.from("time_entries").select("employee_id, at").eq("id", id).maybeSingle();
  if (e && (await weekApprovedFor(db, e.employee_id as number, toDateTimeLocalET(e.at as string).slice(0, 10)))) return { locked: true, message: "This week's timesheet is approved. Reopen it on Timesheets to change this entry." };
  const locked = await entryLocked(db, id);
  if (!locked) return { locked: false };
  if (!user.isSysadmin) return { locked: true, message: "This entry belongs to an approved pay period; only an administrator can change it." };
  if (!reason?.trim()) return { locked: true, message: "This entry belongs to an approved pay period: say why you are changing it." };
  return { locked: true };
}

/** Correct an entry's time (HH:MM, Eastern, same day). The original time is kept and the correction signed. */
export async function correctEntryAction(id: number, time: string, reason?: string): Promise<{ ok: true } | { ok: false; message: string }> {
  const user = await requireUser();
  if (!user.permissions.has("administrative.employees.modify")) return { ok: false, message: "You don't have permission to do that." };
  if (!/^\d{2}:\d{2}$/.test(time)) return { ok: false, message: "Please enter a time like 07:45." };
  const db = await recordsDb();
  const { data: e } = await db.from("time_entries").select("id, at, original_at").eq("id", id).maybeSingle();
  if (!e) return { ok: false, message: "Entry not found." };
  const lock = await lockCheck(db, user, id, reason);
  if (lock.message) return { ok: false, message: lock.message };
  const day = toDateTimeLocalET(e.at as string).slice(0, 10);
  const at = fromDateTimeLocalET(`${day}T${time}`);
  const { error } = await db.from("time_entries").update({ at, original_at: e.original_at ?? e.at, corrected_at: new Date().toISOString(), corrected_by: user.id, note: lock.locked ? `Corrected after the pay period was approved: ${reason!.trim()}` : undefined }).eq("id", id);
  if (error) return { ok: false, message: error.message };
  if (lock.locked) await recordLockedCorrection(db, user, id, reason!.trim());
  revalidatePath("/time-clock");
  revalidatePath("/");
  return { ok: true };
}

/** Remove an entry (soft delete; it stays in the database). */
export async function removeEntryAction(id: number, reason?: string): Promise<{ ok: true } | { ok: false; message: string }> {
  const user = await requireUser();
  if (!user.permissions.has("administrative.employees.modify")) return { ok: false, message: "You don't have permission to do that." };
  const db = await recordsDb();
  const lock = await lockCheck(db, user, id, reason);
  if (lock.message) return { ok: false, message: lock.message };
  const { error } = await db.from("time_entries").update({ deleted_at: new Date().toISOString(), corrected_at: new Date().toISOString(), corrected_by: user.id, note: lock.locked ? `Removed after the pay period was approved: ${reason!.trim()}` : undefined }).eq("id", id);
  if (error) return { ok: false, message: error.message };
  if (lock.locked) await recordLockedCorrection(db, user, id, reason!.trim());
  revalidatePath("/time-clock");
  revalidatePath("/");
  return { ok: true };
}

/** TC-b: the office looked at a flagged shift (its clock-in entry) and accepts it as it is, or takes that back. */
export async function reviewShiftAction(entryId: number, reviewed: boolean): Promise<{ ok: true } | { ok: false; message: string }> {
  const user = await requireUser();
  if (!user.permissions.has("administrative.employees.modify")) return { ok: false, message: "You don't have permission to do that." };
  const db = await recordsDb();
  const { data, error } = await db
    .from("time_entries")
    .update(reviewed ? { reviewed_at: new Date().toISOString(), reviewed_by: user.id } : { reviewed_at: null, reviewed_by: null })
    .eq("id", entryId)
    .eq("kind", "clock_in")
    .select("id");
  if (error) return { ok: false, message: error.message };
  if (!data?.length) return { ok: false, message: "Entry not found." };
  revalidatePath("/time-clock");
  revalidatePath("/time-clock/timesheets");
  return { ok: true };
}

/** TC-c: "Got it" (hides the still-clocked-in alert for me) or "Clear for everyone" (for every approver), logged in my name. */
export async function ackClockAlertAction(entryId: number, action: "acknowledged" | "cleared"): Promise<{ ok: true } | { ok: false; message: string }> {
  const user = await requireUser();
  const db = await recordsDb();
  if (!(await isApprover(db, user))) return { ok: false, message: "Only the time-clock approvers can do this (Admin › Field day)." };
  const { error } = await db.from("alert_acks").upsert({ kind: "clock_open", ref_id: entryId, user_id: user.id, action }, { onConflict: "kind,ref_id,user_id,action", ignoreDuplicates: true });
  if (error) return { ok: false, message: error.message };
  return { ok: true };
}
