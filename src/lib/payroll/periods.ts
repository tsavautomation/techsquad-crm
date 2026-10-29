// TC-e Pay periods (SPEC §9.1, Stage 3): which days a period covers and when it is paid. Pure; dates are
// plain "YYYY-MM-DD" strings in Eastern time, like the calendar helpers.
import { z } from "zod";
import { addDays } from "@/lib/schedule/dates";

export const FREQUENCIES = ["Biweekly", "Semi-monthly", "Monthly"] as const;
export type Frequency = (typeof FREQUENCIES)[number];
export const isFrequency = (x: unknown): x is Frequency => typeof x === "string" && (FREQUENCIES as readonly string[]).includes(x);

export const PayrollSettingsSchema = z.object({
  /** A Monday that starts one biweekly period; every other period is 14 days from it. */
  biweekly_anchor: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).default("2026-10-05"),
  /** Pay day = the period's last day + this many days, per frequency. */
  days_after: z.object({ Biweekly: z.number().int().min(0).max(31).default(5), "Semi-monthly": z.number().int().min(0).max(31).default(5), Monthly: z.number().int().min(0).max(31).default(5) }).default({ Biweekly: 5, "Semi-monthly": 5, Monthly: 5 }),
});
export type PayrollSettings = z.infer<typeof PayrollSettingsSchema>;

export function parsePayrollSettings(value: unknown): PayrollSettings {
  const r = PayrollSettingsSchema.safeParse(value ?? {});
  return r.success ? r.data : PayrollSettingsSchema.parse({});
}

export type Period = { frequency: Frequency; starts_on: string; ends_on: string; pay_day: string };

const dayNumber = (date: string) => Math.round(Date.UTC(Number(date.slice(0, 4)), Number(date.slice(5, 7)) - 1, Number(date.slice(8, 10))) / 86_400_000);
const monthEnd = (date: string) => {
  const [y, m] = date.split("-").map(Number);
  return addDays(`${y}-${String(m).padStart(2, "0")}-01`, new Date(Date.UTC(y, m, 0)).getUTCDate() - 1);
};

/** The period of `frequency` that contains `date`. */
export function periodFor(frequency: Frequency, date: string, settings: PayrollSettings): Period {
  let starts_on: string;
  let ends_on: string;
  if (frequency === "Biweekly") {
    const offset = dayNumber(date) - dayNumber(settings.biweekly_anchor);
    const k = Math.floor(offset / 14);
    starts_on = addDays(settings.biweekly_anchor, k * 14);
    ends_on = addDays(starts_on, 13);
  } else if (frequency === "Semi-monthly") {
    const first = `${date.slice(0, 7)}-01`;
    if (Number(date.slice(8, 10)) <= 15) {
      starts_on = first;
      ends_on = `${date.slice(0, 7)}-15`;
    } else {
      starts_on = `${date.slice(0, 7)}-16`;
      ends_on = monthEnd(date);
    }
  } else {
    starts_on = `${date.slice(0, 7)}-01`;
    ends_on = monthEnd(date);
  }
  return { frequency, starts_on, ends_on, pay_day: addDays(ends_on, settings.days_after[frequency]) };
}

export const nextPeriod = (p: Period, settings: PayrollSettings) => periodFor(p.frequency, addDays(p.ends_on, 1), settings);
export const previousPeriod = (p: Period, settings: PayrollSettings) => periodFor(p.frequency, addDays(p.starts_on, -1), settings);

/** The `n` most recent periods up to the one containing `date`, newest first. */
export function recentPeriods(frequency: Frequency, date: string, n: number, settings: PayrollSettings): Period[] {
  const out: Period[] = [];
  let p = periodFor(frequency, date, settings);
  for (let i = 0; i < n; i++) {
    out.push(p);
    p = previousPeriod(p, settings);
  }
  return out;
}

/** True once the period has ended (its last day is before `today`), so it can be approved. */
export const periodEnded = (p: Period, today: string) => p.ends_on < today;

/** Every date of the period, first to last. */
export function periodDates(p: Period): string[] {
  const out: string[] = [];
  for (let d = p.starts_on; d <= p.ends_on; d = addDays(d, 1)) out.push(d);
  return out;
}
