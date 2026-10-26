import { formatDate, toDateTimeLocalET } from "@/lib/dates";
import { addDays, clock } from "@/lib/schedule/dates";
import { formatHours, shiftsOf, type SheetEntry } from "./timesheet";

// J-t Overtime approval (Jessica via Fred 2026-10-26): the pure part. Which days of a week passed 9 hours, the
// task text, and the marker that keeps a week from being raised twice. Tests: tests/j3-round.test.ts.

export const OVERTIME_DAY_MIN = 9 * 60;

export type OvertimeDay = { date: string; from: string; to: string | null; minutes: number; excess: number };

/** The days of a week over the limit, from a person's clock entries (shifts belong to the day they clock in). */
export function overtimeDays(entries: SheetEntry[], monday: string, now: number = Date.now()): OvertimeDay[] {
  const byDay = new Map<string, { minutes: number; from: string; to: string | null }>();
  for (const s of shiftsOf(entries, now)) {
    if (s.day < monday || s.day > addDays(monday, 6)) continue;
    const d = byDay.get(s.day) ?? { minutes: 0, from: s.inAt, to: s.outAt };
    d.minutes += s.minutes;
    if (s.inAt < d.from) d.from = s.inAt;
    if (s.outAt && (!d.to || s.outAt > d.to)) d.to = s.outAt;
    byDay.set(s.day, d);
  }
  return [...byDay.entries()]
    .filter(([, d]) => d.minutes > OVERTIME_DAY_MIN)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, d]) => ({ date, from: d.from, to: d.to, minutes: d.minutes, excess: d.minutes - OVERTIME_DAY_MIN }));
}

export const overtimeMarker = (employeeId: number, monday: string) => `[overtime:${employeeId}:${monday}]`;

/** The task text: one line per day, then the week's excess. */
export function overtimeDetails(person: string, monday: string, days: OvertimeDay[]): string {
  const time = (iso: string) => clock(toDateTimeLocalET(iso).slice(11));
  const lines = days.map((d) => `${formatDate(d.date)}: ${time(d.from)} – ${d.to ? time(d.to) : "?"} · ${formatHours(d.minutes)} h worked, ${formatHours(d.excess)} h over 9`);
  const total = days.reduce((n, d) => n + d.excess, 0);
  return `Overtime to approve: ${person}, week of ${formatDate(monday)} – ${formatDate(addDays(monday, 6))}.\n${lines.join("\n")}\nTotal over 9 h/day: ${formatHours(total)} h. Complete this task to approve.`;
}

