// Repeating visits (F1): the start times of a series, keeping the same Eastern wall-clock time
// across daylight-saving changes. Pure, so it is unit-tested.
import { fromDateTimeLocalET, toDateTimeLocalET } from "@/lib/dates";

export type RepeatRule = "weekly" | "biweekly" | "monthly" | "quarterly" | "semiannual" | "yearly";

const DAYS: Partial<Record<RepeatRule, number>> = { weekly: 7, biweekly: 14 };
const MONTHS: Partial<Record<RepeatRule, number>> = { monthly: 1, quarterly: 3, semiannual: 6, yearly: 12 };

export const MAX_SERIES = 24;

/** All start times of a series of `count` visits (the first one included). */
export function seriesStarts(firstIso: string, rule: RepeatRule, count: number): string[] {
  const n = Math.max(1, Math.min(MAX_SERIES, Math.floor(count)));
  const local = toDateTimeLocalET(firstIso); // "2026-10-05T09:00"
  const [date, time] = local.split("T");
  const [y, m, d] = date.split("-").map(Number);
  const out: string[] = [];
  for (let i = 0; i < n; i++) {
    let dt: Date;
    if (DAYS[rule]) dt = new Date(Date.UTC(y, m - 1, d + DAYS[rule]! * i));
    else {
      // Same day of the month, or the month's last day (Jan 31 → Feb 28).
      const target = new Date(Date.UTC(y, m - 1 + MONTHS[rule]! * i, 1));
      const last = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
      dt = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth(), Math.min(d, last)));
    }
    out.push(fromDateTimeLocalET(`${dt.toISOString().slice(0, 10)}T${time}`));
  }
  return out;
}
