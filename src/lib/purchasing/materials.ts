// PU-a (Fred 2026-11-03): the project's materials pick list. Pure helpers shared by the Materials card on a project,
// Administrative › Purchasing and the tests (tests/pu-materials.test.ts). A line is open (to buy, or in stock when
// the ledger has enough of that model today), purchased, replaced or removed; "in stock" is computed, never stored.

export type MaterialStatus = "open" | "purchased" | "replaced" | "removed";
export type MaterialRow = {
  id: number;
  project_id: number;
  project: string | null;
  job_status: string | null;
  proposal_item_id: number | null;
  product_id: number | null;
  product: string | null;
  brand: string | null;
  model: string | null;
  name: string | null;
  quantity: number;
  unit_cost: number | null;
  status: MaterialStatus;
  replaces_id: number | null;
  source: "portal" | "manual";
  edited: boolean;
  notes: string | null;
  purchased_at: string | null;
  item_type: string | null;
  supplier: string | null;
  msrp: number | null;
  sell_price: number | null;
  proposal_number: string | null;
  on_hand: number;
  locations: string | null;
};
/** What the line shows: the stored status, with open lines split by today's stock. */
export type MaterialState = "to_buy" | "in_stock" | "purchased" | "replaced" | "removed";

const r2 = (n: number) => Math.round(n * 100) / 100;
export const lineCost = (m: Pick<MaterialRow, "quantity" | "unit_cost">) => r2(Number(m.unit_cost ?? 0) * Number(m.quantity ?? 1));

/** Open + enough on hand = in stock; otherwise an open line is to buy. */
export function materialState(m: Pick<MaterialRow, "status" | "quantity" | "on_hand">): MaterialState {
  if (m.status !== "open") return m.status;
  return Number(m.on_hand) >= Number(m.quantity) && Number(m.quantity) > 0 ? "in_stock" : "to_buy";
}

export type MaterialSummary = { lines: number; toBuy: number; toBuyCost: number; inStock: number; inStockCost: number; purchased: number; purchasedCost: number; withoutCost: number };

/** The card's header line: how many lines and dollars are still to buy, covered by stock, or bought. Replaced and removed lines count nowhere. */
export function summarize(rows: MaterialRow[]): MaterialSummary {
  const s: MaterialSummary = { lines: 0, toBuy: 0, toBuyCost: 0, inStock: 0, inStockCost: 0, purchased: 0, purchasedCost: 0, withoutCost: 0 };
  for (const m of rows) {
    const st = materialState(m);
    if (st === "replaced" || st === "removed") continue;
    s.lines++;
    if (m.unit_cost === null) s.withoutCost++;
    const c = lineCost(m);
    if (st === "to_buy") {
      s.toBuy++;
      s.toBuyCost = r2(s.toBuyCost + c);
    } else if (st === "in_stock") {
      s.inStock++;
      s.inStockCost = r2(s.inStockCost + c);
    } else {
      s.purchased++;
      s.purchasedCost = r2(s.purchasedCost + c);
    }
  }
  return s;
}

/** The project flag "Needs purchasing": at least one line still to buy. */
export const needsPurchasing = (rows: MaterialRow[]) => rows.some((m) => materialState(m) === "to_buy");

/** Only what still has to be bought: open lines the stock does not cover. */
export const stillToBuy = (rows: MaterialRow[]) => rows.filter((m) => materialState(m) === "to_buy");

/** Display order: open lines first (to buy before in stock), then purchased, then replaced / removed at the bottom; a replacement sits right after the line it replaced. */
export function orderMaterials(rows: MaterialRow[]): MaterialRow[] {
  const rank: Record<MaterialState, number> = { to_buy: 0, in_stock: 1, purchased: 2, replaced: 3, removed: 4 };
  const byId = new Map(rows.map((m) => [m.id, m]));
  const key = (m: MaterialRow): [number, number] => {
    const root = m.replaces_id && byId.has(m.replaces_id) ? byId.get(m.replaces_id)! : m;
    return [rank[materialState(root)], root.id];
  };
  return [...rows].sort((a, b) => {
    const [ra, ia] = key(a);
    const [rb, ib] = key(b);
    return ra - rb || ia - ib || Number(Boolean(a.replaces_id)) - Number(Boolean(b.replaces_id)) || a.id - b.id;
  });
}

/** Fred 2026-11-03: service lines that come as items in Portal.io proposals are never material: labor, the TS Maintenance plans, permits, shades, discounts, the "Cables and Connectors Miscellaneous" allowance (any "miscellaneous" line; and fees, by item type). Matched on brand, model and description, case-insensitive. */
const EXCLUDED = /\b(labor|labour|maintenance|permit|permits|shade|shades|discount|discounts|miscellaneous)\b/i;
export const isService = (m: Pick<MaterialRow, "brand" | "model" | "name" | "item_type">) => (m.item_type !== null && m.item_type !== "Part" && m.item_type !== "CustomItem") || EXCLUDED.test([m.brand, m.model, m.name].filter(Boolean).join(" "));
/** The lists only ever show material lines. */
export const materialsOnly = (rows: MaterialRow[]) => rows.filter((m) => !isService(m));

export const productLabel = (m: Pick<MaterialRow, "brand" | "model" | "name">) => [m.brand, m.model].filter(Boolean).join(" ") || m.name || "";
