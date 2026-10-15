// ADM-b Usage: the pure arithmetic of a heartbeat. The browser pings while the person is active; each ping
// credits the time since the previous one, capped, so an open tab left alone stops counting after one gap.

/** Browser pings every minute while active; a gap longer than this is not credited beyond the cap. */
export const PING_EVERY_MS = 60_000;
/** The most one ping may credit (covers a slow network, a tab that just woke up). */
export const CREDIT_CAP_S = 180;
/** A pause longer than this starts a new session ("logged in again"). */
export const SESSION_GAP_S = 30 * 60;

export type UsageDay = { first_at: string; last_at: string; active_seconds: number; sessions: number; pages: number };

/** The day row after a ping at `now`; `page` is true when a page was opened (navigation), false for a plain heartbeat. */
export function applyPing(row: UsageDay | null, now: Date, page: boolean): UsageDay {
  const iso = now.toISOString();
  if (!row) return { first_at: iso, last_at: iso, active_seconds: 0, sessions: 1, pages: page ? 1 : 0 };
  const gap = Math.max(0, Math.round((now.getTime() - Date.parse(row.last_at)) / 1000));
  return {
    first_at: row.first_at,
    last_at: iso,
    active_seconds: row.active_seconds + Math.min(gap, CREDIT_CAP_S),
    sessions: row.sessions + (gap > SESSION_GAP_S ? 1 : 0),
    pages: row.pages + (page ? 1 : 0),
  };
}

/** 2h 05m, 35m, 0m. */
export function formatMinutes(seconds: number): string {
  const m = Math.round(seconds / 60);
  if (m < 60) return `${m}m`;
  return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, "0")}m`;
}

export type UsageTotals = { seconds: number; sessions: number; days: number; pages: number };

/** Totals over a set of day rows. */
export function sumUsage(rows: { active_seconds: number; sessions: number; pages: number }[]): UsageTotals {
  return rows.reduce((t, r) => ({ seconds: t.seconds + r.active_seconds, sessions: t.sessions + r.sessions, days: t.days + 1, pages: t.pages + r.pages }), { seconds: 0, sessions: 0, days: 0, pages: 0 });
}
