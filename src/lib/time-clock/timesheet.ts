// TC Timesheets (SPEC §9.1 TC-a / TC-b, Jessica via Fred 2026-10-21): the week per person from the clock
// entries, and the shifts the office should look at. Pure: no database, so it is unit-tested.
//
// Hours are the clock-in → clock-out intervals only. "On my way", "Arrived at the job" and "Left the job"
// never change the total (they describe the day, they do not pay it). A shift belongs to the day of its
// clock-in (Eastern), even when it ends after midnight.
import { toDateTimeLocalET } from "@/lib/dates";
import { autoCloseAt } from "@/lib/field-day/day";
import { addDays } from "@/lib/schedule/dates";
import type { EntryKind } from "./clock";

export type SheetEntry = { id: number; kind: EntryKind; at: string; note?: string | null; reviewed_at?: string | null; auto_closed?: boolean | null };

/** Why a shift is flagged for review. */
export type ShiftFlag = "short" | "same_minute" | "long" | "open" | "auto";

export type Shift = {
  /** The clock-in entry: the shift's anchor, where the review mark lives. */
  inId: number;
  outId: number | null;
  inAt: string;
  outAt: string | null;
  /** Eastern date of the clock-in. */
  day: string;
  minutes: number;
  flags: ShiftFlag[];
  /** Flagged and nobody has marked it reviewed yet. */
  needsReview: boolean;
};

/** What the office reads next to a flagged shift (translated on screen with t()). */
export const FLAG_TEXT: Record<ShiftFlag, string> = {
  short: "Shift under 5 minutes",
  same_minute: "Clock-in and clock-out in the same minute",
  long: "Shift over 14 hours",
  open: "Never clocked out",
  auto: "Auto clock-out",
};

export const SHORT_SHIFT_MIN = 5;
export const LONG_SHIFT_HOURS = 14;
/** The F20 automatic clock-out writes this note; Stage 2 replaces it with its own mark. */
export const AUTO_NOTE_PREFIX = "Automatic clock-out";

const ms = (iso: string) => Date.parse(iso);
const minuteOf = (iso: string) => toDateTimeLocalET(iso).slice(0, 16);

/** The Monday that starts the week containing `date` (timesheets run Monday to Sunday). */
export function mondayOf(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0 = Sunday
  return addDays(date, dow === 0 ? -6 : 1 - dow);
}

/** The seven dates of the week starting on `monday`. */
export const weekDates = (monday: string) => Array.from({ length: 7 }, (_, i) => addDays(monday, i));

/**
 * Pair each clock-in with the clock-out that follows it. A clock-in while one is already open is ignored
 * (the app refuses it; only a correction can produce it). The last shift stays open when no clock-out came.
 */
export function shiftsOf(entries: SheetEntry[], now: number = Date.now(), today: string = toDateTimeLocalET(new Date(now).toISOString()).slice(0, 10)): Shift[] {
  const sorted = entries.filter((e) => e.kind === "clock_in" || e.kind === "clock_out").sort((a, b) => ms(a.at) - ms(b.at) || a.id - b.id);
  const shifts: Shift[] = [];
  let open: { entry: SheetEntry } | null = null;
  for (const e of sorted) {
    if (e.kind === "clock_in") {
      if (open) continue;
      open = { entry: e };
    } else if (open) {
      shifts.push(makeShift(open.entry, e, now, today));
      open = null;
    }
  }
  if (open) shifts.push(makeShift(open.entry, null, now, today));
  // A clock-out and the next clock-in in the same minute: both shifts are suspicious.
  for (let i = 1; i < shifts.length; i++) {
    const prev = shifts[i - 1];
    if (prev.outAt && minuteOf(prev.outAt) === minuteOf(shifts[i].inAt)) {
      for (const s of [prev, shifts[i]]) if (!s.flags.includes("same_minute")) s.flags.push("same_minute");
    }
  }
  for (const s of shifts) s.needsReview = s.flags.length > 0 && !reviewed(s, entries);
  return shifts;
}

function reviewed(s: Shift, entries: SheetEntry[]): boolean {
  return Boolean(entries.find((e) => e.id === s.inId)?.reviewed_at);
}

function makeShift(inE: SheetEntry, outE: SheetEntry | null, now: number, today: string): Shift {
  const day = toDateTimeLocalET(inE.at).slice(0, 10);
  const flags: ShiftFlag[] = [];
  let minutes = 0;
  if (outE) {
    minutes = Math.max(0, Math.round((ms(outE.at) - ms(inE.at)) / 60_000));
    if (minutes < SHORT_SHIFT_MIN) flags.push("short");
    if (minuteOf(inE.at) === minuteOf(outE.at)) flags.push("same_minute");
    if (minutes > LONG_SHIFT_HOURS * 60) flags.push("long");
    if (outE.auto_closed || outE.note?.startsWith(AUTO_NOTE_PREFIX)) flags.push("auto");
  } else if (day >= today) {
    // Still clocked in today: runs until now, nothing to review yet.
    minutes = Math.max(0, Math.round((now - ms(inE.at)) / 60_000));
    if (minutes > LONG_SHIFT_HOURS * 60) flags.push("long");
  } else {
    // A past day never closed: counts nothing until the office fixes it.
    flags.push("open");
  }
  return { inId: inE.id, outId: outE?.id ?? null, inAt: inE.at, outAt: outE?.at ?? null, day, minutes, flags, needsReview: false };
}

export type SheetDay = { date: string; minutes: number; shifts: Shift[]; toReview: number };
export type WeekSheet = { monday: string; days: SheetDay[]; totalMinutes: number; toReview: number };

/** One person's week: minutes per day (Monday first), the week total and how many shifts want a look. */
export function weekSheet(entries: SheetEntry[], monday: string, now: number = Date.now(), today?: string): WeekSheet {
  const shifts = shiftsOf(entries, now, today);
  const days = weekDates(monday).map((date) => {
    const mine = shifts.filter((s) => s.day === date);
    return { date, minutes: mine.reduce((n, s) => n + s.minutes, 0), shifts: mine, toReview: mine.filter((s) => s.needsReview).length };
  });
  return { monday, days, totalMinutes: days.reduce((n, d) => n + d.minutes, 0), toReview: days.reduce((n, d) => n + d.toReview, 0) };
}

// ---------------------------------------------------------------- forgotten clock-outs (TC-c / TC-d)

/** Per employee, the clock-in still open (the last clock entry of the day is a clock-in). Entries in time order. */
export function openClockIns<T extends { id: number; employee_id: number; kind: EntryKind; at: string }>(entries: T[]): Map<number, T> {
  const open = new Map<number, T>();
  for (const e of [...entries].sort((a, b) => ms(a.at) - ms(b.at) || a.id - b.id)) {
    if (e.kind === "clock_in") open.set(e.employee_id, e);
    else if (e.kind === "clock_out") open.delete(e.employee_id);
  }
  return open;
}

/**
 * When the system clocks a forgotten day out (TC-d): at the person's last recorded activity after the clock-in
 * (a job arrival, leaving a job, On my way), or, with no activity after it, at the day's cut-off (F20-b's
 * automatic check-out time; a minute after the clock-in when that came later).
 */
export function forgottenClockOutAt(clockInIso: string, activityIsos: string[], day: string, cutoff: string): { at: string; reason: "last_activity" | "cutoff" } {
  const after = activityIsos.filter((a) => ms(a) > ms(clockInIso));
  if (after.length) return { at: new Date(Math.max(...after.map(ms))).toISOString(), reason: "last_activity" };
  return { at: autoCloseAt(clockInIso, day, cutoff), reason: "cutoff" };
}

/** 525 → "8:45"; 0 → "0:00". Timesheet cells, where "8 h 45 min" would not fit. */
export function formatHours(min: number): string {
  const m = Math.max(0, Math.round(min));
  return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, "0")}`;
}

/** Hours as a decimal for exports and payroll: 525 → 8.75. */
export const hoursDecimal = (min: number) => Math.round((Math.max(0, min) / 60) * 100) / 100;
