"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/session";
import { fromDateTimeLocalET } from "@/lib/dates";
import { adminDb } from "@/lib/supabase/admin";
import { getTable } from "@/registry";
import { canDo } from "@/registry/permissions";
import { recordHref } from "@/registry/routes";

// J-n (Jessica 2026-10-20, item 5, office side): whoever may change visits corrects the field data of a visit —
// status and the three times (On my way, Checked in, Checked out) — and removes a wrong time-clock entry
// (the phone's position). Writes use the service role after the permission check here; the visits
// before_write trigger audits the change like any other.

export type ActionResult = { ok: true } | { ok: false; message: string };
export type FieldTimes = { on_way_at: string | null; checked_in_at: string | null; checked_out_at: string | null };
const STATUSES = ["Proposed", "Scheduled", "On the way", "On site", "Done", "Cancelled"];
const KIND: Record<keyof FieldTimes, string> = { on_way_at: "on_way", checked_in_at: "visit_in", checked_out_at: "visit_out" };
const LOCAL = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;

/** `times` hold local Eastern "YYYY-MM-DDTHH:mm" or null (= clear). A cleared time also removes its time-clock entries. */
export async function setFieldDataAction(visitId: number, status: string, times: FieldTimes): Promise<ActionResult> {
  const user = await requireUser();
  const t = getTable("visits");
  if (!canDo(user.permissions, t, "modify", getTable)) return { ok: false, message: "You don't have permission to change visits." };
  if (!STATUSES.includes(status)) return { ok: false, message: "Choose a status." };
  const patch: Record<string, unknown> = { status, updated_by: user.id };
  for (const k of Object.keys(KIND) as (keyof FieldTimes)[]) {
    const v = times[k];
    if (v !== null && !LOCAL.test(v)) return { ok: false, message: "Please enter the date and time." };
    patch[k] = v === null ? null : fromDateTimeLocalET(v);
  }
  if (patch.checked_out_at && !patch.checked_in_at) return { ok: false, message: "A check-out needs a check-in." };
  const admin = adminDb();
  const { data: before } = await admin.from("visits").select("on_way_at, checked_in_at, checked_out_at").eq("id", visitId).is("deleted_at", null).maybeSingle();
  if (!before) return { ok: false, message: "Visit not found." };
  const { error } = await admin.from("visits").update(patch).eq("id", visitId);
  if (error) return { ok: false, message: error.message };
  // The time-clock entries of each step follow the visit: moved with it, or removed when the time was cleared.
  const was = before as FieldTimes;
  for (const k of Object.keys(KIND) as (keyof FieldTimes)[]) {
    const next = patch[k] as string | null;
    if (next === was[k]) continue;
    const change = next === null ? { deleted_at: new Date().toISOString() } : { at: next, corrected_at: new Date().toISOString(), corrected_by: user.id, original_at: was[k] ?? next };
    await admin.from("time_entries").update(change).eq("visit_id", visitId).eq("kind", KIND[k]).is("deleted_at", null);
  }
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
