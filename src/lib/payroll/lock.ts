import "server-only";
import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { CurrentUser } from "@/lib/auth/session";
import { currentLine, lockedPeriodOf } from "./load";

// TC-f: what a locked (approved) period means for a later correction of one of its clock entries.

export const PAY_PERIODS_PAGE = "/pay-periods";

/** True when the entry belongs to an approved period (the time-clock tools ask for a reason before editing). */
export async function entryLocked(db: SupabaseClient, entryId: number): Promise<boolean> {
  return (await lockedPeriodOf(db, entryId)) !== null;
}

/**
 * After an administrator changes a locked entry (with a reason): the difference between the person's
 * figures now and what the locked period paid (its line plus adjustments already recorded) becomes an
 * adjustment, paid in the next period that gets approved.
 */
export async function recordLockedCorrection(db: SupabaseClient, me: CurrentUser, entryId: number, reason: string): Promise<void> {
  const locked = await lockedPeriodOf(db, entryId);
  if (!locked) return;
  const [{ data: line }, { data: earlier }, now] = await Promise.all([
    db.from("pay_period_lines").select("minutes, amount").eq("period_id", locked.period.id).eq("employee_id", locked.employeeId).maybeSingle(),
    db.from("pay_period_adjustments").select("delta_minutes, delta_amount").eq("period_id", locked.period.id).eq("employee_id", locked.employeeId),
    currentLine(db, locked.period, locked.employeeId),
  ]);
  const paidMinutes = Number((line as { minutes: number } | null)?.minutes ?? 0) + ((earlier ?? []) as { delta_minutes: number }[]).reduce((n, a) => n + a.delta_minutes, 0);
  const paidAmount = Number((line as { amount: number | string | null } | null)?.amount ?? 0) + ((earlier ?? []) as { delta_amount: number | string | null }[]).reduce((n, a) => n + Number(a.delta_amount ?? 0), 0);
  const deltaMinutes = now.minutes - paidMinutes;
  const deltaAmount = now.amount === null ? null : Math.round((now.amount - paidAmount) * 100) / 100;
  if (deltaMinutes === 0 && (deltaAmount === null || deltaAmount === 0)) return;
  await db.from("pay_period_adjustments").insert({ period_id: locked.period.id, employee_id: locked.employeeId, entry_id: entryId, reason, delta_minutes: deltaMinutes, delta_amount: deltaAmount, created_by: me.id });
  revalidatePath(PAY_PERIODS_PAGE);
}
