// HC-a (Fred 2026-10-31): the nightly diagnostic. Pure types and rules; the checks themselves are in checks.ts.
// The latest report lives in app_settings 'health'; the Home page shows a warning when something failed or
// when the report is older than STALE_HOURS (which also catches the timer itself being dead).

export type HealthCheck = { key: string; label: string; ok: boolean; detail: string | null; skipped?: boolean };
export type HealthReport = { ran_at: string; by: "tick" | "manual"; ms: number; checks: HealthCheck[] };

/** The nightly run is due once a day; after this many hours without one, the Home page says so. */
export const STALE_HOURS = 26;

export const hoursSince = (iso: string | null | undefined, now: number) => (iso ? (now - Date.parse(iso)) / 3_600_000 : Infinity);

/** What the Home page needs: is the report too old, and which checks failed (skipped ones never count). */
export function reportState(report: HealthReport | null, now: number): { stale: boolean; problems: HealthCheck[] } {
  if (!report) return { stale: true, problems: [] };
  return { stale: hoursSince(report.ran_at, now) > STALE_HOURS, problems: report.checks.filter((c) => !c.ok && !c.skipped) };
}
