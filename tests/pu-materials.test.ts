import { describe, expect, it } from "vitest";
import { isService, materialState, needsPurchasing, orderMaterials, stillToBuy, summarize, type MaterialRow } from "@/lib/purchasing/materials";

// PU-a (Fred 2026-11-03): the project's materials pick list.

const row = (o: Partial<MaterialRow> & { id: number }): MaterialRow => ({
  project_id: 1, project: "A", job_status: "Installation", proposal_item_id: null, product_id: null, product: null, brand: "Crestron", model: "CP4-R", name: null,
  quantity: 1, unit_cost: 1100, status: "open", replaces_id: null, source: "portal", edited: false, notes: null, purchased_at: null,
  item_type: "Part", supplier: null, msrp: null, sell_price: null, proposal_number: null, on_hand: 0, locations: null, ...o,
});

describe("material state", () => {
  it("an open line is in stock only while the ledger covers the quantity; stored statuses win", () => {
    expect(materialState(row({ id: 1, quantity: 2, on_hand: 2 }))).toBe("in_stock");
    expect(materialState(row({ id: 1, quantity: 2, on_hand: 1 }))).toBe("to_buy");
    expect(materialState(row({ id: 1, quantity: 2, on_hand: 5, status: "purchased" }))).toBe("purchased");
    expect(materialState(row({ id: 1, quantity: 0, on_hand: 5 }))).toBe("to_buy");
  });
  it("summary counts lines and dollars per state, leaving replaced and removed out", () => {
    const rows = [
      row({ id: 1, quantity: 2, unit_cost: 1100 }),
      row({ id: 2, quantity: 3, unit_cost: 450, on_hand: 3 }),
      row({ id: 3, quantity: 1, unit_cost: 700, status: "purchased" }),
      row({ id: 4, quantity: 1, unit_cost: 99, status: "removed" }),
      row({ id: 5, quantity: 10, unit_cost: null }),
    ];
    expect(summarize(rows)).toEqual({ lines: 4, toBuy: 2, toBuyCost: 2200, inStock: 1, inStockCost: 1350, purchased: 1, purchasedCost: 700, withoutCost: 1 });
    expect(needsPurchasing(rows)).toBe(true);
    expect(stillToBuy(rows).map((m) => m.id)).toEqual([1, 5]);
    expect(needsPurchasing([rows[1], rows[2], rows[3]])).toBe(false);
  });
  it("order: to buy, in stock, purchased, then replaced and removed; a replacement follows its line", () => {
    const rows = [
      row({ id: 1, status: "removed" }),
      row({ id: 2, status: "purchased" }),
      row({ id: 3, status: "replaced" }),
      row({ id: 4, replaces_id: 3, source: "manual" }),
      row({ id: 5, on_hand: 1 }),
      row({ id: 6 }),
    ];
    expect(orderMaterials(rows).map((m) => m.id)).toEqual([6, 5, 2, 3, 4, 1]);
  });
  it("service lines are never material: labor, maintenance plans, permits, shades, discounts, fees", () => {
    expect(isService(row({ id: 1, brand: null, model: null, name: "TS Maintenance Silver" }))).toBe(true);
    expect(isService(row({ id: 1, brand: null, model: "Permits and Qualification", name: "Building Permits" }))).toBe(true);
    expect(isService(row({ id: 1, brand: "Lutron", model: "Roller Shades", name: null }))).toBe(true);
    expect(isService(row({ id: 1, brand: null, model: null, name: "Discount 10%" }))).toBe(true);
    expect(isService(row({ id: 1, name: "Labor - programming", item_type: "CustomItem" }))).toBe(true);
    expect(isService(row({ id: 1, item_type: "Fee" }))).toBe(true);
    expect(isService(row({ id: 1, brand: null, model: "Cables and Connectors Miscellaneous", name: "Hardware, plugs, connectors, extension cord" }))).toBe(true);
    expect(isService(row({ id: 1, brand: "Binary", model: "B6-4K2-2", name: "HDMI Cable" }))).toBe(false);
    expect(isService(row({ id: 1, brand: "Crestron", model: "CP4-R", name: "Control processor" }))).toBe(false);
    expect(isService(row({ id: 1, brand: "Lutron", model: "QSX", name: "Shading power panel" }))).toBe(false);
  });
});
