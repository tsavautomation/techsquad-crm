// F19-e Tech scorecards (Fred 2026-10-05): per technician, per week and month. Pure: the loader gathers
// the rows, this file counts. Tested in tests/f19-scorecard.test.ts.

export type ScoreReport = {
  date: string | null;
  /** On time / late / missing come from the Visit = Report rule (F18). */
  status: "on_time" | "late" | "missing";
  /** Fields that make a report complete: text long enough, Result, Materials used, Problems found, a photo. */
  completeness: { text: boolean; result: boolean; materials: boolean; problems: boolean; photo: boolean } | null;
  result: string | null;
  mismatches: number;
};

export type Scorecard = {
  visits: number;
  onTime: number;
  late: number;
  missing: number;
  /** 0–100 share of reports filed on time. */
  onTimePct: number | null;
  /** 0–100 average share of the five completeness fields filled. */
  completeness: number | null;
  /** Reports whose Result was Partial or Not done (a return was needed). */
  callbacks: number;
  /** Reports with at least one report-vs-reality warning. */
  mismatches: number;
  openPending: number;
};

export type Period = { from: string; to: string };

/** The Eastern Monday-to-Sunday week and the month around `today` (YYYY-MM-DD), plus last month. */
export function periods(today: string): { week: Period; month: Period; lastMonth: Period } {
  const [y, m, d] = today.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  const dow = (dt.getUTCDay() + 6) % 7; // Monday = 0
  const monday = new Date(dt);
  monday.setUTCDate(dt.getUTCDate() - dow);
  const sunday = new Date(monday);
  sunday.setUTCDate(monday.getUTCDate() + 6);
  const iso = (x: Date) => x.toISOString().slice(0, 10);
  const monthStart = new Date(Date.UTC(y, m - 1, 1));
  const monthEnd = new Date(Date.UTC(y, m, 0));
  const lastStart = new Date(Date.UTC(y, m - 2, 1));
  const lastEnd = new Date(Date.UTC(y, m - 1, 0));
  return { week: { from: iso(monday), to: iso(sunday) }, month: { from: iso(monthStart), to: iso(monthEnd) }, lastMonth: { from: iso(lastStart), to: iso(lastEnd) } };
}

export function inPeriod(date: string | null, p: Period): boolean {
  return Boolean(date && date >= p.from && date <= p.to);
}

/** The scorecard for one person over the reports (one per visit owed) that fall in the period. */
export function scorecard(reports: ScoreReport[], openPending: number): Scorecard {
  const onTime = reports.filter((r) => r.status === "on_time").length;
  const late = reports.filter((r) => r.status === "late").length;
  const missing = reports.filter((r) => r.status === "missing").length;
  const filed = reports.filter((r) => r.completeness);
  const completeness = filed.length ? Math.round((filed.reduce((n, r) => n + Object.values(r.completeness!).filter(Boolean).length / 5, 0) / filed.length) * 100) : null;
  return {
    visits: reports.length,
    onTime,
    late,
    missing,
    onTimePct: reports.length ? Math.round((onTime / reports.length) * 100) : null,
    completeness,
    callbacks: reports.filter((r) => r.result === "Partial" || r.result === "Not done").length,
    mismatches: reports.filter((r) => r.mismatches > 0).length,
    openPending,
  };
}
