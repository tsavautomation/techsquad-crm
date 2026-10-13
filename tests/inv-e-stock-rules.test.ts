import { describe, expect, it } from "vitest";
import { checkSerials, productMatches, validateMovement } from "@/lib/inventory/rules";

// INV-e Stock flow (SPEC §9.1 INV-e): movement validation, batch serials, product search.
const none = { projectId: null, staffId: null, location: null, note: "" };

describe("validateMovement", () => {
  it("requires what each movement needs", () => {
    expect(validateMovement("install", "In Stock", { ...none, location: "Warehouse" })).toMatch(/project/);
    expect(validateMovement("install", "In Stock", { ...none, projectId: 5 })).toBeNull();
    expect(validateMovement("pick", "In Stock", none)).toMatch(/responsible/);
    expect(validateMovement("pick", "In Stock", { ...none, staffId: 7 })).toBeNull(); // project only recommended (Fred)
    expect(validateMovement("return", "On Project", none)).toMatch(/location/);
    expect(validateMovement("return", "On Project", { ...none, location: "Warehouse" })).toBeNull();
    expect(validateMovement("rma_back", "RMA", { ...none, location: "Warehouse" })).toBeNull();
    expect(validateMovement("rma_out", "In Stock", none)).toMatch(/reason/);
    expect(validateMovement("rma_out", "In Stock", { ...none, note: "no power" })).toBeNull();
    expect(validateMovement("receive", null, none)).toMatch(/location/);
    expect(validateMovement("receive", null, { ...none, location: "Warehouse" })).toBeNull();
  });
  it("blocks transitions that make no sense", () => {
    expect(validateMovement("install", "Discarded", { ...none, projectId: 1 })).toMatch(/discarded/i);
    expect(validateMovement("pick", "Discarded", { ...none, staffId: 1 })).toMatch(/discarded/i);
    expect(validateMovement("receive", "Discarded", { ...none, location: "Warehouse" })).toBeNull();
    expect(validateMovement("rma_back", "In Stock", { ...none, location: "Warehouse" })).toMatch(/repair/);
    expect(validateMovement("return", "In Stock", { ...none, location: "Warehouse" })).toMatch(/Separated or On Project/);
    expect(validateMovement("receive", "In Stock", { ...none, location: "Warehouse" })).toMatch(/already/);
    expect(validateMovement("discard", "RMA", none)).toBeNull();
    expect(validateMovement("discard", "Discarded", none)).toMatch(/discarded/i);
  });
});

describe("checkSerials", () => {
  it("flags serials the CRM has and serials typed twice, keeps the order", () => {
    const out = checkSerials([" A1 ", "B2", "a1", "", "C3", "B2"], new Set(["c3"]));
    expect(out.map((s) => [s.serial, s.problem])).toEqual([
      ["A1", null],
      ["B2", null],
      ["a1", "repeated"],
      ["C3", "exists"],
      ["B2", "repeated"],
    ]);
  });
});

describe("productMatches", () => {
  const p = { id: 1, title: "Crestron CLW-DIMEX-P-W-S (6502829)", model: "CLW-DIMEX-P-W-S", brand: "Crestron", sku: "6502829", description: "DIMMER" };
  it("matches every word across name, brand, model, SKU and description", () => {
    expect(productMatches(p, "crestron dimex")).toBe(true);
    expect(productMatches(p, "6502829")).toBe(true);
    expect(productMatches(p, "dimmer p-w-s")).toBe(true);
    expect(productMatches(p, "sonos dimex")).toBe(false);
    expect(productMatches(p, "")).toBe(true);
  });
});
