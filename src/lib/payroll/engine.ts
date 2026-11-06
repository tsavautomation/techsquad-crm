// TC-f Pay periods (SPEC §9.1, Stage 3): one person's line in a period from their shifts and pay-rate history.
// Pure, unit-tested; the page and the export both use it. Money is cents-rounded.
// OT (Fred 2026-11-05): each day is split into Regular / Overtime by the limit in force (overtime.ts), the overtime
// minutes take the person's overtime rate, and the days inside a work trip earn the premium %.
import { rateAt, type RateRow } from "@/lib/costing/engine";
import type { Shift } from "@/lib/time-clock/timesheet";
import { DEFAULT_DAILY_MIN, payDay, splitDays, type DayLimit, type DayPay, type Trip } from "./overtime";

export type PtoDay = { day: string; minutes: number };

export type PayLine = {
  minutes: number;
  /** OT: the split of `minutes`. */
  regularMinutes: number;
  overtimeMinutes: number;
  ptoMinutes: number;
  /** hours × the rate in force on each day; null when a worked day had no rate. */
  amount: number | null;
  /** The rates used in date order, "$25.00" or "$25.00 → $27.00"; "" when none applied. */
  rateText: string;
  /** OT: the overtime rates used, the same way; "" when no day had overtime. */
  overtimeRateText: string;
  /** OT: days with overtime but no overtime rate (paid at the pay rate; a warning on the screen). */
  missingOvertimeRateDays: string[];
  /** OT: the work-trip premium included in `amount`, and the worked days inside a trip. */
  premiumAmount: number;
  tripDays: number;
  /** Days with hours but no pay rate (the amount is incomplete). */
  missingRateDays: string[];
  /** Flagged shifts nobody has reviewed: the period can't be approved while any remain. */
  toReview: number;
  /** Corrections of earlier locked periods paid in this one. */
  adjustments: number;
  /** amount + adjustments, or null while the amount is incomplete. */
  total: number | null;
};

export const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const cents = (n: number) => Math.round(n * 100) / 100;

export type PayOptions = {
  /** The person's overtime rates (history); none → overtime is paid at the pay rate and flagged. */
  overtimeRates?: RateRow[];
  /** The daily / weekly limit in force on a day; default 9 h a day, no weekly limit. */
  limitFor?: (day: string) => DayLimit;
  /** The person's work trips. */
  trips?: Trip[];
};

const DEFAULT_LIMIT: DayLimit = { daily: DEFAULT_DAILY_MIN, weekly: null };

/** The rates in date order as "$25.00 → $27.00". */
function sequenceText(used: Map<string, number>): string {
  const sequence: number[] = [];
  for (const day of [...used.keys()].sort()) {
    const r = used.get(day)!;
    if (sequence.at(-1) !== r) sequence.push(r);
  }
  return sequence.map((r) => money.format(r)).join(" → ");
}

/** OT: every worked day of the line, split and paid (what the per-day tests and the screens read). */
export function payDays(shifts: Shift[], rates: RateRow[], opts: PayOptions = {}): DayPay[] {
  return splitDays(shifts, opts.limitFor ?? (() => DEFAULT_LIMIT)).map((d) => payDay(d, rates, opts.overtimeRates ?? [], opts.trips ?? []));
}

export function payLine(shifts: Shift[], rates: RateRow[], pto: PtoDay[] = [], adjustments = 0, opts: PayOptions = {}): PayLine {
  let amount = 0;
  let premium = 0;
  let complete = true;
  const missing = new Set<string>();
  const used = new Map<string, number>();
  const usedOt = new Map<string, number>();
  const missingOt = new Set<string>();
  const days = payDays(shifts, rates, opts);
  let tripDays = 0;
  for (const d of days) {
    if (d.rate === null || d.base === null) {
      complete = false;
      missing.add(d.day);
      continue;
    }
    used.set(d.day, d.rate);
    if (d.overtime > 0 && d.overtimeRate !== null) usedOt.set(d.day, d.overtimeRate);
    if (d.missingOvertimeRate) missingOt.add(d.day);
    if (d.premiumPct > 0) tripDays++;
    amount += d.base + d.premium;
    premium += d.premium;
  }
  for (const p of pto) {
    if (p.minutes <= 0) continue;
    const rate = rateAt(rates, p.day);
    if (rate === null) {
      complete = false;
      missing.add(p.day);
      continue;
    }
    used.set(p.day, rate);
    amount += (p.minutes / 60) * rate;
  }
  const minutes = shifts.reduce((n, s) => n + s.minutes, 0);
  const ptoMinutes = pto.reduce((n, p) => n + p.minutes, 0);
  const amt = complete ? cents(amount) : null;
  return {
    minutes,
    regularMinutes: days.reduce((n, d) => n + d.regular, 0),
    overtimeMinutes: days.reduce((n, d) => n + d.overtime, 0),
    ptoMinutes,
    amount: amt,
    rateText: sequenceText(used),
    overtimeRateText: sequenceText(usedOt),
    missingOvertimeRateDays: [...missingOt].sort(),
    premiumAmount: cents(premium),
    tripDays,
    missingRateDays: [...missing].sort(),
    toReview: shifts.filter((s) => s.needsReview).length,
    adjustments: cents(adjustments),
    total: amt === null ? null : cents(amt + adjustments),
  };
}

/** Hours as a decimal with two places for the export (525 → 8.75). */
export const hours = (minutes: number) => Math.round((minutes / 60) * 100) / 100;

/** The CSV of a period: one line per person; Excel-friendly (BOM, CRLF). */
export function periodCsv(rows: { name: string; frequency: string; period: string; line: PayLine; timesheet?: string; approvedBy?: string }[]): string {
  const esc = (v: string | number) => {
    const s = String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const head = ["Name", "Pay schedule", "Period", "Hours", "Regular hours", "Overtime hours", "PTO hours", "Rate", "Overtime rate", "Trip premium", "Amount", "Adjustments", "Total", "Needs review", "Timesheet", "Approved by"];
  const lines = rows.map((r) => [r.name, r.frequency, r.period, hours(r.line.minutes), hours(r.line.regularMinutes), hours(r.line.overtimeMinutes), hours(r.line.ptoMinutes), r.line.rateText, r.line.overtimeRateText, r.line.premiumAmount, r.line.amount ?? "", r.line.adjustments, r.line.total ?? "", r.line.toReview, r.timesheet ?? "", r.approvedBy ?? ""].map(esc).join(","));
  return `﻿${[head.join(","), ...lines].join("\r\n")}\r\n`;
}
