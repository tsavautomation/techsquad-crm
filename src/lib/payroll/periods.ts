// PS-a Pay schedules (SPEC §9.1; replaces TC-e's global settings): which days a schedule's period covers and
// when it is paid. Pure; dates are plain "YYYY-MM-DD" strings in Eastern time, like the calendar helpers.
import { z } from "zod";
import { addDays } from "@/lib/schedule/dates";

export const FREQUENCIES = ["Biweekly", "Every 4 weeks", "Monthly calendar"] as const;
export type Frequency = (typeof FREQUENCIES)[number];
export const isFrequency = (x: unknown): x is Frequency => typeof x === "string" && (FREQUENCIES as readonly string[]).includes(x);
/** Days per cycle; the calendar month has none. */
export const CYCLE_DAYS: Record<Frequency, number | null> = { Biweekly: 14, "Every 4 weeks": 28, "Monthly calendar": null };

export const PayDayRuleSchema = z.discriminatedUnion("kind", [
  /** The period's last day plus N days. */
  z.object({ kind: z.literal("days_after"), days: z.number().int().min(0).max(31) }),
  /** The first such weekday after the period ends (0 = Sunday … 6 = Saturday). */
  z.object({ kind: z.literal("weekday"), weekday: z.number().int().min(0).max(6) }),
]);
export type PayDayRule = z.infer<typeof PayDayRuleSchema>;
export const DEFAULT_PAY_DAY_RULE: PayDayRule = { kind: "days_after", days: 5 };

export function parsePayDayRule(value: unknown): PayDayRule {
  const r = PayDayRuleSchema.safeParse(value);
  return r.success ? r.data : DEFAULT_PAY_DAY_RULE;
}

export type Schedule = { id: number; name: string; frequency: Frequency; anchor_on: string; pay_day_rule: PayDayRule; active: boolean };

export type Period = {
  schedule_id: number;
  frequency: Frequency;
  starts_on: string;
  ends_on: string;
  pay_day: string;
  /** True when this period's pay day was moved by hand (pay_period_overrides). */
  pay_day_moved: boolean;
};

/** Moved pay days of one schedule: period first day → pay day. */
export type Overrides = ReadonlyMap<string, string>;
const NONE: Overrides = new Map();

export const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] as const;
const dayNumber = (date: string) => Math.round(Date.UTC(Number(date.slice(0, 4)), Number(date.slice(5, 7)) - 1, Number(date.slice(8, 10))) / 86_400_000);
/** 0 = Sunday … 6 = Saturday. */
export const weekdayOf = (date: string) => ((dayNumber(date) + 4) % 7 + 7) % 7;
const monthEnd = (date: string) => {
  const [y, m] = date.split("-").map(Number);
  return addDays(`${y}-${String(m).padStart(2, "0")}-01`, new Date(Date.UTC(y, m, 0)).getUTCDate() - 1);
};

/** The pay day a rule gives for a period ending on `ends_on`. */
export function payDayOf(ends_on: string, rule: PayDayRule): string {
  if (rule.kind === "days_after") return addDays(ends_on, rule.days);
  let d = addDays(ends_on, 1);
  while (weekdayOf(d) !== rule.weekday) d = addDays(d, 1);
  return d;
}

/** The period of `schedule` that contains `date`. */
export function periodFor(schedule: Schedule, date: string, overrides: Overrides = NONE): Period {
  let starts_on: string;
  let ends_on: string;
  const cycle = CYCLE_DAYS[schedule.frequency];
  if (cycle) {
    const k = Math.floor((dayNumber(date) - dayNumber(schedule.anchor_on)) / cycle);
    starts_on = addDays(schedule.anchor_on, k * cycle);
    ends_on = addDays(starts_on, cycle - 1);
  } else {
    starts_on = `${date.slice(0, 7)}-01`;
    ends_on = monthEnd(date);
  }
  const moved = overrides.get(starts_on);
  return { schedule_id: schedule.id, frequency: schedule.frequency, starts_on, ends_on, pay_day: moved ?? payDayOf(ends_on, schedule.pay_day_rule), pay_day_moved: moved !== undefined };
}

export const nextPeriod = (p: Period, schedule: Schedule, overrides: Overrides = NONE) => periodFor(schedule, addDays(p.ends_on, 1), overrides);
export const previousPeriod = (p: Period, schedule: Schedule, overrides: Overrides = NONE) => periodFor(schedule, addDays(p.starts_on, -1), overrides);

/** The `n` most recent periods up to the one containing `date`, newest first. */
export function recentPeriods(schedule: Schedule, date: string, n: number, overrides: Overrides = NONE): Period[] {
  const out: Period[] = [];
  let p = periodFor(schedule, date, overrides);
  for (let i = 0; i < n; i++) {
    out.push(p);
    p = previousPeriod(p, schedule, overrides);
  }
  return out;
}

/** True once the period has ended (its last day is before `today`), so it can be approved. */
export const periodEnded = (p: Period, today: string) => p.ends_on < today;

/** Every date of the period, first to last. */
export function periodDates(p: Period): string[] {
  const out: string[] = [];
  for (let d = p.starts_on; d <= p.ends_on; d = addDays(d, 1)) out.push(d);
  return out;
}

/** One employee ↔ schedule link from a date on; `schedule_id` null = not paid through pay periods from then. */
export type Assignment = { employee_id: number; schedule_id: number | null; effective_from: string };

/** The schedule a person is on at `date`: the latest link that had started by then (none before the first). */
export function scheduleInForce(links: Assignment[], employeeId: number, date: string): number | null {
  let best: Assignment | null = null;
  for (const l of links) {
    if (l.employee_id !== employeeId || l.effective_from > date) continue;
    if (!best || l.effective_from > best.effective_from) best = l;
  }
  return best?.schedule_id ?? null;
}

/** A readable form of the pay-day rule, for screens ("5 days after the period ends"). */
export function describeRule(rule: PayDayRule, t: (s: string, v?: Record<string, string | number>) => string): string {
  if (rule.kind === "days_after") return rule.days === 0 ? t("on the period's last day") : t("{n} days after the period ends", { n: rule.days });
  return t("on the first {weekday} after the period ends", { weekday: t(WEEKDAYS[rule.weekday]) });
}
