// FIN-m (Fred 2026-10-28): Luana's "Sales Projections" sheet, read into rows and planned into Transactions. Pure
// functions (tests/fin-sheet.test.ts); the import script and the Link action call them. The sheet's Invoice column
// carries the Portal.io proposal number, which is how a row meets the mirror and the Transactions already written.

export type SheetPayment = { month: string; amount: number }; // month 'yyyy-mm', or '2023' for the sheet's lump column
export type SheetRow = {
  number: string | null;
  main_number: number | null;
  change_order: number | null;
  year: number | null;
  date: string | null;
  customer: string | null;
  designer: string | null;
  commission: boolean;
  title: string | null;
  amount: number;
  payments: SheetPayment[];
  discount: number | null;
  cc_fee: number | null;
  tip: number | null;
  commission_amount: number | null;
  status: string | null;
  receivable: string | null;
  probability: string | null;
  notes: string | null;
  row_key: string;
};

type Cell = string | number | boolean | Date | null | undefined;

const num = (v: Cell): number | null => {
  if (v === null || v === undefined || v === "" || typeof v === "boolean") return null;
  const n = typeof v === "number" ? v : Number(String(v).replace(/[$,\s]/g, ""));
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
};
const str = (v: Cell): string | null => {
  if (v === null || v === undefined) return null;
  const s = (v instanceof Date ? v.toISOString().slice(0, 10) : String(v)).trim();
  return s || null;
};
const dateStr = (v: Cell): string | null => {
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  const s = str(v);
  if (!s) return null;
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return m[0];
  const us = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (us) return `${us[3].length === 2 ? "20" + us[3] : us[3]}-${us[1].padStart(2, "0")}-${us[2].padStart(2, "0")}`;
  return null;
};

/** "2357CO1" → main 2357, change order 1; "2732" → 2732; "Q8178388" → no Portal.io number. */
export function splitNumber(raw: string | null): { main_number: number | null; change_order: number | null } {
  const s = (raw ?? "").trim().toUpperCase();
  const m = s.match(/^(\d+)(?:CO(\d+))?$/);
  if (!m) return { main_number: null, change_order: null };
  return { main_number: Number(m[1]), change_order: m[2] ? Number(m[2]) : null };
}

/**
 * The month a payment column stands for. Luana typed "Jan-24" and Excel kept it as the 24th of January of the year she
 * typed it in, so the day is the year (24 → 2024) when it is one; "1/1/2026" is a real date and keeps its year.
 */
export function monthFromHeader(v: Cell): string | null {
  if (typeof v === "number" && v >= 2000 && v <= 2100) return String(v); // the "2023" lump column
  const s = v instanceof Date ? v.toISOString().slice(0, 10) : str(v);
  if (!s) return null;
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) {
    const day = Number(m[3]);
    const year = day > 12 && day < 100 ? 2000 + day : Number(m[1]);
    return `${year}-${m[2]}`;
  }
  const t = s.match(/^([A-Za-z]{3})-(\d{2})$/); // "Jan-24" as text
  if (t) {
    const idx = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"].indexOf(t[1].toLowerCase());
    if (idx >= 0) return `20${t[2]}-${String(idx + 1).padStart(2, "0")}`;
  }
  return null;
}

/** The title without its "2732-" prefix: "2732-The Alexander Group - 1611 W 24th" → "The Alexander Group - 1611 W 24th". */
export const cleanTitle = (title: string | null, number: string | null): string | null => {
  if (!title) return null;
  const t = title.trim();
  const n = (number ?? "").trim();
  const stripped = n && t.toUpperCase().startsWith(n.toUpperCase()) ? t.slice(n.length).replace(/^\s*[-–:]\s*/, "") : t;
  return stripped.trim() || t;
};

/**
 * Read the sheet: `header` is the row with "Year, Date, Customer, …" and `rows` the lines below it (cells by column
 * index, 0-based). Totals and empty lines are skipped. Column positions come from the header words, so a column
 * moved in the sheet still lands right; the payment months come from the date headers.
 */
export function parseSheet(header: Cell[], rows: Cell[][]): SheetRow[] {
  const col = (name: string) => header.findIndex((h) => str(h)?.toLowerCase() === name.toLowerCase());
  const c = { year: col("Year"), date: col("Date"), customer: col("Customer"), designer: col("Indicator/Designer"), commission: col("Comission"), number: col("Invoice"), title: col("Project"), amount: col("Amount"), discount: col("Discount"), fee: col("Credit Card Fee"), tip: col("Tip"), status: col("Status"), receivable: col("Receivable"), probability: col("Probability"), comm: col("Comm"), notes: col("Payment Notes") };
  const months: { i: number; month: string }[] = [];
  for (let i = (c.amount >= 0 ? c.amount : 0) + 1; i < header.length && (c.discount < 0 || i < c.discount); i++) {
    const m = monthFromHeader(header[i]);
    if (m) months.push({ i, month: m });
  }
  const out: SheetRow[] = [];
  const seen = new Map<string, number>(); // the sheet repeats a few lines (same number and title): #2, #3 keep them apart
  for (const r of rows) {
    const title = str(r[c.title]);
    const amount = num(r[c.amount]);
    const number = str(r[c.number]);
    if ((!title && !number) || amount === null) continue;
    if (/^total$/i.test(str(r[c.year]) ?? "") || /^total$/i.test(title ?? "")) continue;
    const payments: SheetPayment[] = [];
    for (const m of months) {
      const a = num(r[m.i]);
      if (a) payments.push({ month: m.month, amount: a });
    }
    const commissionCell = str(r[c.commission]);
    const key = `${(number ?? "").toUpperCase()}|${(title ?? "").toLowerCase().replace(/\s+/g, " ")}`;
    const n = (seen.get(key) ?? 0) + 1;
    seen.set(key, n);
    out.push({
      number,
      ...splitNumber(number),
      year: num(r[c.year]) ? Math.trunc(num(r[c.year])!) : null,
      date: dateStr(r[c.date]),
      customer: str(r[c.customer]),
      designer: str(r[c.designer]),
      commission: /^y/i.test(commissionCell ?? ""),
      title,
      amount,
      payments,
      discount: num(r[c.discount]),
      cc_fee: num(r[c.fee]),
      tip: num(r[c.tip]),
      commission_amount: num(r[c.comm]),
      status: str(r[c.status]),
      receivable: str(r[c.receivable]),
      probability: str(r[c.probability])?.toUpperCase() ?? null,
      notes: str(r[c.notes]),
      row_key: n > 1 ? `${key}#${n}` : key,
    });
  }
  return out;
}

// ---------------------------------------------------------------- the plan for one linked row

export type SheetExistingTx = { id: number; type: string; amount: number | null; date: string | null; portal_number: string | null; portal_proposal_id: number | null; portal_request_id: number | null; portal_change_order_id: number | null; is_change_order: boolean; sheet_ref: string | null; cc_fee: number | null; tip: number | null; discount: number | null };
export type SheetPlan = { create: Record<string, unknown>[]; update: { id: number; set: Record<string, unknown>; why: string }[]; notes: string[] };

const normNumber = (s: string | null | undefined) => (s ?? "").toUpperCase().replace(/[\s-]/g, "");
const same = (a: number | null | undefined, b: number) => Math.abs(Number(a ?? 0) - b) < 0.005;

/**
 * What linking a sheet row to a project writes. The proposal is adopted when the project already has one with the same
 * Portal.io number (the Portal.io sync or a person wrote it) or the same amount without any key; the payments are
 * adopted by amount too (the Portal.io sync dates a payment the day it saw it, the sheet knows the month, so an
 * adopted payment takes the sheet's month when its date is later). Keys: transactions.sheet_ref.
 */
export function planSheetLink(rowId: number, row: SheetRow, projectId: number, existing: SheetExistingTx[]): SheetPlan {
  const plan: SheetPlan = { create: [], update: [], notes: [] };
  const used = new Set<number>(existing.filter((t) => t.sheet_ref && !t.sheet_ref.startsWith(`${rowId}:`)).map((t) => t.id));
  const base = { payment_type: "Apply to Project", project_id: projectId, portal_number: (row.number ?? "").slice(0, 10) || null };
  const title = (cleanTitle(row.title, row.number) ?? `Proposal ${row.number ?? ""}`).slice(0, 100);
  // ---- the proposal
  const ref = `${rowId}:proposal`;
  const proposals = existing.filter((t) => t.type === "Proposal" && !used.has(t.id));
  const main = proposals.find((t) => t.sheet_ref === ref) ?? proposals.find((t) => row.number && normNumber(t.portal_number) === normNumber(row.number)) ?? proposals.find((t) => !t.sheet_ref && !t.portal_proposal_id && same(t.amount, row.amount)) ?? null;
  const parent = row.change_order ? existing.find((t) => t.type === "Proposal" && !t.is_change_order && normNumber(t.portal_number) === String(row.main_number)) ?? null : null;
  if (main) {
    used.add(main.id);
    const set: Record<string, unknown> = {};
    if (main.sheet_ref !== ref) set.sheet_ref = ref;
    if (row.change_order && !main.is_change_order) set.is_change_order = true;
    if (parent && main.id !== parent.id) set.parent_transaction_id = parent.id;
    if (Object.keys(set).length) plan.update.push({ id: main.id, set, why: "proposal" });
    if (!same(main.amount, row.amount)) plan.notes.push(`proposal kept at ${main.amount} (the sheet says ${row.amount})`);
  } else {
    plan.create.push({ ...base, type: "Proposal", description: title, amount: row.amount, date: row.date ?? (row.year ? `${row.year}-01-01` : null), is_change_order: Boolean(row.change_order), parent_transaction_id: parent?.id ?? null, sheet_ref: ref });
  }
  // ---- the payments, one per month typed
  const payments = existing.filter((t) => t.type === "Payment" && !used.has(t.id));
  let last: { id?: number; create?: Record<string, unknown> } | null = null;
  for (const p of [...row.payments].sort((a, b) => a.month.localeCompare(b.month))) {
    const pref = `${rowId}:${p.month}`;
    const date = p.month.length === 4 ? `${p.month}-12-31` : `${p.month}-01`;
    const label = p.month.length === 4 ? `Payments in ${p.month}` : `Payment · ${new Date(`${p.month}-15T12:00:00Z`).toLocaleString("en-US", { month: "short", year: "numeric", timeZone: "UTC" })}`;
    const ex = payments.find((t) => t.sheet_ref === pref) ?? payments.find((t) => !t.sheet_ref && same(t.amount, p.amount) && !used.has(t.id)) ?? null;
    if (ex) {
      used.add(ex.id);
      const set: Record<string, unknown> = {};
      if (ex.sheet_ref !== pref) set.sheet_ref = pref;
      if (ex.date && ex.date > `${p.month.length === 4 ? `${p.month}-12-31` : `${p.month}-31`}`) set.date = date; // dated the day the sync saw it: the sheet knows the month
      if (Object.keys(set).length) plan.update.push({ id: ex.id, set, why: `payment:${p.month}` });
      last = { id: ex.id };
    } else {
      const create = { ...base, type: "Payment", description: label, amount: p.amount, date, sheet_ref: pref };
      plan.create.push(create);
      last = { create };
    }
  }
  // ---- the row's discount, card fee and tip go on its last payment (a discount with no payment is a 0 payment)
  const extras: Record<string, number> = {};
  if (row.discount) extras.discount = row.discount;
  if (row.cc_fee) extras.cc_fee = row.cc_fee;
  if (row.tip) extras.tip = row.tip;
  if (Object.keys(extras).length) {
    if (last?.create) Object.assign(last.create, extras);
    else if (last?.id) {
      const ex = existing.find((t) => t.id === last!.id)!;
      const set: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(extras)) if (!(ex as unknown as Record<string, number | null>)[k]) set[k] = v;
      if (Object.keys(set).length) {
        const u = plan.update.find((x) => x.id === last!.id);
        if (u) Object.assign(u.set, set);
        else plan.update.push({ id: last.id, set, why: "payment extras" });
      }
    } else if (extras.discount) plan.create.push({ ...base, type: "Payment", description: "Discount", amount: 0, date: row.date, discount: extras.discount, sheet_ref: `${rowId}:discount` });
    else plan.notes.push("card fee / tip in the sheet but no payment to put them on");
  }
  return plan;
}
