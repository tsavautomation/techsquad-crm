// TC-f Pay periods (SPEC §9.1, Stage 3): one person's line in a period from their shifts and pay-rate history.
// Pure, unit-tested; the page and the export both use it. Money is cents-rounded.
import { rateAt, type RateRow } from "@/lib/costing/engine";
import type { Shift } from "@/lib/time-clock/timesheet";

export type PtoDay = { day: string; minutes: number };

export type PayLine = {
  minutes: number;
  ptoMinutes: number;
  /** hours × the rate in force on each day; null when a worked day had no rate. */
  amount: number | null;
  /** The rates used in date order, "$25.00" or "$25.00 → $27.00"; "" when none applied. */
  rateText: string;
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

export function payLine(shifts: Shift[], rates: RateRow[], pto: PtoDay[] = [], adjustments = 0): PayLine {
  let amount = 0;
  let complete = true;
  const missing = new Set<string>();
  const used = new Map<string, number>();
  const charge = (day: string, minutes: number) => {
    if (minutes <= 0) return;
    const rate = rateAt(rates, day);
    if (rate === null) {
      complete = false;
      missing.add(day);
      return;
    }
    used.set(day, rate);
    amount += (minutes / 60) * rate;
  };
  for (const s of shifts) charge(s.day, s.minutes);
  for (const p of pto) charge(p.day, p.minutes);
  const minutes = shifts.reduce((n, s) => n + s.minutes, 0);
  const ptoMinutes = pto.reduce((n, p) => n + p.minutes, 0);
  const sequence: number[] = [];
  for (const day of [...used.keys()].sort()) {
    const r = used.get(day)!;
    if (sequence.at(-1) !== r) sequence.push(r);
  }
  const amt = complete ? cents(amount) : null;
  return {
    minutes,
    ptoMinutes,
    amount: amt,
    rateText: sequence.map((r) => money.format(r)).join(" → "),
    missingRateDays: [...missing].sort(),
    toReview: shifts.filter((s) => s.needsReview).length,
    adjustments: cents(adjustments),
    total: amt === null ? null : cents(amt + adjustments),
  };
}

/** Hours as a decimal with two places for the export (525 → 8.75). */
export const hours = (minutes: number) => Math.round((minutes / 60) * 100) / 100;

/** The CSV of a period: one line per person; Excel-friendly (BOM, CRLF). */
export function periodCsv(rows: { name: string; frequency: string; period: string; line: PayLine; weeks?: string; approvedBy?: string }[]): string {
  const esc = (v: string | number) => {
    const s = String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const head = ["Name", "Pay frequency", "Period", "Hours", "PTO hours", "Rate", "Amount", "Adjustments", "Total", "Needs review", "Weeks approved", "Approved by"];
  const lines = rows.map((r) => [r.name, r.frequency, r.period, hours(r.line.minutes), hours(r.line.ptoMinutes), r.line.rateText, r.line.amount ?? "", r.line.adjustments, r.line.total ?? "", r.line.toReview, r.weeks ?? "", r.approvedBy ?? ""].map(esc).join(","));
  return `﻿${[head.join(","), ...lines].join("\r\n")}\r\n`;
}
