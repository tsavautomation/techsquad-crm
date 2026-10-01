// F2 Field day (docs/portal-features-merge.md §B–D): pure helpers, shared by the Today screen,
// the return-card automation and the tests. No database here.
import { z } from "zod";
import { addDays } from "@/lib/schedule/dates";

// ---------------------------------------------------------------- settings (app_settings 'field_day')

const ServiceList = z.object({ checklist: z.array(z.string()).default([]), tools: z.array(z.string()).default([]) });

export const FieldDaySchema = z.object({
  /** Employee who receives every return card (Jessica for now, SPEC §9.1 F2-c). */
  scheduler_employee_id: z.number().int().positive().nullable().default(null),
  /** Days until a return card is due, by Job Report › Reason. */
  return_days: z.record(z.string(), z.number().int().min(0).max(90)).default({}),
  /** Per Visit › Service type: checklist added to the visit at check-in, and tools to bring. */
  service_lists: z.record(z.string(), ServiceList).default({}),
});
export type FieldDaySettings = z.infer<typeof FieldDaySchema>;

export function parseFieldDay(value: unknown): FieldDaySettings {
  const r = FieldDaySchema.safeParse(value ?? {});
  return r.success ? r.data : FieldDaySchema.parse({});
}

// ---------------------------------------------------------------- return cards

export const NOT_FINISHED = ["Partial", "Not done"];
export const isNotFinished = (result: unknown) => typeof result === "string" && NOT_FINISHED.includes(result);

/** "What's missing": one item per line; bullets and blank lines dropped, duplicates once. */
export function missingLines(text: unknown): string[] {
  if (typeof text !== "string") return [];
  const out: string[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/^\s*(?:[-*•·]|\d+[.)])\s*/, "").trim();
    if (line && !out.includes(line)) out.push(line);
  }
  return out;
}

/** Due date of a return card: today (Eastern) + the reason's days (3 when the reason has none). */
export function returnDueDate(reason: unknown, today: string, settings: FieldDaySettings): string {
  const days = typeof reason === "string" ? settings.return_days[reason] : undefined;
  return addDays(today, days ?? 3);
}

export type ReportForCard = {
  result: string | null;
  partial_reason: string | null;
  waiting_on: string | null;
  missing_items: string | null;
  bring_next: string | null;
  time_needed: string | null;
  people_needed: number | null;
  access_info: string | null;
};

const minutesLabel = (v: string | null) => (v ? formatMinutes(Number(v)) : "");

/** The return card's Details text (emails and screens stay in English, CLAUDE.md). */
export function returnCardDetails(r: ReportForCard, secondInARow: boolean): string {
  const lines: string[] = [];
  if (secondInARow) lines.push("2nd visit in a row that wasn't finished on this project.");
  lines.push(`Return visit needed: ${r.result ?? "Partial"}${r.partial_reason ? ` (${r.partial_reason})` : ""}.`);
  if (r.waiting_on) lines.push(`Waiting on: ${r.waiting_on}`);
  const missing = missingLines(r.missing_items);
  if (missing.length) lines.push("Missing:", ...missing.map((m) => `- ${m}`));
  if (r.bring_next) lines.push(`Bring: ${r.bring_next}`);
  const need = [r.time_needed && `time ${minutesLabel(r.time_needed)}`, r.people_needed && `${r.people_needed} people`].filter(Boolean);
  if (need.length) lines.push(`Needs: ${need.join(", ")}`);
  if (r.access_info) lines.push(`Access: ${r.access_info}`);
  return lines.join("\n").slice(0, 1000);
}

// ---------------------------------------------------------------- the day

export type FieldTimes = { starts_at: string; on_way_at: string | null; checked_in_at: string | null; checked_out_at: string | null };
export type DaySummary = { onSiteMin: number; travelMin: number; spanMin: number; started: string | null; ended: string | null; open: boolean };

const ms = (iso: string | null) => (iso ? Date.parse(iso) : NaN);
const MAX_TRAVEL = 4 * 60; // a gap longer than this is a break, not travel

/**
 * Hours of a technician's day from the visits' times: on site (check-in → check-out, or → now
 * while still on site), travelling ("On my way" or the previous check-out → check-in) and the day's span.
 */
export function daySummary(visits: FieldTimes[], now: number = Date.now()): DaySummary {
  const done = visits.filter((v) => v.checked_in_at).sort((a, b) => ms(a.checked_in_at) - ms(b.checked_in_at));
  let onSite = 0;
  let travel = 0;
  let prevOut: number | null = null;
  for (const v of done) {
    const inAt = ms(v.checked_in_at);
    const outAt = v.checked_out_at ? ms(v.checked_out_at) : now;
    onSite += Math.max(0, outAt - inAt);
    const from = v.on_way_at ? ms(v.on_way_at) : prevOut;
    if (from !== null && inAt > from && (inAt - from) / 60_000 <= MAX_TRAVEL) travel += inAt - from;
    prevOut = v.checked_out_at ? outAt : null;
  }
  const starts = visits.flatMap((v) => [v.on_way_at, v.checked_in_at]).filter((x): x is string => Boolean(x)).map(ms);
  const open = visits.some((v) => v.checked_in_at && !v.checked_out_at);
  const ends = visits.map((v) => v.checked_out_at).filter((x): x is string => Boolean(x)).map(ms);
  const start = starts.length ? Math.min(...starts) : null;
  const end = open ? now : ends.length ? Math.max(...ends) : null;
  return {
    onSiteMin: Math.round(onSite / 60_000),
    travelMin: Math.round(travel / 60_000),
    spanMin: start !== null && end !== null ? Math.max(0, Math.round((end - start) / 60_000)) : 0,
    started: start !== null ? new Date(start).toISOString() : null,
    ended: end !== null && !open ? new Date(end).toISOString() : null,
    open,
  };
}

/** 135 → "2 h 15 min". */
export function formatMinutes(min: number): string {
  if (!Number.isFinite(min) || min <= 0) return "0 min";
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return [h && `${h} h`, m && `${m} min`].filter(Boolean).join(" ");
}

// ---------------------------------------------------------------- maps

/** Google Maps directions from where the phone is, through every stop in order. */
export function routeUrl(addresses: string[]): string | null {
  const stops = addresses.filter(Boolean);
  if (!stops.length) return null;
  return `https://www.google.com/maps/dir/${["", ...stops].map((a) => encodeURIComponent(a)).join("/")}`;
}
export const mapsUrl = (a: string) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(a)}`;
export const wazeUrl = (a: string) => `https://waze.com/ul?q=${encodeURIComponent(a)}&navigate=yes`;
export const parkingUrl = (a: string) => mapsUrl(`parking near ${a}`);
