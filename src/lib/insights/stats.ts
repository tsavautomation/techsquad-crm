// F5 Insights: pure sums over the rows the page reads with the viewer's own permissions.

const ms = (iso: string | null) => (iso ? Date.parse(iso) : NaN);

export type VisitTimes = {
  service_type: string | null;
  technician_id: number | null;
  status: string | null;
  duration: string | number | null; // planned minutes
  checked_in_at: string | null;
  checked_out_at: string | null;
};

export type TypeTimes = { type: string; n: number; plannedMin: number; real: number; realMin: number; plannedAvg: number; realAvg: number };

/** Minutes between check-in and check-out, or null when the visit was not timed. */
export function realMinutes(v: Pick<VisitTimes, "checked_in_at" | "checked_out_at">): number | null {
  const a = ms(v.checked_in_at);
  const b = ms(v.checked_out_at);
  return Number.isFinite(a) && Number.isFinite(b) && b > a ? Math.round((b - a) / 60_000) : null;
}

/**
 * Planned vs real time per service type (cancelled visits left out). Averages take only the visits
 * that have the figure, so a type with planned time but no check-outs shows a real average of 0.
 */
export function realVsPlanned(visits: VisitTimes[], noType = "No service type"): TypeTimes[] {
  const by = new Map<string, TypeTimes>();
  for (const v of visits) {
    if (v.status === "Cancelled") continue;
    const type = v.service_type || noType;
    const t = by.get(type) ?? { type, n: 0, plannedMin: 0, real: 0, realMin: 0, plannedAvg: 0, realAvg: 0 };
    t.n++;
    t.plannedMin += Number(v.duration ?? 0) || 0;
    const r = realMinutes(v);
    if (r !== null) {
      t.real++;
      t.realMin += r;
    }
    by.set(type, t);
  }
  return [...by.values()]
    .map((t) => ({ ...t, plannedAvg: t.n ? Math.round(t.plannedMin / t.n) : 0, realAvg: t.real ? Math.round(t.realMin / t.real) : 0 }))
    .sort((a, b) => b.n - a.n);
}

/** Minutes on site per technician id (null = no technician), from timed visits only. */
export function onSiteByTech(visits: VisitTimes[]): Map<number | null, { visits: number; min: number }> {
  const by = new Map<number | null, { visits: number; min: number }>();
  for (const v of visits) {
    if (v.status === "Cancelled") continue;
    const e = by.get(v.technician_id) ?? { visits: 0, min: 0 };
    e.visits++;
    e.min += realMinutes(v) ?? 0;
    by.set(v.technician_id, e);
  }
  return by;
}

export const RESULTS = ["Completed", "Partial", "Not done"] as const;

/** Job Report results in the period; reports with no Result (old form) are counted apart. */
export function reportResults(reports: { result: string | null }[]): { result: string; n: number }[] {
  const n = new Map<string, number>();
  for (const r of reports) n.set(r.result || "No result", (n.get(r.result || "No result") ?? 0) + 1);
  return [...RESULTS, "No result"].filter((k) => n.has(k)).map((result) => ({ result, n: n.get(result)! }));
}

export const WON_STAGES = new Set(["Proposal Approved", "Infrastructure", "Installation", "Programming", "Complete"]);
export const LOST_STAGE = "Proposal Denied";

export type SalesStat = { id: number | null; n: number; won: number; lost: number; open: number; value: number; winRate: number | null };

/**
 * Projects per salesperson: won (approved or further), lost (Proposal Denied) and still open, approved
 * value and the win rate over decided projects. Projects with no salesperson come under id null.
 */
export function salespeople(projects: { salesperson_id: number | null; job_status: string | null }[], approvedOf: (i: number) => number = () => 0): SalesStat[] {
  const by = new Map<number | null, SalesStat>();
  projects.forEach((p, i) => {
    const s = by.get(p.salesperson_id) ?? { id: p.salesperson_id, n: 0, won: 0, lost: 0, open: 0, value: 0, winRate: null };
    s.n++;
    if (p.job_status && WON_STAGES.has(p.job_status)) s.won++;
    else if (p.job_status === LOST_STAGE) s.lost++;
    else s.open++;
    s.value += approvedOf(i);
    by.set(p.salesperson_id, s);
  });
  return [...by.values()]
    .map((s) => ({ ...s, winRate: s.won + s.lost ? Math.round((s.won / (s.won + s.lost)) * 100) : null }))
    .sort((a, b) => (a.id === null ? 1 : 0) - (b.id === null ? 1 : 0) || b.value - a.value || b.won - a.won || b.n - a.n);
}

// ---------------------------------------------------------------- duplicates (Data page)

export type DupeInput = { id: number; name: string | null; phone: string | null; email: string | null };
export type DupeGroup = { kind: "phone" | "email" | "name"; value: string; ids: number[] };

const digits = (s: string | null) => (s ?? "").replace(/\D/g, "").slice(-10);
const norm = (s: string | null | undefined) => (s ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");

/** Records sharing a 10-digit phone, an email (case-insensitive) or a name (letters and digits only). */
export function findDuplicates(items: DupeInput[]): DupeGroup[] {
  const groups = new Map<string, DupeGroup>();
  const add = (kind: DupeGroup["kind"], key: string, value: string, id: number) => {
    const g = groups.get(`${kind}:${key}`) ?? { kind, value, ids: [] };
    if (!g.ids.includes(id)) g.ids.push(id);
    groups.set(`${kind}:${key}`, g);
  };
  for (const x of items) {
    const d = digits(x.phone);
    if (d.length === 10) add("phone", d, x.phone!, x.id);
    if (x.email?.trim()) add("email", x.email.trim().toLowerCase(), x.email.trim(), x.id);
    const n = norm(x.name);
    if (n.length > 3) add("name", n, x.name!.trim(), x.id);
  }
  return [...groups.values()].filter((g) => g.ids.length > 1);
}
