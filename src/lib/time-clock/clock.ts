// P2 Time clock (SPEC §9.1 P2-a): pure helpers shared by the clock card, the actions, the office
// screens and the tests. No database here.
import { z } from "zod";

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

/** "1.2 km" / "350 m". */
export function formatDistance(m: number | null): string {
  if (m === null) return "";
  return m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${m} m`;
}

// ---------------------------------------------------------------- the day

export type TimeEntry = { id: number; kind: EntryKind; at: string; visit_id: number | null; place: Place; distance_m: number | null; lat: number | null; lng: number | null };

export type ClockDay = {
  /** Open clock-in (no clock-out yet) or null. */
  openSince: string | null;
  clockedMin: number;
  onSiteMin: number;
  firstIn: string | null;
  lastOut: string | null;
  /** Entries in time order. */
  entries: TimeEntry[];
};

const ms = (iso: string) => Date.parse(iso);

/** Clocked and on-site minutes from a day's entries; an open clock-in or check-in runs until `now`. */
export function clockDay(entries: TimeEntry[], now: number = Date.now()): ClockDay {
  const sorted = [...entries].sort((a, b) => ms(a.at) - ms(b.at));
  let clocked = 0;
  let onSite = 0;
  let inAt: number | null = null;
  const siteIn = new Map<number, number>();
  let firstIn: string | null = null;
  let lastOut: string | null = null;
  for (const e of sorted) {
    if (e.kind === "clock_in") {
      if (inAt === null) inAt = ms(e.at);
      firstIn ??= e.at;
    } else if (e.kind === "clock_out") {
      if (inAt !== null) clocked += Math.max(0, ms(e.at) - inAt);
      inAt = null;
      lastOut = e.at;
    } else if (e.kind === "visit_in" && e.visit_id) {
      siteIn.set(e.visit_id, ms(e.at));
    } else if (e.kind === "visit_out" && e.visit_id) {
      const start = siteIn.get(e.visit_id);
      if (start !== undefined) onSite += Math.max(0, ms(e.at) - start);
      siteIn.delete(e.visit_id);
    }
  }
  if (inAt !== null) clocked += Math.max(0, now - inAt);
  for (const start of siteIn.values()) onSite += Math.max(0, now - start);
  const open = inAt !== null ? sorted.filter((e) => e.kind === "clock_in").at(-1)!.at : null;
  return { openSince: open, clockedMin: Math.round(clocked / 60_000), onSiteMin: Math.round(onSite / 60_000), firstIn, lastOut, entries: sorted };
}

/** Minutes a clock-in is past the start time (HH:MM, same day, Eastern); 0 when on time. `localTime` is "HH:MM". */
export function minutesLate(localTime: string, startTime: string): number {
  const [h, m] = localTime.split(":").map(Number);
  const [sh, sm] = startTime.split(":").map(Number);
  return Math.max(0, h * 60 + m - (sh * 60 + sm));
}

/** True once the reminder time (HH:MM) has passed, given the local time "HH:MM". */
export const pastTime = (localTime: string, at: string) => localTime >= at;
