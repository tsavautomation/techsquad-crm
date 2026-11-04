import { toBuyQuantity, type MaterialRow } from "@/lib/purchasing/materials";

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
export type Scope = "open" | "complete" | "all";
export const SCOPE_STATUSES: Record<Scope, string[]> = { open: OPEN_STATUSES, complete: ["Complete"], all: ALL_STATUSES };
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

/** PU-a: the estimate now reads the materials pick list, so what was bought, replaced, removed or is in stock today leaves it. PU-d: the quantity is what the job doesn't have yet. */
export function toPurchaseItems(rows: MaterialRow[]): PurchaseItem[] {
  return rows.map((m) => ({ id: m.id, project_id: m.project_id, project: m.project ?? `Project #${m.project_id}`, job_status: m.job_status, brand: m.brand, model: m.model, name: m.name, item_type: m.item_type ?? "Part", supplier: m.supplier, quantity: toBuyQuantity(m), cost: m.unit_cost, sell_price: m.sell_price, msrp: m.msrp, total: null }));
}
