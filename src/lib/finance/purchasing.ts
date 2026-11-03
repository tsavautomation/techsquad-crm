import type { SupabaseClient } from "@supabase/supabase-js";
const LOW_VOLTAGE = "Low Voltage"; // not imported from load.ts: that file is server-only and the table component needs the grouping

// FIN-p (Fred 2026-11-03): "quanto $ tenho para comprar de cada fabricante". The lines of every Approved Proposal
// (Portal.io items: brand, model, quantity, unit cost, sell price, MSRP, supplier) over the projects approved or
// under way, grouped by manufacturer, supplier or type. Pure grouping here (tests/fin-purchasing.test.ts).

export type PurchaseItem = { id: number; project_id: number; project: string; job_status: string | null; brand: string | null; model: string | null; name: string | null; item_type: string | null; supplier: string | null; quantity: number; cost: number | null; sell_price: number | null; msrp: number | null; total: number | null };
export type GroupKey = "brand" | "supplier" | "type";
export type PurchaseGroup = { key: string; items: number; quantity: number; cost: number; sell: number; msrp: number; projects: number; withoutCost: number };

/** Job statuses whose material is still to be bought (or being bought). */
export const OPEN_STATUSES = ["Proposal Approved", "Infrastructure", "Installation", "Programming"];
/** …and the ones where the money was spent already (Complete), for the whole picture. */
export const ALL_STATUSES = [...OPEN_STATUSES, "ON HOLD", "Complete"];
/** Only equipment and material lines are bought; labor and fees are not. */
export const BUYABLE = new Set(["Part", "CustomItem"]);

const r2 = (n: number) => Math.round(n * 100) / 100;
export const groupLabel = (item: PurchaseItem, by: GroupKey): string => (by === "brand" ? item.brand?.trim() || "(no brand)" : by === "supplier" ? item.supplier?.trim() || "(no supplier)" : item.item_type || "(no type)");

/** Totals per group: cost = Σ unit cost × quantity (lines with no cost are counted apart), MSRP and sell the same way. */
export function groupItems(items: PurchaseItem[], by: GroupKey): PurchaseGroup[] {
  const out = new Map<string, PurchaseGroup & { projectIds: Set<number> }>();
  for (const i of items) {
    if (!BUYABLE.has(i.item_type ?? "")) continue;
    const key = groupLabel(i, by);
    const g = out.get(key) ?? { key, items: 0, quantity: 0, cost: 0, sell: 0, msrp: 0, projects: 0, withoutCost: 0, projectIds: new Set<number>() };
    const qty = Number(i.quantity ?? 1);
    g.items++;
    g.quantity += qty;
    if (i.cost === null) g.withoutCost++;
    else g.cost += Number(i.cost) * qty;
    g.sell += Number(i.sell_price ?? 0) * qty;
    g.msrp += Number(i.msrp ?? 0) * qty;
    g.projectIds.add(i.project_id);
    out.set(key, g);
  }
  return [...out.values()]
    .map(({ projectIds, ...g }) => ({ ...g, cost: r2(g.cost), sell: r2(g.sell), msrp: r2(g.msrp), quantity: r2(g.quantity), projects: projectIds.size }))
    .sort((a, b) => b.cost - a.cost || a.key.localeCompare(b.key));
}

/** The lines of a group, by project, biggest first. */
export function groupLines(items: PurchaseItem[], by: GroupKey, key: string): (PurchaseItem & { line_cost: number })[] {
  return items
    .filter((i) => BUYABLE.has(i.item_type ?? "") && groupLabel(i, by) === key)
    .map((i) => ({ ...i, line_cost: r2(Number(i.cost ?? 0) * Number(i.quantity ?? 1)) }))
    .sort((a, b) => a.project.localeCompare(b.project) || b.line_cost - a.line_cost);
}

/** Every buyable line of the Low Voltage projects in `statuses`, with its project. */
export async function loadPurchasing(db: SupabaseClient, statuses: string[]): Promise<PurchaseItem[]> {
  const { data } = await db
    .from("proposal_items")
    .select("id, brand, model, name, item_type, supplier, quantity, cost, sell_price, msrp, total, transactions!inner(project_id, deleted_at, projects!inner(title, job_status, category))")
    .is("transactions.deleted_at", null)
    .eq("transactions.projects.category", LOW_VOLTAGE)
    .in("transactions.projects.job_status", statuses)
    .limit(20000);
  type Row = Omit<PurchaseItem, "project_id" | "project" | "job_status"> & { transactions: { project_id: number; projects: { title: string | null; job_status: string | null } } };
  return ((data ?? []) as unknown as Row[]).map(({ transactions: t, ...i }) => ({ ...i, quantity: Number(i.quantity ?? 1), project_id: t.project_id, project: t.projects.title ?? `Project #${t.project_id}`, job_status: t.projects.job_status }));
}
