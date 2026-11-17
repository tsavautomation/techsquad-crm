// OT Overtime (Fred 2026-11-05 spec; corrected 2026-11-17, OT-b): the pure rules. Per day, then summed:
//   1. the day's worked minutes = the sum of its shifts (a shift after midnight stays on its clock-in day; time off is apart);
//   2. overtime is DAILY only (no weekly limit). Up to the daily limit in force that day is Regular. Past it:
//        - within the group's tolerance (Field 20 min, Office none): the day is paid as the limit, the extra
//          minutes are not paid, are not overtime and raise nothing;
//        - past the tolerance: the WHOLE excess is overtime;
//   3. in a group whose overtime needs approval (the Field), the excess is paid only once approved; refused = not
//      paid (shown for information); waiting = not paid yet and it blocks the period. Elsewhere (the Office) it is paid;
//   4. Regular × the pay rate in force that day + paid overtime × the overtime rate in force that day
//      (no overtime rate → the pay rate, and the day is flagged "No overtime rate");
//   5. a day inside a work trip earns the premium % on its regular pay and on its overtime pay (kept apart);
//   6. paid time off = its minutes × the pay rate, never overtime, never the premium.
// The limit comes from the person's own override when there is one, else from their time-clock group; both
// have a history, and the value in force on the day worked counts. No database here; tests in tests/ot-overtime.test.ts.
import { rateAt, type RateRow } from "@/lib/costing/engine";

/** Minutes of a day past which the rest is overtime when nothing is set (the historical 9 h). */
export const DEFAULT_DAILY_MIN = 9 * 60;

export type HoursRow = { effective_from: string; daily_minutes: number; tolerance_minutes?: number | null };
export type DayLimit = { daily: number; tolerance: number };
export type Trip = { starts_on: string; ends_on: string; premium_pct: number | string };

/** What happens to a day's overtime: paid (no approval needed, or approved), refused, or still waiting. */
export type OvertimeState = "paid" | "approved" | "refused" | "pending" | "awaiting";

/** The row in force on `date`: the latest effective_from on or before it. */
export function hoursAt<T extends { effective_from: string }>(rows: T[], date: string): T | null {
  let best: T | null = null;
  for (const r of rows) if (r.effective_from <= date && (!best || r.effective_from > best.effective_from)) best = r;
  return best;
}

/** The limit of a day: the person's own daily hours when set, else the group's, else 9 h; the tolerance is always the group's. */
export function limitAt(groupRows: HoursRow[], personRows: HoursRow[], date: string): DayLimit {
  const group = hoursAt(groupRows, date);
  const own = hoursAt(personRows, date);
  return { daily: own?.daily_minutes ?? group?.daily_minutes ?? DEFAULT_DAILY_MIN, tolerance: group?.tolerance_minutes ?? 0 };
}

/** The trip a day falls in (both ends included), or null. */
export function tripAt<T extends Trip>(trips: T[], date: string): T | null {
  return trips.find((t) => t.starts_on <= date && date <= t.ends_on) ?? null;
}

/** Minutes of overtime a day's total gives: nothing up to limit + tolerance, the whole excess past it. */
export function excessOf(minutes: number, limit: DayLimit): number {
  const over = minutes - limit.daily;
  return over > limit.tolerance ? over : 0;
}

export type DaySplit = {
  day: string;
  minutes: number;
  regular: number;
  /** The whole excess past the limit when it passes the tolerance (whatever its state). */
  excess: number;
  /** The part of `excess` that is paid (no approval needed, or approved). */
  overtime: number;
  refused: number;
  /** Waiting for the justification or the decision: not paid yet. */
  pending: number;
  /** Minutes inside the tolerance: not paid, not overtime. */
  dropped: number;
  state: OvertimeState | null;
  limit: DayLimit;
};

/**
 * Steps 1–3: each worked day's split. `limitFor` gives the limit in force on a day; `stateFor` says what happens to
 * a day's overtime (null / no function = paid without approval).
 */
export function splitDays(worked: { day: string; minutes: number }[], limitFor: (day: string) => DayLimit, stateFor?: (day: string) => OvertimeState | null): DaySplit[] {
  const byDay = new Map<string, number>();
  for (const w of worked) if (w.minutes > 0) byDay.set(w.day, (byDay.get(w.day) ?? 0) + w.minutes);
  const out: DaySplit[] = [];
  for (const day of [...byDay.keys()].sort()) {
    const minutes = byDay.get(day)!;
    const limit = limitFor(day);
    const excess = excessOf(minutes, limit);
    const regular = Math.min(minutes, limit.daily);
    const dropped = minutes - regular - excess;
    const state: OvertimeState | null = excess > 0 ? (stateFor?.(day) ?? "paid") : null;
    out.push({
      day,
      minutes,
      regular,
      excess,
      overtime: state === "paid" || state === "approved" ? excess : 0,
      refused: state === "refused" ? excess : 0,
      pending: state === "pending" || state === "awaiting" ? excess : 0,
      dropped,
      state,
      limit,
    });
  }
  return out;
}

export type DayPay = DaySplit & {
  rate: number | null;
  /** The overtime rate used (the pay rate when the person has none). */
  overtimeRate: number | null;
  missingOvertimeRate: boolean;
  premiumPct: number;
  /** Regular × rate + paid overtime × overtime rate, before the premium. Null without a rate. */
  base: number | null;
  /** The trip premium on the regular pay and on the overtime pay. */
  premiumRegular: number;
  premiumOvertime: number;
};

/** Steps 4–5 for one split day. */
export function payDay(d: DaySplit, rates: RateRow[], overtimeRates: RateRow[], trips: Trip[]): DayPay {
  const rate = rateAt(rates, d.day);
  const ot = d.overtime > 0 ? rateAt(overtimeRates, d.day) : null;
  const missingOvertimeRate = d.overtime > 0 && ot === null;
  const overtimeRate = d.overtime > 0 ? (ot ?? rate) : null;
  const trip = tripAt(trips, d.day);
  const premiumPct = trip ? Number(trip.premium_pct) || 0 : 0;
  const regularPay = rate === null ? null : (d.regular / 60) * rate;
  const overtimePay = rate === null ? null : (d.overtime / 60) * (overtimeRate ?? rate);
  return {
    ...d,
    rate,
    overtimeRate,
    missingOvertimeRate,
    premiumPct,
    base: regularPay === null || overtimePay === null ? null : regularPay + overtimePay,
    premiumRegular: regularPay === null ? 0 : regularPay * (premiumPct / 100),
    premiumOvertime: overtimePay === null ? 0 : overtimePay * (premiumPct / 100),
  };
}

/** "9" / "9.5" for the limit texts on the screens. */
export function limitHours(minutes: number): string {
  const h = Math.round((minutes / 60) * 100) / 100;
  return `${h}`;
}
