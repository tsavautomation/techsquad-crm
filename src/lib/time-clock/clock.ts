// P2 Time clock (SPEC §9.1 P2-a): pure helpers shared by the clock card, the actions, the office
// screens and the tests. No database here.
import { z } from "zod";
import { fromDateTimeLocalET, toDateTimeLocalET } from "@/lib/dates";

export type Geo = { lat: number; lng: number; accuracy_m?: number | null };
export type Place = "Office" | "On site" | "Elsewhere" | "Unknown";
export type EntryKind = "clock_in" | "clock_out" | "on_way" | "visit_in" | "visit_out";

export const CLOCK_GROUPS = ["Field", "Office"] as const;

// ---------------------------------------------------------------- settings (app_settings 'field_day' › time_clock)

export const TimeClockSchema = z.object({
  office_address: z.string().trim().max(200).default(""),
  office_lat: z.number().nullable().default(null),
  office_lng: z.number().nullable().default(null),
  /** Within this many metres of the office / job address counts as being there. */
  radius_m: z.number().int().min(50).max(2000).default(150),
  /** Normal start of the day (HH:MM, Eastern); a clock-in after it counts as late for Punctuality. */
  start_time: z.string().regex(/^\d{2}:\d{2}$/).default("08:00"),
  /** When the "still clocked in" reminder fires, per group (HH:MM, Eastern). */
  reminder: z.object({ Field: z.string().regex(/^\d{2}:\d{2}$/).default("17:00"), Office: z.string().regex(/^\d{2}:\d{2}$/).default("18:00") }).default({ Field: "17:00", Office: "18:00" }),
  /** TC-c: past this time (HH:MM, Eastern) a still-open day alerts the person and the office (the time-clock approvers). */
  cutoff: z.string().regex(/^\d{2}:\d{2}$/).default("20:00"),
  /** F20: after midnight, forgotten check-outs / clock-outs are closed at this time (late_time for the people in the late list). */
  auto_checkout: z
    .object({
      time: z.string().regex(/^\d{2}:\d{2}$/).default("16:00"),
      late_time: z.string().regex(/^\d{2}:\d{2}$/).default("17:00"),
      late_employee_ids: z.array(z.number().int()).default([]),
    })
    .default({ time: "16:00", late_time: "17:00", late_employee_ids: [] }),
  /** F22-a: who approves check-in / check-out corrections (Fred 2026-10-07: Jessica #1004, Fred #1000, Luana #1005, Saulo #1012). */
  correction_approver_ids: z.array(z.number().int()).default([1004, 1000, 1005, 1012]),
});
export type TimeClockSettings = z.infer<typeof TimeClockSchema>;

export function parseTimeClock(value: unknown): TimeClockSettings {
  const r = TimeClockSchema.safeParse(value ?? {});
  return r.success ? r.data : TimeClockSchema.parse({});
}

// ---------------------------------------------------------------- places

/** Metres between two positions (haversine). */
export function distanceM(a: Geo, b: Geo): number {
  const R = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(h)));
}

/**
 * Where the person is: at the office, on a job site, elsewhere (with the distance to the nearest known
 * place) or unknown (no position). The GPS accuracy widens the radius a little, never beyond double.
 */
export function placeFor(here: Geo | null, office: Geo | null, sites: Geo[], radius: number): { place: Place; distance_m: number | null } {
  if (!here) return { place: "Unknown", distance_m: null };
  const reach = Math.min(radius * 2, radius + Math.max(0, here.accuracy_m ?? 0) / 2);
  const toOffice = office ? distanceM(here, office) : null;
  const toSite = sites.length ? Math.min(...sites.map((s) => distanceM(here, s))) : null;
  if (toSite !== null && toSite <= reach) return { place: "On site", distance_m: toSite };
  if (toOffice !== null && toOffice <= reach) return { place: "Office", distance_m: toOffice };
  const nearest = [toOffice, toSite].filter((x): x is number => x !== null);
  return { place: "Elsewhere", distance_m: nearest.length ? Math.min(...nearest) : null };
}

/** Within this many metres (500 ft) of a place, the person is simply there: no distance is shown (Fred 2026-10-22). */
export const AT_PLACE_M = 152;
/** Beyond this (1000 ft) a check-in or clock-in first asks "you are X away from <place>, continue?" (Fred 2026-10-22). */
export const FAR_AWAY_M = 305;

/** US units (Fred 2026-10-22): "" under 500 ft (at the place), "850 ft" under a mile, then "2.3 mi". */
export function formatDistance(m: number | null): string {
  if (m === null || m < AT_PLACE_M) return "";
  const ft = m * 3.28084;
  return ft < 5280 ? `${Math.round(ft / 10) * 10} ft` : `${(m / 1609.344).toFixed(1)} mi`;
}

/** The distance in metres when `here` is farther than FAR_AWAY_M from `there`; null when close enough or unknown. */
export function tooFar(here: Geo | null, there: Geo | null): number | null {
  if (!here || !there) return null;
  const d = distanceM(here, there);
  return d > FAR_AWAY_M ? d : null;
}

// ---------------------------------------------------------------- the day

export type TimeEntry = {
  id: number;
  kind: EntryKind;
  at: string;
  visit_id: number | null;
  place: Place;
  distance_m: number | null;
  lat: number | null;
  lng: number | null;
  /** TS-a: a system clock-out whose time is only a suggestion (counts nothing). */
  needs_adjustment?: boolean | null;
  /** Written by the system (an auto clock-out, or SS-a's "Left the job" for a visit nobody closed). */
  auto_closed?: boolean | null;
  /** Set once someone corrected the entry by hand. */
  corrected_at?: string | null;
};

/**
 * SS-a (Fred 2026-11-18): one stay on a job site, from "Arrived at the job" to whatever ended it. A visit with no
 * "Left the job" ends at the first of these after the arrival: "On my way" to another job, "Arrived" at another
 * job, the clock-out, or the end of the day (23:59). "Now" is used only today and only while the person is still
 * clocked in; never for a past day.
 */
export type Stay = {
  visitId: number;
  inId: number;
  start: string;
  /** Null when nothing ends it (today, not clocked in): the stay counts nothing. */
  end: string | null;
  endedBy: "left" | "on_way" | "arrived" | "clock_out" | "end_of_day" | "now" | null;
  /** The "Left the job" entry, when there is one. */
  outId: number | null;
  minutes: number;
};

export type ClockDay = {
  /** Open clock-in (no clock-out yet) or null. */
  openSince: string | null;
  clockedMin: number;
  /** Never more than the clocked time of the day. */
  onSiteMin: number;
  firstIn: string | null;
  lastOut: string | null;
  /** Entries in time order. */
  entries: TimeEntry[];
  stays: Stay[];
  /** SS-a: stays with no "Left the job" that are not simply still going on (the "Visit with no exit" alert). */
  noExit: Stay[];
};

const ms = (iso: string) => Date.parse(iso);
const byTime = (a: TimeEntry, b: TimeEntry) => ms(a.at) - ms(b.at) || a.id - b.id;
const etDay = (iso: string) => toDateTimeLocalET(iso).slice(0, 10);

/** The stays of one person's day (entries of that day, any order). `today` is the Eastern date of `now`. */
export function siteStays(entries: TimeEntry[], now: number = Date.now(), today: string = etDay(new Date(now).toISOString())): Stay[] {
  const sorted = [...entries].sort(byTime);
  const stays: Stay[] = [];
  let cur: Stay | null = null;
  const close = (end: string, endedBy: Stay["endedBy"], outId: number | null = null) => {
    if (!cur) return;
    cur.end = end;
    cur.endedBy = endedBy;
    cur.outId = outId;
    cur.minutes = Math.max(0, Math.round((ms(end) - ms(cur.start)) / 60_000));
    cur = null;
  };
  let clockedIn = false;
  for (const e of sorted) {
    if (e.kind === "clock_in") clockedIn = true;
    else if (e.kind === "clock_out") {
      clockedIn = false;
      close(e.at, "clock_out");
    } else if (e.kind === "visit_in" && e.visit_id) {
      if (cur && cur.visitId === e.visit_id) continue; // pressed twice
      close(e.at, "arrived");
      cur = { visitId: e.visit_id, inId: e.id, start: e.at, end: null, endedBy: null, outId: null, minutes: 0 };
      stays.push(cur);
    } else if (e.kind === "visit_out" && e.visit_id) {
      if (cur && cur.visitId === e.visit_id) close(e.at, "left", e.id);
      else {
        // A "Left the job" that comes after something else already ended the visit (the system's own entry at that
        // moment, or one typed later): the visit has its exit, its time stays what ended it.
        const last = stays.findLast((s) => s.visitId === e.visit_id);
        if (last && last.outId === null && last.end !== null) last.outId = e.id;
      }
    } else if (e.kind === "on_way" && e.visit_id) {
      if (cur && cur.visitId !== e.visit_id) close(e.at, "on_way");
    }
  }
  if (cur) {
    const open: Stay = cur;
    const day = etDay(open.start);
    if (day < today) close(fromDateTimeLocalET(`${day}T23:59`), "end_of_day");
    else if (clockedIn && now > ms(open.start)) close(new Date(now).toISOString(), "now");
  }
  return stays;
}

/**
 * Clocked and on-site minutes from a day's entries. An open clock-in runs until `now` today (a past day never
 * closed counts nothing until the office fixes it). On site follows siteStays and never passes the clocked time.
 */
export function clockDay(entries: TimeEntry[], now: number = Date.now()): ClockDay {
  const sorted = [...entries].sort(byTime);
  const today = etDay(new Date(now).toISOString());
  let clocked = 0;
  let inAt: number | null = null;
  let firstIn: string | null = null;
  let lastOut: string | null = null;
  for (const e of sorted) {
    if (e.kind === "clock_in") {
      if (inAt === null) inAt = ms(e.at);
      firstIn ??= e.at;
    } else if (e.kind === "clock_out") {
      if (inAt !== null && !e.needs_adjustment) clocked += Math.max(0, ms(e.at) - inAt);
      inAt = null;
      lastOut = e.at;
    }
  }
  const open = inAt !== null ? sorted.filter((e) => e.kind === "clock_in").at(-1)!.at : null;
  if (inAt !== null && etDay(new Date(inAt).toISOString()) >= today) clocked += Math.max(0, now - inAt);
  const stays = siteStays(sorted, now, today);
  const clockedMin = Math.round(clocked / 60_000);
  const onSite = stays.reduce((n, s) => n + s.minutes, 0);
  return { openSince: open, clockedMin, onSiteMin: Math.min(onSite, clockedMin), firstIn, lastOut, entries: sorted, stays, noExit: stays.filter((s) => s.outId === null && s.endedBy !== "now") };
}

// ---------------------------------------------------------------- "Left the job" the system writes (SS-a)

/** Why the system closed a visit; the text goes on the entry's note. */
export const LEFT_NOTE: Record<"on_way" | "arrived" | "clock_out" | "end_of_day", string> = {
  on_way: "Left the job (by the system): on the way to another job",
  arrived: "Left the job (by the system): arrived at another job",
  clock_out: "Left the job (by the system): at the clock-out",
  end_of_day: "Left the job (by the system): end of the day, no clock-out",
};

export type LeftPlan = {
  create: { visitId: number; inId: number; at: string; reason: keyof typeof LEFT_NOTE }[];
  /** A system "Left the job" whose time no longer matches what ended the visit (e.g. the clock-out was corrected). */
  move: { id: number; at: string; reason: keyof typeof LEFT_NOTE }[];
};

/**
 * What the system should write for one person's day so every visit has its "Left the job": one at the time of
 * whatever ended the visit (never at "now": a visit still going on is left alone). Idempotent: a system entry
 * already there is kept, or moved when its time changed; one corrected by hand counts as a real one.
 */
export function leftPlan(entries: TimeEntry[], now: number = Date.now(), today?: string): LeftPlan {
  const isSystem = (e: TimeEntry) => e.kind === "visit_out" && Boolean(e.auto_closed) && !e.corrected_at;
  const system = entries.filter(isSystem).sort(byTime);
  const plan: LeftPlan = { create: [], move: [] };
  const used = new Set<number>();
  for (const s of siteStays(entries.filter((e) => !isSystem(e)), now, today)) {
    if (s.outId !== null || s.end === null || s.endedBy === null || s.endedBy === "now" || s.endedBy === "left") continue;
    const mine = system.find((e) => e.visit_id === s.visitId && !used.has(e.id) && ms(e.at) >= ms(s.start));
    if (!mine) plan.create.push({ visitId: s.visitId, inId: s.inId, at: s.end, reason: s.endedBy });
    else {
      used.add(mine.id);
      if (ms(mine.at) !== ms(s.end)) plan.move.push({ id: mine.id, at: s.end, reason: s.endedBy });
    }
  }
  return plan;
}

/** Minutes a clock-in is past the start time (HH:MM, same day, Eastern); 0 when on time. `localTime` is "HH:MM". */
export function minutesLate(localTime: string, startTime: string): number {
  const [h, m] = localTime.split(":").map(Number);
  const [sh, sm] = startTime.split(":").map(Number);
  return Math.max(0, h * 60 + m - (sh * 60 + sm));
}

/** True once the reminder time (HH:MM) has passed, given the local time "HH:MM". */
export const pastTime = (localTime: string, at: string) => localTime >= at;
