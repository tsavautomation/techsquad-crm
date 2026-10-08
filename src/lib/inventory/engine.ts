// INV-d "Estoque em Campo" (SPEC §9.1 INV-d, Fred 2026-10-08): the pure rules of the serial-centric
// stock screens, rebuilt from the colleague's prototype on the CRM's own tables (stock_items, the
// stock_movements ledger, inventory_checkouts). No database here: tests/inv-d-stock-engine.test.ts.

export type StockStatus = "In Stock" | "Separated" | "On Project" | "RMA" | "Discarded";
export const STATUSES: StockStatus[] = ["In Stock", "Separated", "On Project", "RMA", "Discarded"];

export type MovementKey = "receive" | "pick" | "install" | "return" | "rma_out" | "rma_back" | "discard";
export type Movement = { key: MovementKey; label: string; to: StockStatus; wantsProject: boolean };

/** The seven movements of the prototype, each with the stage it leaves the unit in. */
export const MOVEMENTS: Movement[] = [
  { key: "receive", label: "Received into stock", to: "In Stock", wantsProject: false },
  { key: "pick", label: "Picked at the warehouse", to: "Separated", wantsProject: true },
  { key: "install", label: "Installed", to: "On Project", wantsProject: true },
  { key: "return", label: "Returned to stock", to: "In Stock", wantsProject: false },
  { key: "rma_out", label: "Sent for repair (RMA)", to: "RMA", wantsProject: false },
  { key: "rma_back", label: "Back from repair", to: "In Stock", wantsProject: false },
  { key: "discard", label: "Written off / discarded", to: "Discarded", wantsProject: false },
];
export const movementOf = (key: string): Movement | undefined => MOVEMENTS.find((m) => m.key === key);

/** Tone per stage, for badges and dashboard bars (globals.css tokens). */
export const STATUS_TONE: Record<StockStatus, { badge: string; bar: string }> = {
  "In Stock": { badge: "bg-ok-bg text-ok-fg", bar: "#16a34a" },
  Separated: { badge: "bg-warn-bg text-warn-fg", bar: "#d97706" },
  "On Project": { badge: "bg-info-bg text-info-fg", bar: "#2563eb" },
  RMA: { badge: "bg-bad-bg text-bad-fg", bar: "#dc2626" },
  Discarded: { badge: "bg-muted text-text-2", bar: "#6b7280" },
};

/** Only a unit In Stock sits on a shelf: the ledger counts it. */
export const onHand = (s: StockStatus | null | undefined) => s === "In Stock";

/** What the ledger gains (+1), loses (−1) or keeps (0) when a unit goes from one stage to another. */
export function ledgerDelta(prev: StockStatus | null, next: StockStatus): -1 | 0 | 1 {
  const was = onHand(prev);
  const is = onHand(next);
  return is && !was ? 1 : was && !is ? -1 : 0;
}

export type UnitLine = { serial: string | null; product: string; mac?: string | null };

/** The Inventory Checkout's Equipment text: "01 - Model – S/N … – MAC …", as the imports wrote it. */
export function receiptLines(units: UnitLine[]): string {
  return units.map((u, i) => [`${String(i + 1).padStart(2, "0")} - ${u.product}`, u.serial ? `S/N ${u.serial}` : null, u.mac ? `MAC ${u.mac}` : null].filter(Boolean).join(" – ")).join("\n");
}

export type DashItem = { status: StockStatus; product: string; client: string | null; cost: number | null };

/** The dashboard's numbers: units per stage, value per stage (cost), value installed per client, top products in stock. */
export function dashboard(items: DashItem[]) {
  const counts = Object.fromEntries(STATUSES.map((s) => [s, 0])) as Record<StockStatus, number>;
  const value = Object.fromEntries(STATUSES.map((s) => [s, 0])) as Record<StockStatus, number>;
  const byClient = new Map<string, number>();
  const topProducts = new Map<string, number>();
  let withoutCost = 0;
  for (const it of items) {
    counts[it.status]++;
    if (it.cost === null) withoutCost++;
    else value[it.status] += it.cost;
    if (it.status === "On Project" && it.client && it.cost) byClient.set(it.client, (byClient.get(it.client) ?? 0) + it.cost);
    if (it.status === "In Stock") topProducts.set(it.product, (topProducts.get(it.product) ?? 0) + 1);
  }
  return {
    total: items.length,
    counts,
    value,
    withoutCost,
    valueByClient: [...byClient.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12),
    topProducts: [...topProducts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12),
  };
}
