import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getChangeOrder, type ChangeOrderDetail, type PortalSettings } from "./client";
import { planTransactions, type ExistingTx, type Plan, type PlanChangeOrder, type PortalArea } from "./plan";
import type { ProposalRow } from "./sync";

// FIN Part 2 (SPEC §9.1 FIN-i…FIN-k): apply the plan for one linked proposal. Writes go through the service role
// (the audit trigger records them without an actor, like the other engines); a History line on the project says
// what the sync did. Idempotent: a second run over the same data plans nothing.

export type TxSyncSummary = { proposalId: number; created: { main: number; co: number; invoice: number; payment: number }; updated: number; kept: string[]; errors: string[] };

type LinkedRow = Pick<ProposalRow, "id" | "number" | "name" | "total" | "accepted_at" | "financial" | "payment_requests" | "change_orders" | "project_id" | "transaction_id" | "link_status" | "customer"> & { detail: { areas?: PortalArea[] | null } | null; change_order_details: Record<string, ChangeOrderDetail> | null };

const LINKED_COLS = "id, number, name, total, accepted_at, financial, payment_requests, change_orders, project_id, transaction_id, link_status, customer, detail, change_order_details";
const TX_COLS = "id, type, date, amount, description, invoice_status, due_date, due_date_edited_at, parent_transaction_id, sales_tax, parts_cost, portal_proposal_id, portal_change_order_id, portal_request_id, portal_synced";

/** FIN-i: read the accepted change orders the mirror has not read yet (or that changed), for their items and tax. */
export async function fetchChangeOrderDetails(db: SupabaseClient, s: PortalSettings, row: LinkedRow): Promise<Record<string, ChangeOrderDetail>> {
  const have = { ...(row.change_order_details ?? {}) };
  let changed = false;
  for (const co of row.change_orders ?? []) {
    if (!["Accepted", "Completed"].includes(co.status ?? "")) continue;
    const prev = have[String(co.id)];
    if (prev && Number(prev.financialSummary?.changeOrderTotal ?? prev.total?.changeOrderTotal ?? 0) === Number(co.total ?? 0)) continue;
    try {
      have[String(co.id)] = await getChangeOrder(s.user_key, row.id, co.id);
      changed = true;
    } catch {
      // Left for the next run; the change order still gets its Transaction from the summary (amount, name).
    }
  }
  if (changed) await db.from("portal_proposals").update({ change_order_details: have }).eq("id", row.id);
  return have;
}

function changeOrders(row: LinkedRow, details: Record<string, ChangeOrderDetail>): PlanChangeOrder[] {
  return (row.change_orders ?? []).map((co) => {
    const d = details[String(co.id)];
    return { id: co.id, number: co.number, name: d?.name ?? co.name, status: d?.status ?? co.status, total: d?.financialSummary?.changeOrderTotal ?? co.total, decided_at: d?.clientLastDecisionDate ?? d?.lastModifiedByUserDate ?? null, sales_tax: d?.financialSummary?.salesTax?.total ?? null, areas: (d?.areas as PortalArea[] | undefined) ?? null };
  });
}

/**
 * Bring the Transactions of one linked proposal up to date with the mirror. `actor` is the person who clicked Link /
 * Replace (null for the hourly tick and the webhook). Returns what it did; never throws for one bad row.
 */
export async function syncLinkedProposal(db: SupabaseClient, proposalId: number, opts: { settings?: PortalSettings | null; actor?: string | null; today?: string } = {}): Promise<TxSyncSummary> {
  const out: TxSyncSummary = { proposalId, created: { main: 0, co: 0, invoice: 0, payment: 0 }, updated: 0, kept: [], errors: [] };
  const { data } = await db.from("portal_proposals").select(LINKED_COLS).eq("id", proposalId).maybeSingle();
  const row = data as unknown as LinkedRow | null;
  if (!row || row.link_status !== "linked" || !row.project_id) return out;
  const details = opts.settings ? await fetchChangeOrderDetails(db, opts.settings, row) : (row.change_order_details ?? {});
  // Every transaction of the project: rows typed by hand before the integration are adopted by amount (plan.ts adoptable).
  const { data: tx, error } = await db.from("transactions").select(TX_COLS).eq("project_id", row.project_id).eq("payment_type", "Apply to Project").is("deleted_at", null).limit(2000);
  if (error) {
    out.errors.push(error.message);
    return out;
  }
  const existing = (tx ?? []) as ExistingTx[];
  const plan = planTransactions({
    projectId: row.project_id,
    proposal: { id: row.id, number: row.number, name: row.name, total: row.total, accepted_at: row.accepted_at, sales_tax: row.financial?.tax ?? null, areas: row.detail?.areas ?? null },
    changeOrders: changeOrders(row, details),
    requests: row.payment_requests ?? [],
    mainId: row.transaction_id,
    existing,
    today: opts.today,
  });
  out.kept = plan.kept;
  const ids = await apply(db, row, plan, existing, out);
  const touched = out.created.main + out.created.co + out.created.invoice + out.created.payment + out.updated;
  const patch: Record<string, unknown> = { tx_synced_at: new Date().toISOString() };
  if (ids.main && ids.main !== row.transaction_id) patch.transaction_id = ids.main;
  await db.from("portal_proposals").update(patch).eq("id", row.id);
  // FIN-l: the first link teaches the project its Portal.io customer (later proposals of that customer match by themselves).
  if (row.customer?.id) await db.from("projects").update({ portal_customer_id: row.customer.id }).eq("id", row.project_id).is("portal_customer_id", null);
  if (touched || plan.kept.length) await history(db, row.project_id, opts.actor ?? null, describe(row, out));
  return out;
}

async function apply(db: SupabaseClient, row: LinkedRow, plan: Plan, existing: ExistingTx[], out: TxSyncSummary): Promise<{ main: number | null }> {
  const byKey = new Map<string, number>();
  const existingMain = existing.find((t) => t.id === row.transaction_id) ?? existing.find((t) => t.type === "Proposal" && t.portal_proposal_id === row.id && t.portal_change_order_id === null);
  if (existingMain) byKey.set("main", existingMain.id);
  for (const t of existing) if (t.portal_change_order_id) byKey.set(`co:${t.portal_change_order_id}`, t.id);
  // Creates: the main first, then the rest (change orders point at the main).
  for (const c of [...plan.create].sort((a, b) => Number(b.key === "main") - Number(a.key === "main"))) {
    const values: Record<string, unknown> = { ...c.values, created_by: null };
    if (c.key === "co") values.parent_transaction_id = byKey.get("main") ?? null;
    const { data, error } = await db.from("transactions").insert(values).select("id").single();
    if (error) {
      out.errors.push(`${c.key}: ${error.message}`);
      continue;
    }
    const id = (data as { id: number }).id;
    out.created[c.key]++;
    if (c.key === "main") byKey.set("main", id);
    if (c.key === "co") byKey.set(`co:${c.values.portal_change_order_id}`, id);
  }
  const main = byKey.get("main") ?? null;
  // Updates (change orders always point at the current main: Replace makes a new one).
  const updates = [...plan.update];
  for (const t of existing) if (t.portal_change_order_id && main && t.parent_transaction_id !== main && !updates.some((u) => u.id === t.id)) updates.push({ id: t.id, set: {}, why: `co:${t.portal_change_order_id}` });
  for (const u of updates) {
    const set = { ...u.set };
    if (u.why.startsWith("co:") && main) set.parent_transaction_id = main;
    const before = existing.find((t) => t.id === u.id);
    const same = before && Object.entries(set).every(([k, v]) => k === "portal_synced" ? JSON.stringify(before.portal_synced ?? null) === JSON.stringify(v) : JSON.stringify((before as unknown as Record<string, unknown>)[k] ?? null) === JSON.stringify(v ?? null));
    if (same) continue;
    const { error } = await db.from("transactions").update({ ...set, updated_by: null }).eq("id", u.id);
    if (error) out.errors.push(`${u.why}: ${error.message}`);
    else out.updated++;
  }
  // Items: replaced in full for the main proposal and each change order with a detail.
  for (const it of plan.items) {
    const txId = byKey.get(it.key);
    if (!txId) continue;
    await db.from("proposal_items").delete().eq("transaction_id", txId);
    if (it.rows.length) {
      const { error } = await db.from("proposal_items").insert(it.rows.map((r) => ({ ...r, transaction_id: txId })));
      if (error) out.errors.push(`items ${it.key}: ${error.message}`);
    }
  }
  return { main };
}

function describe(row: LinkedRow, s: TxSyncSummary): string {
  const parts: string[] = [];
  if (s.created.main) parts.push("Approved Proposal created");
  if (s.created.co) parts.push(`${s.created.co} change order${s.created.co > 1 ? "s" : ""} added`);
  if (s.created.invoice) parts.push(`${s.created.invoice} invoice${s.created.invoice > 1 ? "s" : ""} created`);
  if (s.created.payment) parts.push(`${s.created.payment} payment${s.created.payment > 1 ? "s" : ""} recorded`);
  if (s.updated) parts.push(`${s.updated} updated`);
  if (s.kept.length) parts.push(`kept as edited here: ${s.kept.join("; ")}`);
  if (s.errors.length) parts.push(`errors: ${s.errors.join("; ")}`);
  return `Portal.io sync of proposal #${row.number ?? row.id}: ${parts.join(", ")}`;
}

async function history(db: SupabaseClient, projectId: number, actor: string | null, note: string) {
  await db.from("audit_log").insert({ table_name: "projects", record_id: projectId, action: "update", actor, changes: { portal_sync: [null, note] } });
}
