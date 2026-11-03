import { describe, expect, it } from "vitest";
import { groupItems, groupLines, type PurchaseItem } from "@/lib/finance/purchasing";

// FIN-p (Fred 2026-11-03): the purchasing estimate by manufacturer / supplier / type over the proposals' lines.

const item = (o: Partial<PurchaseItem> & { id: number }): PurchaseItem => ({ project_id: 1, project: "A", job_status: "Installation", brand: null, model: null, name: null, item_type: "Part", supplier: null, quantity: 1, cost: null, sell_price: null, msrp: null, total: null, ...o });
const items = [
  item({ id: 1, brand: "Crestron", model: "TSW-770", quantity: 2, cost: 700, msrp: 1200, sell_price: 1100, supplier: "Crestron" }),
  item({ id: 2, brand: "Crestron", model: "CP4", quantity: 1, cost: 1500, msrp: 2500, sell_price: 2300, supplier: "ADI", project_id: 2, project: "B" }),
  item({ id: 3, brand: "Sonos", model: "Amp", quantity: 3, cost: 450, msrp: 699, sell_price: 699, supplier: "ADI", project_id: 2, project: "B" }),
  item({ id: 4, brand: null, model: "Cat6", quantity: 10, cost: null, sell_price: 2, item_type: "CustomItem" }),
  item({ id: 5, brand: "Labor", item_type: "Labor", quantity: 8, cost: 50, sell_price: 120 }),
  item({ id: 6, brand: "ADI", item_type: "Fee", quantity: 1, cost: 10, sell_price: 10 }),
];

describe("grouping", () => {
  it("by manufacturer: cost × quantity, MSRP and sell the same way, projects counted; labor and fees out; a line without cost counted apart", () => {
    const g = groupItems(items, "brand");
    expect(g.map((x) => x.key)).toEqual(["Crestron", "Sonos", "(no brand)"]);
    expect(g[0]).toMatchObject({ items: 2, quantity: 3, cost: 2900, msrp: 4900, sell: 4500, projects: 2, withoutCost: 0 });
    expect(g[1]).toMatchObject({ cost: 1350, msrp: 2097, projects: 1 });
    expect(g[2]).toMatchObject({ cost: 0, withoutCost: 1, quantity: 10, sell: 20 });
  });
  it("by supplier and by type", () => {
    expect(groupItems(items, "supplier").map((x) => [x.key, x.cost])).toEqual([["ADI", 2850], ["Crestron", 1400], ["(no supplier)", 0]]);
    expect(groupItems(items, "type").map((x) => [x.key, x.items])).toEqual([["Part", 3], ["CustomItem", 1]]);
  });
  it("the lines of a group, by project, biggest first", () => {
    const l = groupLines(items, "brand", "Crestron");
    expect(l.map((x) => [x.project, x.line_cost])).toEqual([["A", 1400], ["B", 1500]]);
  });
});
