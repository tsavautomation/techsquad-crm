"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/session";
import { fromDateTimeLocalET } from "@/lib/dates";
import { recordsDb } from "@/lib/records/data";
import { adminDb } from "@/lib/supabase/admin";
import { getTable } from "@/registry";
import { recordHref } from "@/registry/routes";
import { CORRECTION_FIELDS, isApprover, type CorrectionField } from "./corrections";
import { myEmployeeIds } from "./load";

// F22-a: the two sides of a time correction. Writes go through the service role after the checks
// here; the visits.before_write trigger audits the corrected time like any other change.

export type ActionResult = { ok: true } | { ok: false; message: string };
const KIND: Record<CorrectionField, "on_way" | "visit_in" | "visit_out"> = { on_way_at: "on_way", checked_in_at: "visit_in", checked_out_at: "visit_out" };

/** A technician on the visit asks for one time to be corrected (local Eastern "YYYY-MM-DDTHH:mm") and says why. */
export async function requestCorrectionAction(visitId: number, field: CorrectionField, local: string, reason: string): Promise<ActionResult> {
  const user = await requireUser();
  if (!CORRECTION_FIELDS.includes(field)) return { ok: false, message: "Unknown time." };
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(local)) return { ok: false, message: "Please enter the date and time." };
  const why = reason.trim();
  if (why.length < 3) return { ok: false, message: "Please say why the time is wrong." };
  const db = await recordsDb();
  const { data } = await db.from("visits").select("id, technician_id, on_way_at, checked_in_at, checked_out_at, visits_team(target_id)").eq("id", visitId).maybeSingle();
  const v = data as { id: number; technician_id: number | null; on_way_at: string | null; checked_in_at: string | null; checked_out_at: string | null; visits_team: { target_id: number }[] } | null;
  if (!v) return { ok: false, message: "Visit not found." };
  const mine = await myEmployeeIds(db, user);
  const going = [v.technician_id, ...v.visits_team.map((x) => x.target_id)].filter((id): id is number => id !== null && mine.includes(id));
  if (!going.length) return { ok: false, message: "Only someone on this visit can ask for a correction." };
  const { error } = await adminDb().from("time_corrections").insert({
    visit_id: visitId,
    employee_id: going[0],
    requested_by: user.id,
    field,
    previous_at: v[field],
    requested_at: fromDateTimeLocalET(local),
    reason: why.slice(0, 500),
  });
  if (error) return { ok: false, message: error.message };
  revalidatePath(recordHref(getTable("visits"), visitId));
  return { ok: true };
}

/** An approver accepts (the visit's time is rewritten, and the time-clock entry with it) or rejects. */
export async function decideCorrectionAction(id: number, decision: "approve" | "reject", note?: string): Promise<ActionResult> {
  const user = await requireUser();
  const db = await recordsDb();
  if (!(await isApprover(db, user))) return { ok: false, message: "Only the people set as approvers in Admin › Field day can decide this." };
  const admin = adminDb();
  const { data } = await admin.from("time_corrections").select("id, visit_id, employee_id, field, requested_at, status").eq("id", id).maybeSingle();
  const c = data as { id: number; visit_id: number; employee_id: number; field: CorrectionField; requested_at: string; status: string } | null;
  if (!c) return { ok: false, message: "Request not found." };
  if (c.status !== "pending") return { ok: false, message: "This request was already decided." };
  if (decision === "approve") {
    const { error } = await admin.from("visits").update({ [c.field]: c.requested_at }).eq("id", c.visit_id);
    if (error) return { ok: false, message: `Visit not updated: ${error.message}` };
    // The time-clock entry for the same step follows, keeping its original time and who corrected it.
    const { data: entries } = await admin.from("time_entries").select("id, at, original_at").eq("visit_id", c.visit_id).eq("employee_id", c.employee_id).eq("kind", KIND[c.field]).is("deleted_at", null);
    for (const e of (entries ?? []) as { id: number; at: string; original_at: string | null }[]) {
      await admin.from("time_entries").update({ at: c.requested_at, original_at: e.original_at ?? e.at, corrected_at: new Date().toISOString(), corrected_by: user.id }).eq("id", e.id);
    }
  }
  const { error } = await admin.from("time_corrections").update({ status: decision === "approve" ? "approved" : "rejected", decided_by: user.id, decided_at: new Date().toISOString(), decision_note: note?.trim().slice(0, 500) || null }).eq("id", id);
  if (error) return { ok: false, message: error.message };
  revalidatePath(recordHref(getTable("visits"), c.visit_id));
  revalidatePath("/");
  return { ok: true };
}
