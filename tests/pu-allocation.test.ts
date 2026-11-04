import { describe, expect, it } from "vitest";
import { allocate, allocateAll, extraKey, type ProjectUnit } from "@/lib/purchasing/allocation";
import { materialState, summarize, toBuyQuantity, type MaterialRow } from "@/lib/purchasing/materials";

// PU-d (Fred 2026-11-04): the equipment installed / staged on a job subtracts from its materials list.

const row = (o: Partial<MaterialRow> & { id: number }): MaterialRow => ({
  project_id: 1, project: "A", job_status: "Installation", proposal_item_id: null, product_id: null, product: null, brand: "Crestron", model: "C2N-CBD-P", name: "Keypad",
  quantity: 1, unit_cost: 100, status: "open", replaces_id: null, source: "portal", edited: false, notes: null, purchased_at: null,
  item_type: "Part", supplier: null, msrp: null, sell_price: null, proposal_number: null, on_hand: 0, locations: null, installed: 0, staged: 0, allocated: 0, ...o,
});
const unit = (id: number, o: Partial<ProjectUnit> = {}): ProjectUnit => ({ id, product_id: 7, model: "C2N-CBD-P", title: "Crestron keypad", status: "On Project", ...o });
const units = (n: number, o: Partial<ProjectUnit> = {}) => Array.from({ length: n }, (_, i) => unit(i + 1, o));

describe("allocation", () => {
  it("25 keypads on the list, 23 installed: 2 still to buy; all 25 installed: on the job (green)", () => {
    const { rows } = allocate([row({ id: 1, quantity: 25, product_id: 7 })], units(23));
    expect(rows[0]).toMatchObject({ installed: 23, staged: 0, allocated: 23 });
    expect(toBuyQuantity(rows[0])).toBe(2);
    expect(materialState(rows[0])).toBe("to_buy");
    const full = allocate([row({ id: 1, quantity: 25, product_id: 7 })], units(25)).rows[0];
    expect(materialState(full)).toBe("allocated");
    expect(toBuyQuantity(full)).toBe(0);
  });
  it("staged units (Separated for the project) count too, and the rest in stock makes the line in stock", () => {
    const { rows } = allocate([row({ id: 1, quantity: 5, product_id: 7, on_hand: 2 })], [...units(2), ...units(1, { status: "Separated" }).map((u) => ({ ...u, id: 9 }))]);
    expect(rows[0]).toMatchObject({ installed: 2, staged: 1, allocated: 3 });
    expect(materialState(rows[0])).toBe("in_stock");
  });
  it("matches by product first, then by model when the line has no product; a purchased line fully on the job is on the job", () => {
    const { rows } = allocate([row({ id: 1, quantity: 1, product_id: null, model: " c2n-cbd-p " }), row({ id: 2, quantity: 1, product_id: 7, status: "purchased" })], units(2));
    expect(rows.map((m) => m.allocated)).toEqual([1, 1]);
    expect(materialState(rows[1])).toBe("allocated");
  });
  it("units fill the oldest line first and never a replaced / removed line; what no line takes is an extra", () => {
    const { rows, extras } = allocate(
      [row({ id: 3, quantity: 1, product_id: 7, status: "removed" }), row({ id: 1, quantity: 2, product_id: 7 }), row({ id: 2, quantity: 1, product_id: 7 })],
      [...units(4), unit(5, { product_id: 9, model: "CP4-R", title: "Processor" }), unit(6, { product_id: null, model: "DM-NVX", title: null, status: "Separated" })],
    );
    expect(rows.find((m) => m.id === 1)!.allocated).toBe(2);
    expect(rows.find((m) => m.id === 2)!.allocated).toBe(1);
    expect(rows.find((m) => m.id === 3)!.allocated).toBe(0);
    expect(extras.map((e) => [e.key, e.count, e.installed, e.staged, e.title])).toEqual([
      ["p:7", 1, 1, 0, "Crestron keypad"],
      ["m:dm-nvx", 1, 0, 1, "DM-NVX"],
      ["p:9", 1, 1, 0, "Processor"],
    ]);
  });
  it("ignored extras carry their ignore id and sort last", () => {
    const { extras } = allocate([], [unit(1, { product_id: 9, model: "CP4-R" }), unit(2)], [{ id: 44, product_id: 9, model: null }]);
    expect(extras.map((e) => [e.key, e.ignored_id])).toEqual([["p:7", null], ["p:9", 44]]);
    expect(extraKey({ product_id: null, model: " DM-NVX " })).toBe("m:dm-nvx");
  });
  it("summary and the to-buy cost count only what the job still needs", () => {
    const { rows } = allocate([row({ id: 1, quantity: 25, product_id: 7, unit_cost: 100 }), row({ id: 2, quantity: 2, product_id: 9, unit_cost: 500, model: "CP4-R" })], [...units(23), unit(99, { product_id: 9, model: "CP4-R" }), unit(98, { product_id: 9, model: "CP4-R" })]);
    expect(summarize(rows)).toMatchObject({ lines: 2, toBuy: 1, toBuyCost: 200, allocated: 1, allocatedCost: 1000 });
  });
  it("several projects: each project's units go to its own lines", () => {
    const rows = allocateAll([row({ id: 1, project_id: 1, quantity: 2, product_id: 7 }), row({ id: 2, project_id: 2, quantity: 2, product_id: 7 })], [{ ...unit(1), project_id: 2 }]);
    expect(rows.map((m) => [m.project_id, m.allocated])).toEqual([[1, 0], [2, 1]]);
  });
});
