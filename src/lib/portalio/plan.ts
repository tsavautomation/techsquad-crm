import { todayET } from "@/lib/dates";

// FIN Part 2 (Fred 2026-10-28, SPEC §9.1 FIN-i…FIN-k): what the Portal.io sync writes under a linked project, as a
// pure plan over the mirrored proposal and the Transactions that already exist. The applier (transactions.ts) only
// executes it. Keys are the Portal.io ids; the numbers (1740, 3166CO1) are informative. Nothing here decides which
// project a proposal belongs to (that is Link, PI-c, or the customer rule, FIN-l).

export type PortalItem = { id?: number; itemType?: string; brand?: string | null; model?: string | null; shortDescription?: string | null; description?: string | null; quantity?: number; cost?: number | null; sellPrice?: number | null; total?: { amount?: number } | null; supplier?: string | null };
export type PortalArea = { options?: { status?: string; items?: PortalItem[] }[] | null };
export type PlanRequest = { id: number | null; status: string | null; amount: number | null; dueDate: string | null; description: string | null; paymentMethod: string | null };
export type PlanChangeOrder = { id: number; number: number | null; name: string | null; status: string | null; total: number | null; decided_at: string | null; sales_tax: number | null; areas: PortalArea[] | null };
export type PlanProposal = { id: number; number: number | null; name: string | null; total: number | null; accepted_at: string | null; sales_tax: number | null; areas: PortalArea[] | null };

/** An existing "Apply to Project" Transaction of the project (every one, not deleted): the sync adopts rows typed by hand before it ran. */
export type ExistingTx = {
  id: number;
  type: string;
  date?: string | null;
  amount: number | null;
  description: string | null;
  invoice_status: string | null;
  due_date: string | null;
  due_date_edited_at: string | null;
  parent_transaction_id: number | null;
  sales_tax: number | null;
  parts_cost: number | null;
  portal_proposal_id: number | null;
  portal_change_order_id: number | null;
  portal_request_id: number | null;
  portal_synced: Record<string, unknown> | null;
};

export type TxValues = Record<string, unknown> & { type: "Proposal" | "Invoice" | "Payment"; portal_synced: Record<string, unknown> };
export type ItemRow = { portal_item_id: number | null; item_type: string | null; brand: string | null; model: string | null; name: string | null; description: string | null; quantity: number | null; cost: number | null; sell_price: number | null; total: number | null; supplier: string | null };
export type Plan = {
  /** Rows to insert (the main proposal first, so change orders can point at it). */
  create: { key: "main" | "co" | "invoice" | "payment"; values: TxValues }[];
  update: { id: number; set: Record<string, unknown>; why: string }[];
  /** Items by transaction: the main proposal ("main") and each change order ("co:<id>"), replaced in full. */
  items: { key: string; rows: ItemRow[] }[];
  /** What a person changed and the sync therefore left alone. */
  kept: string[];
};

export const ACCEPTED_STATUSES = ["Accepted", "Completed"];
/** Payment requests the office never sees as an invoice: not sent (Draft) or withdrawn. */
const SKIP_REQUEST = new Set(["Draft", "Cancelled", "Canceled", "Refunded"]);
const METHODS: Record<string, string> = { creditcard: "Credit Card", "credit card": "Credit Card", ach: "ACH", "wire transfer": "Wire", wire: "Wire", check: "Check", cash: "Cash", zelle: "Zelle" };

/** Portal.io payment method → the Transaction Method option (unknown words become Other, nothing stays null). */
export function mapMethod(m: string | null | undefined): string | null {
  const k = (m ?? "").trim().toLowerCase();
  if (!k) return null;
  return METHODS[k] ?? "Other";
}

/** A Portal.io timestamp → the Eastern date (yyyy-mm-dd); already a date stays as it is. */
export function dateET(iso: string | null | undefined): string | null {
  if (!iso) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : todayET(d);
}

const r2 = (n: number) => Math.round(n * 100) / 100;
const sameMoney = (a: number | null | undefined, b: number | null | undefined) => (a ?? null) === null && (b ?? null) === null ? true : Number(a ?? NaN) === Number(b ?? NaN);

/** The items of the accepted options (a Draft option is an alternative the client did not take); every option when none is marked. */
export function acceptedItems(areas: PortalArea[] | null | undefined): PortalItem[] {
  const options = (areas ?? []).flatMap((a) => a.options ?? []);
  const accepted = options.filter((o) => (o.status ?? "") === "Accepted");
  return (accepted.length ? accepted : options).flatMap((o) => o.items ?? []);
}

/** FIN-e Parts = Σ cost × quantity of Part + CustomItem lines; Labor and Fee lines stay out. Null when no line has a cost. */
export function partsCost(items: PortalItem[]): number | null {
  let sum = 0;
  let any = false;
  for (const i of items) {
    if (!["Part", "CustomItem"].includes(i.itemType ?? "")) continue;
    if (i.cost === null || i.cost === undefined) continue;
    any = true;
    sum += Number(i.cost) * Number(i.quantity ?? 1);
  }
  return any ? r2(sum) : null;
}

export const itemRows = (items: PortalItem[]): ItemRow[] =>
  items.map((i) => ({
    portal_item_id: i.id ?? null,
    item_type: i.itemType ?? null,
    brand: i.brand ?? null,
    model: i.model ?? null,
    name: (i.shortDescription ?? i.description ?? "").slice(0, 200) || null,
    description: i.description ?? null,
    quantity: i.quantity ?? null,
    cost: i.cost ?? null,
    sell_price: i.sellPrice ?? null,
    total: i.total?.amount ?? null,
    supplier: i.supplier ?? null,
  }));

/** Portal.io own change-order number: <main>CO<n>. */
export const changeOrderNumber = (main: number | null, n: number | null, coId: number) => `${main ?? ""}CO${n ?? coId}`.slice(0, 10);

/** True when the person left the field as the sync wrote it (or the sync never wrote it): then the sync may write again. */
export function syncOwns(tx: ExistingTx, field: "amount" | "description" | "invoice_status" | "due_date"): boolean {
  if (field === "due_date") return !tx.due_date_edited_at;
  const synced = tx.portal_synced;
  if (!synced || !(field in synced)) return true;
  const cur = tx[field];
  const was = synced[field];
  return field === "amount" ? Number(cur ?? 0) === Number(was ?? 0) : (cur ?? "") === (was ?? "");
}

/**
 * A row typed by hand (or imported from the spreadsheet) with no Portal.io id, the same type and the same amount is the
 * same money: the sync adopts it (keys it) instead of creating a twin. The most recent one when there are several.
 */
export function adoptable(existing: ExistingTx[], type: string, amount: number, used: Set<number>): ExistingTx | null {
  const rows = existing.filter((t) => t.type === type && !used.has(t.id) && t.portal_proposal_id === null && t.portal_request_id === null && Math.abs(Number(t.amount ?? 0) - amount) < 0.005);
  rows.sort((a, b) => (b.date ?? "").localeCompare(a.date ?? "") || b.id - a.id);
  return rows[0] ?? null;
}

const base = (projectId: number, number: number | null) => ({ payment_type: "Apply to Project", project_id: projectId, portal_number: String(number ?? "").slice(0, 10) || null });

/**
 * The plan. `mainId` is the Transaction already linked (PI-c) when there is one: its Amount and Description belong to
 * Refresh / Replace / Keep as is (PI-e), so the sync only completes its ids, Sales Tax, Parts and items.
 */
export function planTransactions(input: { projectId: number; proposal: PlanProposal; changeOrders: PlanChangeOrder[]; requests: PlanRequest[]; mainId: number | null; existing: ExistingTx[]; today?: string }): Plan {
  const { projectId, proposal: p, existing } = input;
  const today = input.today ?? todayET();
  const plan: Plan = { create: [], update: [], items: [], kept: [] };
  const num = base(projectId, p.number);
  const used = new Set<number>();

  // ---- the main proposal
  const mainItems = acceptedItems(p.areas);
  const parts = partsCost(mainItems);
  const main = existing.find((t) => t.id === input.mainId) ?? existing.find((t) => t.type === "Proposal" && t.portal_proposal_id === p.id && t.portal_change_order_id === null) ?? null;
  if (main) used.add(main.id);
  for (const t of existing) if (t.portal_proposal_id !== null || t.portal_request_id !== null) used.add(t.id);
  if (main) {
    const set: Record<string, unknown> = {};
    if (main.portal_proposal_id !== p.id) set.portal_proposal_id = p.id;
    if (main.parent_transaction_id !== null) set.parent_transaction_id = null;
    if (!sameMoney(main.sales_tax, p.sales_tax)) set.sales_tax = p.sales_tax;
    if (!sameMoney(main.parts_cost, parts)) set.parts_cost = parts;
    if (Object.keys(set).length) plan.update.push({ id: main.id, set, why: "main" });
  } else {
    const amount = r2(Number(p.total ?? 0));
    const description = (p.name ?? `Portal.io proposal #${p.number ?? p.id}`).slice(0, 100);
    plan.create.push({ key: "main", values: { ...num, type: "Proposal", description, amount, date: dateET(p.accepted_at) ?? today, is_change_order: false, sales_tax: p.sales_tax, parts_cost: parts, portal_proposal_id: p.id, portal_synced: { amount, description } } });
  }
  plan.items.push({ key: "main", rows: itemRows(mainItems) });

  // ---- change orders the client accepted: children of the main proposal, their own Amount (they add to Approved)
  for (const co of input.changeOrders) {
    if (!ACCEPTED_STATUSES.includes(co.status ?? "")) continue;
    const items = acceptedItems(co.areas);
    const coParts = co.areas ? partsCost(items) : null;
    const amount = r2(Number(co.total ?? 0));
    const description = (co.name ?? `Change Order #${co.number ?? co.id}`).slice(0, 100);
    const keyed = existing.find((t) => t.type === "Proposal" && t.portal_proposal_id === p.id && t.portal_change_order_id === co.id);
    const adopted = keyed ? null : adoptable(existing, "Proposal", amount, used);
    const ex = keyed ?? adopted;
    if (ex) {
      used.add(ex.id);
      const set: Record<string, unknown> = {};
      if (adopted) Object.assign(set, { portal_proposal_id: p.id, portal_change_order_id: co.id, is_change_order: true, portal_number: changeOrderNumber(p.number, co.number, co.id) });
      if (!sameMoney(ex.sales_tax, co.sales_tax)) set.sales_tax = co.sales_tax;
      if (co.areas && !sameMoney(ex.parts_cost, coParts)) set.parts_cost = coParts;
      if (Number(ex.amount ?? 0) !== amount) {
        if (syncOwns(ex, "amount")) set.amount = amount;
        else plan.kept.push(`change order #${co.number ?? co.id}: Amount edited here (${ex.amount})`);
      }
      if ((ex.description ?? "") !== description) {
        if (syncOwns(ex, "description")) set.description = description;
        else plan.kept.push(`change order #${co.number ?? co.id}: Description edited here`);
      }
      const synced = { ...(ex.portal_synced ?? {}), amount, description };
      if (Object.keys(set).length || JSON.stringify(ex.portal_synced ?? null) !== JSON.stringify(synced)) plan.update.push({ id: ex.id, set: { ...set, portal_synced: synced }, why: `co:${co.id}` });
    } else {
      plan.create.push({ key: "co", values: { ...num, portal_number: changeOrderNumber(p.number, co.number, co.id), type: "Proposal", description, amount, date: dateET(co.decided_at) ?? dateET(p.accepted_at) ?? today, is_change_order: true, sales_tax: co.sales_tax, parts_cost: coParts, portal_proposal_id: p.id, portal_change_order_id: co.id, portal_synced: { amount, description } } });
    }
    if (co.areas) plan.items.push({ key: `co:${co.id}`, rows: itemRows(items) });
  }

  // ---- payment requests → Invoices; paid ones → a Payment as well (Amount only: the fee, tip and paid date are not in the API)
  for (const r of input.requests) {
    if (r.id === null || SKIP_REQUEST.has(r.status ?? "")) continue;
    const amount = r2(Number(r.amount ?? 0));
    const description = (r.description ?? `Payment request for Proposal #${p.number ?? p.id}`).slice(0, 100);
    const status = r.status ?? null;
    const due = dateET(r.dueDate);
    const keyedInv = existing.find((t) => t.type === "Invoice" && t.portal_request_id === r.id);
    const adoptedInv = keyedInv || status === "Declined" ? null : adoptable(existing, "Invoice", amount, used);
    const inv = keyedInv ?? adoptedInv;
    if (inv) {
      used.add(inv.id);
      const set: Record<string, unknown> = {};
      if (adoptedInv) set.portal_request_id = r.id;
      if (Number(inv.amount ?? 0) !== amount) {
        if (syncOwns(inv, "amount")) set.amount = amount;
        else plan.kept.push(`invoice ${description}: Amount edited here (${inv.amount})`);
      }
      if ((inv.invoice_status ?? "") !== (status ?? "")) {
        if (syncOwns(inv, "invoice_status")) set.invoice_status = status;
        else plan.kept.push(`invoice ${description}: Status edited here (${inv.invoice_status})`);
      }
      if (due && inv.due_date !== due) {
        if (syncOwns(inv, "due_date")) set.due_date = due;
        else plan.kept.push(`invoice ${description}: Due Date moved here to ${inv.due_date}`);
      }
      const synced = { ...(inv.portal_synced ?? {}), amount, invoice_status: status, due_date: due };
      if (Object.keys(set).length || JSON.stringify(inv.portal_synced ?? null) !== JSON.stringify(synced)) plan.update.push({ id: inv.id, set: { ...set, portal_synced: synced }, why: `invoice:${r.id}` });
    } else if (status !== "Declined") {
      plan.create.push({ key: "invoice", values: { ...num, type: "Invoice", description, amount, date: today, due_date: due, invoice_status: status, portal_request_id: r.id, portal_synced: { amount, invoice_status: status, due_date: due } } });
    }
    if (status === "Paid" && !existing.some((t) => t.type === "Payment" && t.portal_request_id === r.id)) {
      const pay = adoptable(existing, "Payment", amount, used);
      if (pay) {
        // Typed from the bank statement before the sync ran (or imported from the sheet): same money, keep the date and fee typed there.
        used.add(pay.id);
        plan.update.push({ id: pay.id, set: { portal_request_id: r.id, portal_synced: { ...(pay.portal_synced ?? {}), amount } }, why: `payment:${r.id}` });
      } else
      // The API says paid, not when: the date is the day the CRM saw it (the office corrects it from the bank statement).
      plan.create.push({ key: "payment", values: { ...num, type: "Payment", description: `Payment · ${description}`.slice(0, 100), amount, date: today, method: mapMethod(r.paymentMethod), portal_request_id: r.id, portal_synced: { amount } } });
    }
  }
  return plan;
}

/**
 * FIN-l: the one project a new accepted proposal may be linked to by itself: the only project carrying the proposal
 * Portal.io customer, when no stronger sign (a Transaction with the Portal #, the owner e-mail, the job address)
 * points somewhere else. Anything less certain goes to the review queue.
 */
export function autoLinkCandidate(customerId: number | null | undefined, projectsOfCustomer: number[], suggestions: { id: number; score: number }[]): number | null {
  if (!customerId || projectsOfCustomer.length !== 1) return null;
  const only = projectsOfCustomer[0];
  if (suggestions.some((s) => s.id !== only && s.score >= 85)) return null;
  return only;
}
