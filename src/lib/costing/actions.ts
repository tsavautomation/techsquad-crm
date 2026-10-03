"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth/session";
import { recordsDb } from "@/lib/records/data";
import type { ActionResult } from "@/lib/records/record-actions";
import { getTable } from "@/registry";
import { recordHref } from "@/registry/routes";
import { canSeeCosting } from "./load";

// F13-a: pay rates per employee. Only people with the job costing key may read or write them (the
// database policy enforces the same).

const DENIED_MESSAGE = "You don't have permission to do that.";
const DENIED: ActionResult = { ok: false, message: DENIED_MESSAGE };

const RateInput = z.object({
  rate: z.coerce.number().min(0, "The rate can't be negative.").max(10000, "That rate looks wrong."),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick the date the rate starts."),
  note: z.string().trim().max(200).optional(),
});

/** Add (or replace, same date) the hourly rate that applies from a date on. */
export async function setPayRateAction(employeeId: number, input: z.input<typeof RateInput>): Promise<ActionResult> {
  const me = await requireUser();
  if (!canSeeCosting(me)) return DENIED;
  const parsed = RateInput.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message };
  const db = await recordsDb();
  const { error } = await db
    .from("employee_pay_rates")
    .upsert({ employee_id: employeeId, hourly_rate: parsed.data.rate, effective_from: parsed.data.from, note: parsed.data.note || null, created_by: me.id }, { onConflict: "employee_id,effective_from" });
  if (error) return { ok: false, message: /row-level security/i.test(error.message) ? DENIED_MESSAGE : error.message };
  revalidatePath(recordHref(getTable("employees"), employeeId));
  return { ok: true };
}

export async function deletePayRateAction(employeeId: number, rateId: number): Promise<ActionResult> {
  const me = await requireUser();
  if (!canSeeCosting(me)) return DENIED;
  const db = await recordsDb();
  const { data, error } = await db.from("employee_pay_rates").delete().eq("id", rateId).eq("employee_id", employeeId).select("id");
  if (error) return { ok: false, message: error.message };
  if (!data?.length) return DENIED;
  revalidatePath(recordHref(getTable("employees"), employeeId));
  return { ok: true };
}
