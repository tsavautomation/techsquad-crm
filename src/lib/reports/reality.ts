import { toDateTimeLocalET } from "@/lib/dates";

// F19-b Report vs. reality (Fred 2026-10-05): what the visit and the report say against the time clock,
// the drive from the warehouse and the van's Bouncie trips. Pure: tested in tests/f19-reality.test.ts.

export type Geo = { lat: number; lng: number };

export type RealityVisit = {
  starts_at: string | null;
  on_way_at: string | null;
  checked_in_at: string | null;
  checked_out_at: string | null;
  vehicle_id: number | null;
  /** The job address position, when geocoded. */
  site: Geo | null;
};

export type RealityEntry = { kind: "clock_in" | "clock_out" | "on_way" | "visit_in" | "visit_out"; at: string; place: string; lat: number | null; lng: number | null };

/** One Bouncie trip of the visit's van that day. */
export type RealityTrip = { start: string; end: string; endLat: number | null; endLng: number | null };

export type RealityInput = {
  visit: RealityVisit | null;
  report: { vehicle_id: number | null };
  /** The person's time-clock entries that day. */
  entries: RealityEntry[];
  office: Geo | null;
  /** null = Bouncie not connected or no van on the visit; [] = connected but no trip. */
  trips: RealityTrip[] | null;
  thresholdMin: number;
  graceMin: number;
};

export type RealityFlag = { key: "arrival" | "early_checkin" | "hours" | "vehicle" | "van_position" | "no_clock"; level: "warn" | "info"; text: string; minutes?: number };

export const EARTH_KM = 6371;
export function distanceKm(a: Geo, b: Geo): number {
  const rad = (x: number) => (x * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_KM * Math.asin(Math.sqrt(h));
}

/** Estimated drive in South Florida traffic: straight line × 1.3 for roads, 40 km/h average, at least 5 minutes. */
export function estimatedDriveMin(from: Geo, to: Geo): number {
  return Math.max(5, Math.round(((distanceKm(from, to) * 1.3) / 40) * 60));
}

const min = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 60_000);
const sameDay = (iso: string, date: string) => toDateTimeLocalET(iso).slice(0, 10) === date;

/** The flags for one person's visit. Empty when everything agrees (or nothing can be compared). */
export function realityFlags(i: RealityInput): RealityFlag[] {
  const out: RealityFlag[] = [];
  const v = i.visit;
  if (!v) return out;
  const day = v.checked_in_at ? toDateTimeLocalET(v.checked_in_at).slice(0, 10) : v.starts_at ? toDateTimeLocalET(v.starts_at).slice(0, 10) : null;
  const entries = day ? i.entries.filter((e) => sameDay(e.at, day)) : i.entries;
  const clockIn = entries.filter((e) => e.kind === "clock_in").sort((a, b) => a.at.localeCompare(b.at))[0] ?? null;
  const clockOut = entries.filter((e) => e.kind === "clock_out").sort((a, b) => b.at.localeCompare(a.at))[0] ?? null;

  // Arrival: departure from the warehouse (On my way, else a clock-in at the office) + estimated drive + grace.
  if (v.checked_in_at && v.site && i.office) {
    const departure = v.on_way_at ?? (clockIn && clockIn.place === "Office" ? clockIn.at : null);
    if (departure) {
      const drive = estimatedDriveMin(i.office, v.site);
      const elapsed = min(departure, v.checked_in_at);
      const late = elapsed - drive - i.graceMin;
      if (late > i.thresholdMin) out.push({ key: "arrival", level: "warn", minutes: late, text: `Checked in ${elapsed} min after leaving; the drive is about ${drive} min (+${i.graceMin} min for parking): ${late} min unexplained.` });
      else if (elapsed < Math.round(drive * 0.5) && drive >= 15) out.push({ key: "early_checkin", level: "info", minutes: drive - elapsed, text: `Checked in ${elapsed} min after leaving, but the drive is about ${drive} min: check-in may have been pressed before arriving.` });
    }
  }

  // Hours: the visit's on-site window against the clocked day.
  if (v.checked_in_at && v.checked_out_at) {
    const onSite = min(v.checked_in_at, v.checked_out_at);
    if (clockIn && clockOut) {
      const clocked = min(clockIn.at, clockOut.at);
      if (onSite - clocked > i.thresholdMin) out.push({ key: "hours", level: "warn", minutes: onSite - clocked, text: `On site ${onSite} min but clocked in for ${clocked} min that day: ${onSite - clocked} min more on site than clocked.` });
    }
    if (clockIn && min(v.checked_in_at, clockIn.at) > i.thresholdMin) out.push({ key: "hours", level: "warn", minutes: min(v.checked_in_at, clockIn.at), text: `Checked in at the site ${min(v.checked_in_at, clockIn.at)} min before clocking in.` });
    if (clockOut && min(clockOut.at, v.checked_out_at) > i.thresholdMin) out.push({ key: "hours", level: "warn", minutes: min(clockOut.at, v.checked_out_at), text: `Checked out of the site ${min(clockOut.at, v.checked_out_at)} min after clocking out.` });
    if (!clockIn) out.push({ key: "no_clock", level: "info", text: "No clock-in that day, so the hours could not be compared." });
  }

  // Vehicle: the report's van against the visit's.
  if (i.report.vehicle_id && v.vehicle_id && i.report.vehicle_id !== v.vehicle_id) out.push({ key: "vehicle", level: "warn", text: "The report names a different vehicle from the one assigned to the visit." });

  // Van position: a Bouncie trip of the visit's van should end near the site around the check-in.
  if (i.trips && v.checked_in_at && v.site) {
    const near = i.trips.filter((t) => t.endLat !== null && t.endLng !== null && distanceKm({ lat: t.endLat, lng: t.endLng }, v.site!) <= 0.5);
    const around = near.some((t) => Math.abs(min(t.end, v.checked_in_at!)) <= 90);
    if (!i.trips.length) out.push({ key: "van_position", level: "warn", text: "The van assigned to the visit made no trip that day (Bouncie)." });
    else if (!around) {
      const closest = i.trips.filter((t) => t.endLat !== null && t.endLng !== null).map((t) => distanceKm({ lat: t.endLat!, lng: t.endLng! }, v.site!)).sort((a, b) => a - b)[0];
      out.push({ key: "van_position", level: "warn", text: closest !== undefined ? `No van trip ended at the site around the check-in (closest stop ${closest.toFixed(1)} km away).` : "No van trip ended at the site around the check-in (Bouncie)." });
    }
  }
  return out;
}
