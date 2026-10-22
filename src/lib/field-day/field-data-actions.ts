"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/session";
import { fromDateTimeLocalET } from "@/lib/dates";
import { adminDb } from "@/lib/supabase/admin";
import { getTable } from "@/registry";
import { canDo } from "@/registry/permissions";
import { recordHref } from "@/registry/routes";

// J-n (Jessica 2026-10-20, item 5, office side) + F29 (Fred 2026-10-22, per person): whoever may change visits
// corrects one person's field data on a visit — their On my way / Checked in / Checked out — and removes a wrong
// time-clock entry (the phone's position). Writes use the service role after the permission check here; the
// visit's team summary (status and times) is recomputed by visit_recompute, and the visits before_write trigger
// audits that change like any other.

export type ActionResult = { ok: true } | { ok: false; message: string };
export type FieldTimes = { on_way_at: string | null; checked_in_at: string | null; checked_out_at: string | null };
const KIND: Record<keyof FieldTimes, string> = { on_way_at: "on_way", checked_in_at: "visit_in", checked_out_at: "visit_out" };
const LOCAL = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;

/** `times` hold local Eastern "YYYY-MM-DDTHH:mm" or null (= clear) for one person. A cleared time also removes their time-clock entries of that step. */
export async function setAttendanceAction(visitId: number, employeeId: number, times: FieldTimes): Promise<ActionResult> {
  const user = await requireUser();
  const t = getTable("visits");
  if (!canDo(user.permissions, t, "modify", getTable)) return { ok: false, message: "You don't have permission to change visits." };
  if (!Number.isInteger(visitId) || !Number.isInteger(employeeId)) return { ok: false, message: "Unknown visit or person." };
  const patch: Record<string, unknown> = { visit_id: visitId, employee_id: employeeId, updated_at: new Date().toISOString() };
  for (const k of Object.keys(KIND) as (keyof FieldTimes)[]) {
    const v = times[k];
    if (v !== null && !LOCAL.test(v)) return { ok: false, message: "Please enter the date and time." };
    patch[k] = v === null ? null : fromDateTimeLocalET(v);
  }
  if (patch.checked_out_at && !patch.checked_in_at) return { ok: false, message: "A check-out needs a check-in." };
  const admin = adminDb();
  const { data: visit } = await admin.from("visits").select("id").eq("id", visitId).is("deleted_at", null).maybeSingle();
  if (!visit) return { ok: false, message: "Visit not found." };
  const { data: before } = await admin.from("visit_attendance").select("on_way_at, checked_in_at, checked_out_at").eq("visit_id", visitId).eq("employee_id", employeeId).maybeSingle();
  const was = (before ?? { on_way_at: null, checked_in_at: null, checked_out_at: null }) as FieldTimes;
  const { error } = await admin.from("visit_attendance").upsert(patch, { onConflict: "visit_id,employee_id" });
  if (error) return { ok: false, message: error.message };
  // The person's time-clock entries of each step follow: moved with the time, or removed when it was cleared.
  for (const k of Object.keys(KIND) as (keyof FieldTimes)[]) {
    const next = patch[k] as string | null;
    if (next === was[k]) continue;
    const change = next === null ? { deleted_at: new Date().toISOString() } : { at: next, corrected_at: new Date().toISOString(), corrected_by: user.id, original_at: was[k] ?? next };
    await admin.from("time_entries").update(change).eq("visit_id", visitId).eq("employee_id", employeeId).eq("kind", KIND[k]).is("deleted_at", null);
  }
  const { error: e2 } = await admin.rpc("visit_recompute", { p_id: visitId });
  if (e2) return { ok: false, message: e2.message };
  revalidatePath(recordHref(t, visitId));
  revalidatePath("/");
  return { ok: true };
}

/** Remove one time-clock entry of the visit (a wrong position or a stray step). */
export async function removeFieldEntryAction(visitId: number, entryId: number): Promise<ActionResult> {
  const user = await requireUser();
  const t = getTable("visits");
  if (!canDo(user.permissions, t, "modify", getTable)) return { ok: false, message: "You don't have permission to change visits." };
  const { error } = await adminDb().from("time_entries").update({ deleted_at: new Date().toISOString() }).eq("id", entryId).eq("visit_id", visitId);
  if (error) return { ok: false, message: error.message };
  revalidatePath(recordHref(t, visitId));
  return { ok: true };
}
