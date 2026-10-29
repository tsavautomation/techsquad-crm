"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/session";
import { canSeeCosting } from "@/lib/costing/load";
import { todayET } from "@/lib/dates";
import { recordsDb } from "@/lib/records/data";
import { loadPayrollSettings, loadPeriod } from "./load";
import { isFrequency, PayrollSettingsSchema, periodEnded, periodFor, type Frequency } from "./periods";

// TC-f Pay periods: approve & lock, settings, and the adjustment an administrator's later correction leaves.

type Result = { ok: true } | { ok: false; message: string };
const DENIED_MESSAGE = "You don't have permission to do that.";
const DENIED: Result = { ok: false, message: DENIED_MESSAGE };
const PAGE = "/pay-periods";

/** Approve & lock: snapshot every line, stamp the period on its clock entries, and settle pending adjustments. */
export async function approvePeriodAction(frequency: string, startsOn: string, note: string): Promise<Result> {
  const me = await requireUser();
  if (!canSeeCosting(me)) return DENIED;
  if (!isFrequency(frequency) || !/^\d{4}-\d{2}-\d{2}$/.test(startsOn)) return { ok: false, message: "Pick a period first." };
  const db = await recordsDb();
  const settings = await loadPayrollSettings(db);
  const period = periodFor(frequency, startsOn, settings);
  if (period.starts_on !== startsOn) return { ok: false, message: "That date does not start a period." };
  if (!periodEnded(period, todayET())) return { ok: false, message: "This period has not ended yet." };
  const data = await loadPeriod(db, period);
  if (data.locked) return { ok: false, message: "This period is already approved." };
  if (data.totals.toReview > 0) return { ok: false, message: "Some shifts still need a review. Open each one from the list and correct it or mark it reviewed." };
  if (!data.lines.length) return { ok: false, message: "Nobody is on this pay frequency." };

  const { data: created, error } = await db.from("pay_periods").insert({ frequency, starts_on: period.starts_on, ends_on: period.ends_on, pay_day: period.pay_day, approved_by: me.id, note: note.trim() || null }).select("id").single();
  if (error) return { ok: false, message: /row-level security/i.test(error.message) ? DENIED_MESSAGE : error.message };
  const periodId = (created as { id: number }).id;
  const { error: le } = await db.from("pay_period_lines").insert(
    data.lines.map((l) => ({ period_id: periodId, employee_id: l.person.id, minutes: l.line.minutes, pto_minutes: l.line.ptoMinutes, rate_text: l.line.rateText || null, amount: l.line.amount, adjustments: l.line.adjustments, flagged: l.shifts.filter((s) => s.flags.length).length })),
  );
  if (le) return { ok: false, message: le.message };
  // Lock the clock entries whose shift falls in the period (both ends of each shift).
  const entryIds = data.lines.flatMap((l) => l.shifts.flatMap((s) => [s.inId, s.outId]).filter((x): x is number => x !== null));
  if (entryIds.length) {
    const { error: te } = await db.from("time_entries").update({ pay_period_id: periodId }).in("id", entryIds).is("pay_period_id", null);
    if (te) return { ok: false, message: te.message };
  }
  const adjustmentIds = data.lines.flatMap((l) => l.adjustments.map((a) => a.id));
  if (adjustmentIds.length) await db.from("pay_period_adjustments").update({ applied_period_id: periodId }).in("id", adjustmentIds);
  revalidatePath(PAGE);
  revalidatePath("/time-clock");
  return { ok: true };
}

export async function savePayrollSettingsAction(input: { biweekly_anchor: string; days_after: Record<Frequency, number> }): Promise<Result> {
  const me = await requireUser();
  if (!canSeeCosting(me)) return DENIED;
  const parsed = PayrollSettingsSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "Check the anchor date and the days after the period." };
  // The anchor must be a Monday, so biweekly periods line up with the timesheet weeks.
  const [y, m, d] = parsed.data.biweekly_anchor.split("-").map(Number);
  if (new Date(Date.UTC(y, m - 1, d)).getUTCDay() !== 1) return { ok: false, message: "The anchor date must be a Monday." };
  const db = await recordsDb();
  const { error } = await db.from("app_settings").upsert({ key: "payroll", value: parsed.data });
  if (error) return { ok: false, message: error.message };
  revalidatePath(PAGE);
  return { ok: true };
}

