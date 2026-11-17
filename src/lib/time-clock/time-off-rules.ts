// TO-a Time off (Fred 2026-11-17, Connecteam style): the pure rules. Two policies, paid and unpaid; both take
// hours from the person's one bank; the only difference is whether the hours are paid at the closing. A weekday
// with no clock-in and no time off is an absence without a request: the whole day leaves the bank, unpaid.
// The bank balance is computed, never stored: the hand-typed rows (opening balance, adjustments) minus the
// time-off hours taken since the first of them. No database here; tests in tests/to-time-off.test.ts.
import { addDays } from "@/lib/schedule/dates";
import type { PushMessage } from "@/lib/push/engine";

export const POLICIES = ["Paid absence", "Unpaid absence"] as const;
export type Policy = (typeof POLICIES)[number];
export const ABSENCE = "Unrequested absence";
export type OffKind = Policy | typeof ABSENCE;
export const isPolicy = (x: unknown): x is Policy => typeof x === "string" && (POLICIES as readonly string[]).includes(x);

export type RequestStatus = "pending" | "approved" | "refused" | "cancelled";
export const REQUEST_STATUS_TEXT: Record<RequestStatus, string> = { pending: "Pending", approved: "Approved", refused: "Refused", cancelled: "Cancelled" };

export type OffRequest = {
  id: number;
  employee_id: number;
  policy: Policy;
  starts_on: string;
  ends_on: string;
  minutes_per_day: number;
  reason: string;
  status: RequestStatus;
  direct: boolean;
  decided_by: string | null;
  decided_at: string | null;
  decision_comment: string | null;
  created_at: string;
};

/** 0 = Sunday … 6 = Saturday. */
const weekday = (date: string) => new Date(`${date}T12:00:00Z`).getUTCDay();
export const isWeekday = (date: string) => {
  const d = weekday(date);
  return d >= 1 && d <= 5;
};

/** The days a request takes hours on: Monday to Friday of the range, company holidays left out. */
export function requestDays(starts_on: string, ends_on: string, holidays: readonly string[] = []): string[] {
  const out: string[] = [];
  for (let d = starts_on; d <= ends_on && out.length < 370; d = addDays(d, 1)) if (isWeekday(d) && !holidays.includes(d)) out.push(d);
  return out;
}

/** Hours a person may ask per day: 1 h up to their full day (Field 9 h, Office 10 h), whole hours. */
export function hourChoices(fullDayMinutes: number): number[] {
  return Array.from({ length: Math.max(1, Math.floor(fullDayMinutes / 60)) }, (_, i) => i + 1);
}

/** Null when the hours are fine, else what is wrong (shown to the person). */
export function hoursProblem(minutesPerDay: number, fullDayMinutes: number): string | null {
  if (!Number.isInteger(minutesPerDay) || minutesPerDay % 60 !== 0 || minutesPerDay < 60) return "Ask for whole hours, at least 1 per day.";
  if (minutesPerDay > fullDayMinutes) return "That is more than your full day.";
  return null;
}

export type BankRow = { day: string; delta_minutes: number };
export type TakenRow = { day: string; minutes: number };

/**
 * The bank at the end of `asOf`: null until someone types the opening balance; then every hand-typed row up to
 * that day minus the time-off minutes (paid, unpaid and absences) from the first row's day up to that day.
 */
export function bankBalance(rows: BankRow[], taken: TakenRow[], asOf: string): number | null {
  if (!rows.length) return null;
  const start = rows.reduce((a, r) => (r.day < a ? r.day : a), rows[0].day);
  const typed = rows.filter((r) => r.day <= asOf).reduce((n, r) => n + r.delta_minutes, 0);
  const used = taken.filter((t) => t.day >= start && t.day <= asOf).reduce((n, t) => n + t.minutes, 0);
  return typed - used;
}

/** A weekday with no clock-in and no time off (and not a company holiday) is an absence without a request. */
export function isAbsence(p: { day: string; hasClockIn: boolean; hasTimeOff: boolean; holidays?: readonly string[] }): boolean {
  return isWeekday(p.day) && !(p.holidays ?? []).includes(p.day) && !p.hasClockIn && !p.hasTimeOff;
}

export type OffTotals = { paidMinutes: number; unpaidMinutes: number; absenceDates: string[] };

/** A range's time off by kind: paid hours, unpaid hours (requested) and the absences without a request. */
export function offTotals(entries: { day: string; kind: string; paid: boolean; minutes: number }[], from: string, to: string): OffTotals {
  const mine = entries.filter((e) => e.day >= from && e.day <= to);
  return {
    paidMinutes: mine.filter((e) => e.paid).reduce((n, e) => n + e.minutes, 0),
    unpaidMinutes: mine.filter((e) => !e.paid && e.kind !== ABSENCE).reduce((n, e) => n + e.minutes, 0),
    absenceDates: mine.filter((e) => e.kind === ABSENCE).map((e) => e.day).sort(),
  };
}

/** "-4.5" / "12" hours for a balance in minutes. */
export const bankHours = (minutes: number) => `${Math.round((minutes / 60) * 100) / 100}`;

const dayText = (date: string) => `${Number(date.slice(5, 7))}/${Number(date.slice(8, 10))}`;
const rangeText = (a: string, b: string) => (a === b ? dayText(a) : `${dayText(a)} – ${dayText(b)}`);

export const requestMessage = (p: { person: string; policy: Policy; starts_on: string; ends_on: string; hours: number }): PushMessage => ({
  title: `Time off request: ${p.person}`,
  body: `${p.policy === "Paid absence" ? "Paid" : "Unpaid"} · ${rangeText(p.starts_on, p.ends_on)} · ${p.hours} h`,
  url: "/time-clock/time-off",
  tag: `time-off-request-${p.person}-${p.starts_on}`,
});

export const requestDecidedMessage = (p: { approved: boolean; starts_on: string; ends_on: string; comment: string | null }): PushMessage => ({
  title: p.approved ? "Time off approved" : "Time off refused",
  body: `${rangeText(p.starts_on, p.ends_on)}${p.comment ? ` · ${p.comment}` : ""}`,
  url: "/my-time",
  tag: `time-off-decided-${p.starts_on}`,
});
