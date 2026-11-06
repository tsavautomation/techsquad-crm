// OT Overtime (Fred 2026-11-05 spec): the pure rules. Per day, then summed:
//   1. the day's worked minutes = the sum of its shifts (a shift after midnight stays on its clock-in day; PTO is apart);
//   2. up to the daily limit in force that day is Regular, the rest Overtime;
//   3. an optional weekly limit: regular minutes of the week (Monday to Sunday) past it become Overtime too;
//   4. Regular × the pay rate in force that day + Overtime × the overtime rate in force that day
//      (no overtime rate → the pay rate, and the day is flagged "No overtime rate");
//   5. a day inside a work trip multiplies the day's pay (Regular and Overtime) by 1 + premium %;
//   6. paid time off = its minutes × the pay rate, never overtime, never the premium.
// The limit comes from the person's own override when there is one, else from their time-clock group; both
// have a history, and the value in force on the day worked counts. No database here; tests in tests/ot-overtime.test.ts.
import { rateAt, type RateRow } from "@/lib/costing/engine";
import { mondayOf } from "@/lib/time-clock/timesheet";

/** Minutes of a day past which the rest is overtime when nothing is set (the historical 9 h). */
export const DEFAULT_DAILY_MIN = 9 * 60;

export type HoursRow = { effective_from: string; daily_minutes: number; weekly_minutes: number | null };
export type DayLimit = { daily: number; weekly: number | null };
export type Trip = { starts_on: string; ends_on: string; premium_pct: number | string };

/** The row in force on `date`: the latest effective_from on or before it. */
export function hoursAt<T extends { effective_from: string }>(rows: T[], date: string): T | null {
  let best: T | null = null;
  for (const r of rows) if (r.effective_from <= date && (!best || r.effective_from > best.effective_from)) best = r;
  return best;
}

/** The daily (and weekly) limit of a day: the person's own override when one is in force, else the group's, else 9 h. */
export function limitAt(groupRows: HoursRow[], personRows: HoursRow[], date: string): DayLimit {
  const row = hoursAt(personRows, date) ?? hoursAt(groupRows, date);
  return row ? { daily: row.daily_minutes, weekly: row.weekly_minutes } : { daily: DEFAULT_DAILY_MIN, weekly: null };
}

/** The trip a day falls in (both ends included), or null. */
export function tripAt(trips: Trip[], date: string): Trip | null {
  return trips.find((t) => t.starts_on <= date && date <= t.ends_on) ?? null;
}

export type DaySplit = { day: string; minutes: number; regular: number; overtime: number; limit: DayLimit };

/**
 * Steps 1–3: each worked day's Regular / Overtime split. `limitFor` gives the limit in force on a day. The weekly
 * limit counts the regular minutes of the Monday-to-Sunday week among the days given (a week cut by the period's
 * edge counts what the period holds).
 */
export function splitDays(worked: { day: string; minutes: number }[], limitFor: (day: string) => DayLimit): DaySplit[] {
  const byDay = new Map<string, number>();
  for (const w of worked) if (w.minutes > 0) byDay.set(w.day, (byDay.get(w.day) ?? 0) + w.minutes);
  const out: DaySplit[] = [];
  const weekRegular = new Map<string, number>();
  for (const day of [...byDay.keys()].sort()) {
    const minutes = byDay.get(day)!;
    const limit = limitFor(day);
    let regular = Math.min(minutes, limit.daily);
    if (limit.weekly !== null) {
      const monday = mondayOf(day);
      const sofar = weekRegular.get(monday) ?? 0;
      regular = Math.max(0, Math.min(regular, limit.weekly - sofar));
      weekRegular.set(monday, sofar + regular);
    }
    out.push({ day, minutes, regular, overtime: minutes - regular, limit });
  }
  return out;
}

export type DayPay = DaySplit & {
  rate: number | null;
  /** The overtime rate used (the pay rate when the person has none). */
  overtimeRate: number | null;
  missingOvertimeRate: boolean;
  premiumPct: number;
  /** Regular × rate + overtime × overtime rate, before the premium. Null without a rate. */
  base: number | null;
  /** The trip premium on top of `base`. */
  premium: number;
};

/** Steps 4–5 for one split day. */
export function payDay(d: DaySplit, rates: RateRow[], overtimeRates: RateRow[], trips: Trip[]): DayPay {
  const rate = rateAt(rates, d.day);
  const ot = d.overtime > 0 ? rateAt(overtimeRates, d.day) : null;
  const missingOvertimeRate = d.overtime > 0 && ot === null;
  const overtimeRate = d.overtime > 0 ? (ot ?? rate) : null;
  const trip = tripAt(trips, d.day);
  const premiumPct = trip ? Number(trip.premium_pct) || 0 : 0;
  const base = rate === null ? null : (d.regular / 60) * rate + (d.overtime / 60) * (overtimeRate ?? rate);
  return { ...d, rate, overtimeRate, missingOvertimeRate, premiumPct, base, premium: base === null ? 0 : base * (premiumPct / 100) };
}

/** "9 h" / "9.5 h" for the limit texts on the screens. */
export function limitHours(minutes: number): string {
  const h = Math.round((minutes / 60) * 100) / 100;
  return `${h}`;
}
