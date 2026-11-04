// F13 Job costing (SPEC §9.1 F13-a/b): pure sums, computed on read, never stored.
//
// Labour = every person's minutes on each visit (F9-a crew rule: technician + Also going each earn the
// check-in → check-out window) × that person's hourly rate in force on the visit's day.
// F13-c (Fred 2026-11-04, "only listing very few visits"): a past visit nobody checked in on (the calendar
// history, a forgotten check-out) counts its Expected duration instead, shown apart as planned time.
// Materials = the parts and custom items of the approved proposals and change orders (Portal.io lines,
// cost × quantity: transactions.parts_cost) plus the Cost of Sale records whose Destination is the project.
// Margin = Approved (Apply to Project › Proposal transactions) − labour − materials.

import { toDateTimeLocalET } from "@/lib/dates";
import { crew, isCancelled, plannedMinutes, windowMinutes, type HoursVisit } from "@/lib/hours/engine";

export type RateRow = { employee_id: number; hourly_rate: number | string; effective_from: string };

export type LabourLine = {
  id: number;
  minutes: number;
  /** Minutes on visits with no rate in force that day. */
  unratedMin: number;
  /** F13-c: minutes taken from the Expected duration (past visits with no check-in window). */
  plannedMin: number;
  /** The rate used on the latest visit (for the screen); null when the person never had one. */
  rate: number | null;
  cost: number;
  visits: number;
};

export type Costing = {
  labour: LabourLine[];
  labourMin: number;
  labourCost: number;
  unratedMin: number;
  /** F13-c: technician-minutes estimated from the Expected duration, and how many visits that was. */
  plannedMin: number;
  plannedVisits: number;
  /** Parts and custom items of the approved proposals and change orders (Portal.io, cost × quantity). */
  partsCost: number;
  /** Parts + Sale records. */
  materialsCost: number;
  materialsCount: number;
  totalCost: number;
  approved: number;
  margin: number | null;
  marginPct: number | null;
};

const cents = (n: number) => Math.round(n * 100) / 100;

/** The rate in force on `date` (YYYY-MM-DD): the latest effective_from on or before it. Null when none. */
export function rateAt(rates: RateRow[], date: string): number | null {
  let best: RateRow | null = null;
  for (const r of rates) if (r.effective_from <= date && (!best || r.effective_from > best.effective_from)) best = r;
  return best ? Number(best.hourly_rate) : null;
}

/** Eastern day of a visit: the check-in when there was one, else the planned start. */
export const visitDay = (v: Pick<HoursVisit, "starts_at" | "checked_in_at">) => toDateTimeLocalET(v.checked_in_at ?? v.starts_at).slice(0, 10);

/** A visit that already happened: marked Done, or its planned window has ended. */
export const isPast = (v: Pick<HoursVisit, "status" | "starts_at" | "duration">, now: number) => v.status === "Done" || Date.parse(v.starts_at) + plannedMinutes(v) * 60_000 <= now;

/** The minutes a visit costs: the real window; for a past visit without one, the Expected duration (F13-c). */
export function costedMinutes(v: HoursVisit, now: number): { min: number; planned: boolean } {
  const real = windowMinutes(v, now);
  if (real !== null) return { min: real, planned: false };
  return isPast(v, now) ? { min: plannedMinutes(v), planned: true } : { min: 0, planned: false };
}

export function jobCosting(visits: HoursVisit[], rates: RateRow[], materials: { cost: number | string | null }[], approved: number, now: number = Date.now(), partsCost = 0): Costing {
  const byPerson = new Map<number, RateRow[]>();
  for (const r of rates) byPerson.set(r.employee_id, [...(byPerson.get(r.employee_id) ?? []), r]);
  const lines = new Map<number, LabourLine>();
  const latestDay = new Map<number, string>();
  let plannedVisits = 0;
  for (const v of visits) {
    if (isCancelled(v)) continue;
    const { min, planned } = costedMinutes(v, now);
    if (!min) continue;
    if (planned) plannedVisits++;
    const day = visitDay(v);
    for (const id of crew(v)) {
      const rate = rateAt(byPerson.get(id) ?? [], day);
      const line = lines.get(id) ?? { id, minutes: 0, unratedMin: 0, plannedMin: 0, rate: null, cost: 0, visits: 0 };
      line.minutes += min;
      line.visits++;
      if (planned) line.plannedMin += min;
      if (rate === null) line.unratedMin += min;
      else line.cost += (min / 60) * rate;
      if (day >= (latestDay.get(id) ?? "")) {
        latestDay.set(id, day);
        line.rate = rate;
      }
      lines.set(id, line);
    }
  }
  const labour = [...lines.values()]
    .map((l) => ({ ...l, cost: cents(l.cost) }))
    .sort((a, b) => b.cost - a.cost || b.minutes - a.minutes);
  const labourCost = cents(labour.reduce((n, l) => n + l.cost, 0));
  const parts = cents(Number(partsCost) || 0);
  const materialsCost = cents(parts + materials.reduce((n, m) => n + (Number(m.cost ?? 0) || 0), 0));
  const totalCost = cents(labourCost + materialsCost);
  const margin = approved > 0 ? cents(approved - totalCost) : null;
  return {
    labour,
    labourMin: labour.reduce((n, l) => n + l.minutes, 0),
    labourCost,
    unratedMin: labour.reduce((n, l) => n + l.unratedMin, 0),
    plannedMin: labour.reduce((n, l) => n + l.plannedMin, 0),
    plannedVisits,
    partsCost: parts,
    materialsCost,
    materialsCount: materials.length,
    totalCost,
    approved,
    margin,
    marginPct: margin !== null ? Math.round((margin / approved) * 1000) / 10 : null,
  };
}
