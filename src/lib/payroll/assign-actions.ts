"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth/session";
import { recordsDb } from "@/lib/records/data";
import type { ActionResult } from "@/lib/records/record-actions";
import { getTable } from "@/registry";
import { canDo } from "@/registry/permissions";
import { recordHref } from "@/registry/routes";

// PS-a: which pay schedule a person is on, from a date on (Employee › Pay schedule panel). People who may
// change Employees set it; the database policy enforces the same.

const DENIED_MESSAGE = "You don't have permission to do that.";
const DENIED: ActionResult = { ok: false, message: DENIED_MESSAGE };
const canAssign = (user: Awaited<ReturnType<typeof requireUser>>) => canDo(user.permissions, getTable("employees"), "modify", getTable);

const Input = z.object({
  /** null = not paid through pay periods from that date on. */
  scheduleId: z.number().int().positive().nullable(),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick the date it starts."),
  note: z.string().trim().max(200).optional(),
});

/** Put the person on a schedule (or on none) from a date; the same date replaces the earlier choice. */
export async function setPayScheduleAction(employeeId: number, input: z.input<typeof Input>): Promise<ActionResult> {
  const me = await requireUser();
  if (!canAssign(me)) return DENIED;
  const parsed = Input.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message };
  const db = await recordsDb();
  const { error } = await db
    .from("employee_pay_schedules")
    .upsert({ employee_id: employeeId, schedule_id: parsed.data.scheduleId, effective_from: parsed.data.from, note: parsed.data.note || null, created_by: me.id }, { onConflict: "employee_id,effective_from" });
  if (error) return { ok: false, message: /row-level security/i.test(error.message) ? DENIED_MESSAGE : error.message };
  revalidatePath(recordHref(getTable("employees"), employeeId));
  revalidatePath("/pay-periods");
  return { ok: true };
}

export async function deletePayScheduleLinkAction(employeeId: number, linkId: number): Promise<ActionResult> {
  const me = await requireUser();
  if (!canAssign(me)) return DENIED;
  const db = await recordsDb();
  const { data, error } = await db.from("employee_pay_schedules").delete().eq("id", linkId).eq("employee_id", employeeId).select("id");
  if (error) return { ok: false, message: error.message };
  if (!data?.length) return DENIED;
  revalidatePath(recordHref(getTable("employees"), employeeId));
  revalidatePath("/pay-periods");
  return { ok: true };
}
