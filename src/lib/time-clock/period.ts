import { addDays } from "@/lib/schedule/dates";
import { shiftsOf, type SheetEntry, type Shift } from "./timesheet";

// Jessica's third round (2026-10-26), pure parts: J-v department filter, J-w any period. Tests: tests/j3-round.test.ts.

/** The two departments on the Employee card (employees.departments holds the stored values). */
export const DEPARTMENTS = ["LOW VOLTAGE", "ELECTRICAL"] as const;
export type Department = (typeof DEPARTMENTS)[number];

/** True when no department is asked, or the person belongs to it. */
export const inDepartment = (departments: string[] | null | undefined, dept: Department | ""): boolean => !dept || (departments ?? []).includes(dept);

/** The project Category (Low Voltage / Electrical) as a department; null when the project has none. */
export function departmentOfCategory(category: string | null | undefined): Department | null {
  const c = (category ?? "").trim().toLowerCase();
  if (c === "low voltage") return "LOW VOLTAGE";
  if (c === "electrical") return "ELECTRICAL";
  return null;
}

export type PeriodDay = { date: string; minutes: number; shifts: Shift[]; toReview: number };
export type PeriodSheet = { from: string; to: string; days: PeriodDay[]; totalMinutes: number; toReview: number };

/** Every day from `from` to `to` (both included), with that day's shifts and hours. */
export function periodSheet(entries: SheetEntry[], from: string, to: string, now: number = Date.now(), today?: string): PeriodSheet {
  const shifts = shiftsOf(entries, now, today);
  const days: PeriodDay[] = [];
  for (let d = from; d <= to && days.length < 400; d = addDays(d, 1)) {
    const mine = shifts.filter((s) => s.day === d);
    days.push({ date: d, minutes: mine.reduce((n, s) => n + s.minutes, 0), shifts: mine, toReview: mine.filter((s) => s.needsReview).length });
  }
  return { from, to, days, totalMinutes: days.reduce((n, d) => n + d.minutes, 0), toReview: days.reduce((n, d) => n + d.toReview, 0) };
}
