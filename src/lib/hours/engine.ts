// F9 Job hours (SPEC §9.1 F9-a…c): hours of work per job and per person from the visits' check-ins and
// check-outs. Pure functions, computed on read, never stored. Phase 2 job costing will hang hours on
// job-report team rows the same way: every row here already carries the people and the minutes.
//
// The rule (F9-a): everyone on a visit — the Technician and everyone in "Also going" — earns the whole
// check-in → check-out window. One person on site 3 h with a helper = 6 technician-hours on the job,
// 3 per person. The planned figure counts people the same way (Expected duration × crew), so planned
// and real compare like for like.

export type HoursVisit = {
  id: number;
  project_id?: number | null;
  starts_at: string;
  status: string | null;
  /** Expected duration in minutes (the Visit's Duration option value). */
  duration: string | number | null;
  technician_id: number | null;
  /** "Also going" (visits_team.target_id). */
  team_ids?: number[] | null;
  checked_in_at: string | null;
  checked_out_at: string | null;
};

export type VisitHours = {
  id: number;
  starts_at: string;
  status: string | null;
  /** Everyone credited: technician first, then Also going, each once. */
  people: number[];
  /** Expected duration in minutes (per person). */
  plannedMin: number;
  /** Check-in → check-out (or → now while still on site) in minutes; null when not checked in. */
  realMin: number | null;
  /** Checked in and not out yet. */
  open: boolean;
};

export type TechHours = { id: number | null; visits: number; timed: number; min: number };

export type ProjectHours = {
  /** Visits counted (cancelled ones left out), latest first. */
  visits: VisitHours[];
  timed: number;
  /** Technician-minutes on site: each visit's window × its crew. */
  onSiteMin: number;
  /** Planned technician-minutes: each visit's Expected duration × its crew. */
  plannedMin: number;
  /** Clock minutes on site (one window per visit, people not multiplied). */
  clockMin: number;
  people: number;
  byTech: TechHours[];
  open: boolean;
};

const ms = (iso: string | null | undefined) => (iso ? Date.parse(iso) : NaN);

export const isCancelled = (v: Pick<HoursVisit, "status">) => v.status === "Cancelled";

/** Everyone on the visit, technician first, nobody twice. */
export function crew(v: Pick<HoursVisit, "technician_id" | "team_ids">): number[] {
  const out: number[] = [];
  for (const id of [v.technician_id, ...(v.team_ids ?? [])]) if (id !== null && id !== undefined && !out.includes(id)) out.push(id);
  return out;
}

/** A visit still "on site" after this long was never checked out: its window is unknown, not years long. */
const FORGOTTEN_MS = 24 * 60 * 60_000;

/** Minutes on site: check-in → check-out, or → now while still on site. Null when not checked in, or when a check-out was forgotten long ago. */
export function windowMinutes(v: Pick<HoursVisit, "checked_in_at" | "checked_out_at">, now: number = Date.now()): number | null {
  const a = ms(v.checked_in_at);
  if (!Number.isFinite(a)) return null;
  if (!v.checked_out_at && now - a > FORGOTTEN_MS) return null;
  const b = v.checked_out_at ? ms(v.checked_out_at) : now;
  return Number.isFinite(b) && b > a ? Math.round((b - a) / 60_000) : 0;
}

export const plannedMinutes = (v: Pick<HoursVisit, "duration">) => Math.max(0, Number(v.duration ?? 0) || 0);

/** One visit's figures. */
export function visitHours(v: HoursVisit, now: number = Date.now()): VisitHours {
  return {
    id: v.id,
    starts_at: v.starts_at,
    status: v.status,
    people: crew(v),
    plannedMin: plannedMinutes(v),
    realMin: windowMinutes(v, now),
    open: Boolean(v.checked_in_at && !v.checked_out_at),
  };
}

/** Hours per person over the visits given, crediting the whole crew (F9-a). Null = visits with nobody on them. */
export function hoursByTech(visits: HoursVisit[], now: number = Date.now()): Map<number | null, TechHours> {
  const by = new Map<number | null, TechHours>();
  for (const v of visits) {
    if (isCancelled(v)) continue;
    const real = windowMinutes(v, now);
    const people = crew(v);
    for (const id of people.length ? people : [null]) {
      const e = by.get(id) ?? { id, visits: 0, timed: 0, min: 0 };
      e.visits++;
      if (real !== null) {
        e.timed++;
        e.min += real;
      }
      by.set(id, e);
    }
  }
  return by;
}

/** Everything the project card shows: totals, the split per person and the visits, latest first. */
export function projectHours(visits: HoursVisit[], now: number = Date.now()): ProjectHours {
  const rows = visits
    .filter((v) => !isCancelled(v))
    .map((v) => visitHours(v, now))
    .sort((a, b) => b.starts_at.localeCompare(a.starts_at));
  const byTech = [...hoursByTech(visits, now).values()].sort((a, b) => b.min - a.min || b.visits - a.visits || (a.id ?? 0) - (b.id ?? 0));
  return {
    visits: rows,
    timed: rows.filter((r) => r.realMin !== null).length,
    onSiteMin: rows.reduce((n, r) => n + (r.realMin ?? 0) * Math.max(1, r.people.length), 0),
    plannedMin: rows.reduce((n, r) => n + r.plannedMin * Math.max(1, r.people.length), 0),
    clockMin: rows.reduce((n, r) => n + (r.realMin ?? 0), 0),
    people: byTech.filter((t) => t.id !== null).length,
    byTech,
    open: rows.some((r) => r.open),
  };
}

export type ProjectTotals = { visits: number; timed: number; onSiteMin: number; plannedMin: number; people: number };

/** Technician-minutes per project (null = visits with no project), for Insights › Field work. */
export function hoursByProject(visits: HoursVisit[], now: number = Date.now()): Map<number | null, ProjectTotals> {
  const by = new Map<number | null, HoursVisit[]>();
  for (const v of visits) {
    if (isCancelled(v)) continue;
    const key = v.project_id ?? null;
    by.set(key, [...(by.get(key) ?? []), v]);
  }
  const out = new Map<number | null, ProjectTotals>();
  for (const [key, vs] of by) {
    const p = projectHours(vs, now);
    out.set(key, { visits: p.visits.length, timed: p.timed, onSiteMin: p.onSiteMin, plannedMin: p.plannedMin, people: p.people });
  }
  return out;
}

/** Real ÷ planned (1 = on plan), or null when either figure is missing. */
export function ratio(planned: number, real: number): number | null {
  return planned > 0 && real > 0 ? real / planned : null;
}
