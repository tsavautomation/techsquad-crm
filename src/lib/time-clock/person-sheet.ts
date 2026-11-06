// TS-b Person panel (Fred 2026-11-04, Part 3 of the Pay periods / Time clock brief): the pure part. One
// person's days over a period (their pay-schedule period, or the week), grouped in week blocks with a
// subtotal, and the totals at the top (regular, overtime over 9 h/day, PTO, days worked).
// Tests: tests/ts-person-sheet.test.ts.
import { DEFAULT_DAILY_MIN, splitDays, type DayLimit } from "@/lib/payroll/overtime";
import { addDays } from "@/lib/schedule/dates";
import { mondayOf, shiftsOf, type SheetEntry, type Shift } from "./timesheet";

/** A day of time off (time_off_entries) as the panel shows it. */
export type DayOff = { id: number; day: string; kind: string; paid: boolean; minutes: number; note: string | null };

export type PersonDay = { date: string; shifts: Shift[]; minutes: number; toReview: number; timeOff: DayOff | null };
/** Seven days at most, Monday to Sunday, cut at the period's edges. */
export type WeekBlock = { monday: string; days: PersonDay[]; minutes: number; ptoMinutes: number };
export type PersonTotals = {
  minutes: number;
  /** Up to the daily (and weekly) limit in force. */
  regular: number;
  /** OT: past the limit in force on each day (9 h when nothing is set). */
  overtime: number;
  /** Paid time off. */
  pto: number;
  daysWorked: number;
  toReview: number;
};

/** Every day from `from` to `to` (both included) with that day's shifts and time off. */
export function personDays(entries: SheetEntry[], from: string, to: string, timeOff: DayOff[] = [], now: number = Date.now(), today?: string): PersonDay[] {
  const shifts = shiftsOf(entries, now, today);
  const off = new Map(timeOff.map((o) => [o.day, o]));
  const days: PersonDay[] = [];
  for (let d = from; d <= to && days.length < 400; d = addDays(d, 1)) {
    const mine = shifts.filter((s) => s.day === d);
    days.push({ date: d, shifts: mine, minutes: mine.reduce((n, s) => n + s.minutes, 0), toReview: mine.filter((s) => s.needsReview).length, timeOff: off.get(d) ?? null });
  }
  return days;
}

/** The days grouped by their Monday, in order; the first and last block may be shorter than a week. */
export function weekBlocks(days: PersonDay[]): WeekBlock[] {
  const out: WeekBlock[] = [];
  for (const d of days) {
    const monday = mondayOf(d.date);
    let block = out.at(-1);
    if (!block || block.monday !== monday) {
      block = { monday, days: [], minutes: 0, ptoMinutes: 0 };
      out.push(block);
    }
    block.days.push(d);
    block.minutes += d.minutes;
    if (d.timeOff?.paid) block.ptoMinutes += d.timeOff.minutes;
  }
  return out;
}

const NINE: DayLimit = { daily: DEFAULT_DAILY_MIN, weekly: null };

/** The figures at the top of the panel. Overtime is whatever a day has past the limit in force (OT: per group / person). */
export function personTotals(days: PersonDay[], limitFor: (day: string) => DayLimit = () => NINE): PersonTotals {
  const minutes = days.reduce((n, d) => n + d.minutes, 0);
  const overtime = splitDays(days.map((d) => ({ day: d.date, minutes: d.minutes })), limitFor).reduce((n, d) => n + d.overtime, 0);
  return {
    minutes,
    regular: minutes - overtime,
    overtime,
    pto: days.reduce((n, d) => n + (d.timeOff?.paid ? d.timeOff.minutes : 0), 0),
    daysWorked: days.filter((d) => d.minutes > 0).length,
    toReview: days.reduce((n, d) => n + d.toReview, 0),
  };
}

/**
 * Whether a time change needs a reason (brief item 7): changing a time the app (or the office) recorded does;
 * filling an empty field (a missing clock-out, or the real time in place of a system suggestion) does not.
 */
export const reasonNeeded = (p: { recorded: boolean; suggested: boolean; changed: boolean }) => p.changed && p.recorded && !p.suggested;

export type { Shift };
