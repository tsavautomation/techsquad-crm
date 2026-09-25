// When scheduled automations are due (SPEC §5 'daily' / 'hourly', PLAN M11). Pure, so it is time-travel tested.
//
// A timer (Supabase pg_cron, every hour; Vercel Cron once a day as a backup) calls /api/cron/tick.
// Each run has a key per Eastern-time slot, claimed once in public.scheduled_runs, so extra or
// late calls never run a slot twice, and the first call after midnight ET runs "daily".
import { TIME_ZONE } from "@/lib/dates";

/** Eastern-time date (YYYY-MM-DD) and hour (00–23) of a moment. */
export function etSlot(now: Date): { date: string; hour: string } {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23" })
      .formatToParts(now)
      .map((x) => [x.type, x.value]),
  );
  return { date: `${p.year}-${p.month}-${p.day}`, hour: p.hour };
}

/** The run keys for a moment: one daily key per ET date, one hourly key per ET hour. */
export function runKeys(now: Date): { daily: string; hourly: string } {
  const { date, hour } = etSlot(now);
  return { daily: `daily:${date}`, hourly: `hourly:${date}T${hour}` };
}
