"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth/session";
import { canSeeCosting } from "@/lib/costing/load";
import { todayET } from "@/lib/dates";
import { recordsDb } from "@/lib/records/data";
import { loadOverrides, loadPeriod, loadSchedule } from "./load";
import { CYCLE_DAYS, FREQUENCIES, PayDayRuleSchema, periodEnded, periodFor, type PayDayRule } from "./periods";

// TC-f Pay periods: approve & lock; PS-a: the pay schedules (groups) and a period's moved pay day.

type Result = { ok: true } | { ok: false; message: string };
const DENIED_MESSAGE = "You don't have permission to do that.";
const DENIED: Result = { ok: false, message: DENIED_MESSAGE };
const PAGE = "/pay-periods";
const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Approve & lock: snapshot every line, stamp the period on its clock entries, and settle pending adjustments. */
export async function approvePeriodAction(scheduleId: number, startsOn: string, note: string): Promise<Result> {
  const me = await requireUser();
  if (!canSeeCosting(me)) return DENIED;
  if (!Number.isInteger(scheduleId) || !DATE.test(startsOn)) return { ok: false, message: "Pick a period first." };
  const db = await recordsDb();
  const schedule = await loadSchedule(db, scheduleId);
  if (!schedule) return { ok: false, message: "Pick a period first." };
  const period = periodFor(schedule, startsOn, await loadOverrides(db, scheduleId));
  if (period.starts_on !== startsOn) return { ok: false, message: "That date does not start a period." };
  if (!periodEnded(period, todayET())) return { ok: false, message: "This period has not ended yet." };
  const data = await loadPeriod(db, period);
  if (data.locked) return { ok: false, message: "This period is already approved." };
  if (data.totals.toReview > 0) return { ok: false, message: "Some shifts still need a review. Open each one from the list and correct it or mark it reviewed." };
  if (!data.lines.length) return { ok: false, message: "Nobody is on this pay schedule." };

  const { data: created, error } = await db.from("pay_periods").insert({ schedule_id: scheduleId, frequency: schedule.frequency, starts_on: period.starts_on, ends_on: period.ends_on, pay_day: period.pay_day, approved_by: me.id, note: note.trim() || null }).select("id").single();
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

const ScheduleInput = z.object({
  id: z.number().int().positive().nullable(),
  name: z.string().trim().min(1, "Give the schedule a name.").max(60),
  frequency: z.enum(FREQUENCIES),
  anchor_on: z.string().regex(DATE, "Pick the anchor date."),
  pay_day_rule: PayDayRuleSchema,
  active: z.boolean(),
});
export type ScheduleInput = z.input<typeof ScheduleInput>;

/** Add or change a pay schedule (PS-a). Changing the anchor or frequency moves every open period of the group. */
export async function savePayScheduleAction(input: ScheduleInput): Promise<Result> {
  const me = await requireUser();
  if (!canSeeCosting(me)) return DENIED;
  const parsed = ScheduleInput.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message };
  const s = parsed.data;
  const db = await recordsDb();
  if (s.id) {
    // A group with locked periods keeps its cycle: the locked rows were stamped with it.
    const { count } = await db.from("pay_periods").select("id", { count: "exact", head: true }).eq("schedule_id", s.id);
    if (count) {
      const current = await loadSchedule(db, s.id);
      if (current && (current.frequency !== s.frequency || (CYCLE_DAYS[s.frequency] && current.anchor_on !== s.anchor_on))) return { ok: false, message: "This schedule already has approved periods; make a new schedule instead of changing its cycle." };
    }
  }
  const row = { name: s.name, frequency: s.frequency, anchor_on: s.anchor_on, pay_day_rule: s.pay_day_rule as PayDayRule, active: s.active };
  const { error } = s.id ? await db.from("pay_schedules").update(row).eq("id", s.id) : await db.from("pay_schedules").insert({ ...row, created_by: me.id });
  if (error) return { ok: false, message: /duplicate key/i.test(error.message) ? "There is already a schedule with that name." : /row-level security/i.test(error.message) ? DENIED_MESSAGE : error.message };
  revalidatePath(PAGE);
  return { ok: true };
}

/** Move one period's pay day (a holiday), or put it back on the cycle with `payDay` null. */
export async function setPayDayAction(scheduleId: number, startsOn: string, payDay: string | null, note: string): Promise<Result> {
  const me = await requireUser();
  if (!canSeeCosting(me)) return DENIED;
  if (!Number.isInteger(scheduleId) || !DATE.test(startsOn)) return { ok: false, message: "Pick a period first." };
  const db = await recordsDb();
  const schedule = await loadSchedule(db, scheduleId);
  if (!schedule) return { ok: false, message: "Pick a period first." };
  const period = periodFor(schedule, startsOn);
  if (period.starts_on !== startsOn) return { ok: false, message: "That date does not start a period." };
  if (payDay === null) {
    const { error } = await db.from("pay_period_overrides").delete().eq("schedule_id", scheduleId).eq("starts_on", startsOn);
    if (error) return { ok: false, message: error.message };
  } else {
    if (!DATE.test(payDay) || payDay < period.starts_on) return { ok: false, message: "Pick a pay day on or after the period's first day." };
    const { error } = await db.from("pay_period_overrides").upsert({ schedule_id: scheduleId, starts_on: startsOn, pay_day: payDay, note: note.trim() || null, created_by: me.id }, { onConflict: "schedule_id,starts_on" });
    if (error) return { ok: false, message: /row-level security/i.test(error.message) ? DENIED_MESSAGE : error.message };
  }
  // A locked period keeps its stamped pay day in step.
  await db.from("pay_periods").update({ pay_day: payDay ?? period.pay_day }).eq("schedule_id", scheduleId).eq("starts_on", startsOn);
  revalidatePath(PAGE);
  return { ok: true };
}
