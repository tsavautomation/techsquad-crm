// FIN (SPEC §9.1 FIN-b/FIN-c/FIN-e, Fred 2026-10-28): the money rules of the Low Voltage finance module, as pure
// functions over one row of project_financials(). One place for the rule; SQL only aggregates.

export type FinRow = {
  project_id: number;
  approved_amount: number | string;
  invoiced_amount: number | string;
  paid_amount: number | string;
  discount_amount: number | string;
  cc_fee_amount: number | string;
  tip_amount: number | string;
  sales_tax: number | string;
  parts_cost: number | string;
  /** Due dates (yyyy-mm-dd) of invoices not Paid / Declined, sorted. */
  open_invoice_dues: string[] | null;
  job_status: string | null;
  category: string | null;
  commission_percent: number | string | null;
  commission_amount: number | string | null;
};

export type FinancialStatus = "Paid" | "Delinquent" | "Past Due" | "Current" | "No data";
export const STATUSES: FinancialStatus[] = ["Past Due", "Delinquent", "Current", "Paid", "No data"];

export type Figures = {
  approved: number;
  invoiced: number;
  paid: number;
  discount: number;
  ccFees: number;
  tips: number;
  balance: number;
  paidPct: number | null;
  balancePct: number | null;
  salesTax: number;
  parts: number;
  /** Labor is not defined yet (FIN-e): always null, shown as "no labor". */
  labor: number | null;
  commission: number;
  profit: number;
  marginPct: number | null;
  onHold: boolean;
  nextDue: string | null;
  /** Days the oldest open invoice is late (after the grace), 0 when none. */
  daysLate: number;
};

const n = (v: number | string | null | undefined) => (v === null || v === undefined || v === "" ? 0 : Number(v)) || 0;
const cents = (x: number) => Math.round(x * 100) / 100;

/** Days from `a` to `b` (yyyy-mm-dd), b − a. */
export const daysBetween = (a: string, b: string) => Math.round((Date.UTC(+b.slice(0, 4), +b.slice(5, 7) - 1, +b.slice(8, 10)) - Date.UTC(+a.slice(0, 4), +a.slice(5, 7) - 1, +a.slice(8, 10))) / 86_400_000);

/** FIN-b: Balance = Approved − Paid − Discount; fees and tips never touch it. FIN-e: Profit = Approved − Tax − Parts − Labor − Commission. */
export function figures(row: FinRow, today: string): Figures {
  const approved = n(row.approved_amount);
  const paid = n(row.paid_amount);
  const discount = n(row.discount_amount);
  const balance = cents(approved - paid - discount);
  const salesTax = n(row.sales_tax);
  const parts = n(row.parts_cost);
  // Commission $ = Commission % × Approved (FIN-e); a typed Commission amount is used when no % is set.
  const pct = n(row.commission_percent);
  const commission = cents(pct > 0 ? (approved * pct) / 100 : n(row.commission_amount));
  const profit = cents(approved - salesTax - parts - commission);
  const dues = (row.open_invoice_dues ?? []).filter(Boolean);
  const oldest = dues[0] ?? null;
  return {
    approved,
    invoiced: n(row.invoiced_amount),
    paid,
    discount,
    ccFees: n(row.cc_fee_amount),
    tips: n(row.tip_amount),
    balance,
    paidPct: approved > 0 ? Math.round((paid / approved) * 1000) / 10 : null,
    balancePct: approved > 0 ? Math.round((balance / approved) * 1000) / 10 : null,
    salesTax,
    parts,
    labor: null,
    commission,
    profit,
    marginPct: approved > 0 ? Math.round((profit / approved) * 1000) / 10 : null,
    onHold: row.job_status === "ON HOLD",
    nextDue: dues.find((d) => d >= today) ?? oldest,
    daysLate: oldest && oldest < today ? daysBetween(oldest, today) : 0,
  };
}

/**
 * FIN-c, evaluated in this order: 1) Balance ≤ 0 → Paid; 2) Job Status Complete with a balance → Delinquent;
 * 3) an open invoice past Due Date + grace → Past Due; 4) otherwise Current. Nothing with money → No data.
 * Proposal Denied is never receivable.
 */
export function financialStatus(row: FinRow, graceDays: number, today: string): FinancialStatus {
  const f = figures(row, today);
  if (row.job_status === "Proposal Denied") return f.approved > 0 || f.invoiced > 0 ? "Paid" : "No data";
  if (f.approved <= 0 && f.invoiced <= 0 && f.paid <= 0) return "No data";
  if (f.balance <= 0) return "Paid";
  if (row.job_status === "Complete") return "Delinquent";
  if (f.daysLate > graceDays) return "Past Due";
  return "Current";
}

export const STATUS_TONE: Record<string, string> = {
  Paid: "bg-ok-bg text-ok-fg",
  Current: "bg-info-bg text-info-fg",
  "Past Due": "bg-warn-bg text-warn-fg",
  Delinquent: "bg-bad-bg text-bad-fg",
  Overdue: "bg-bad-bg text-bad-fg",
  "No data": "bg-muted text-text-2",
};

/** FIN-a: the Payment's order within its project by date, then id (1st, 2nd…). */
export function paymentNumbers(payments: { id: number; date: string | null }[]): Map<number, number> {
  const sorted = [...payments].sort((a, b) => (a.date ?? "").localeCompare(b.date ?? "") || a.id - b.id);
  return new Map(sorted.map((p, i) => [p.id, i + 1]));
}

export const ordinal = (k: number) => `${k}${k % 100 >= 11 && k % 100 <= 13 ? "th" : k % 10 === 1 ? "st" : k % 10 === 2 ? "nd" : k % 10 === 3 ? "rd" : "th"}`;

/**
 * FIN-d: the system's reliability suggestion from how late a client's invoices were paid (days after Due Date;
 * early or on time counts 0). ≤ 7 days on average → High, ≤ 30 → Medium, more → Low; nothing to go on → null.
 */
export function reliabilitySuggestion(daysLate: number[]): { level: "High" | "Medium" | "Low"; avgDays: number } | null {
  if (!daysLate.length) return null;
  const avg = Math.round(daysLate.reduce((a, b) => a + Math.max(0, b), 0) / daysLate.length);
  return { level: avg <= 7 ? "High" : avg <= 30 ? "Medium" : "Low", avgDays: avg };
}

/** Invoices due within 30 / 60 / 90 days from today (open ones only), for the dashboard. */
export function dueBuckets(dues: { due: string; amount: number }[], today: string): { d30: number; d60: number; d90: number; late: number } {
  const out = { d30: 0, d60: 0, d90: 0, late: 0 };
  for (const x of dues) {
    const d = daysBetween(today, x.due);
    if (d < 0) out.late += x.amount;
    else if (d <= 30) out.d30 += x.amount;
    else if (d <= 60) out.d60 += x.amount;
    else if (d <= 90) out.d90 += x.amount;
  }
  return out;
}
