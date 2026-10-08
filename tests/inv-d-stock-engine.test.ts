import { describe, expect, it } from "vitest";
import { dashboard, ledgerDelta, MOVEMENTS, movementOf, receiptLines } from "@/lib/inventory/engine";

// INV-d "Estoque em Campo" (SPEC §9.1 INV-d): the pure rules of the serial-centric stock screens.

describe("movements and the ledger", () => {
  it("has the prototype's seven movements, each leaving the unit in a stage", () => {
    expect(MOVEMENTS.map((m) => [m.key, m.to])).toEqual([
      ["receive", "In Stock"],
      ["pick", "Separated"],
      ["install", "On Project"],
      ["return", "In Stock"],
      ["rma_out", "RMA"],
      ["rma_back", "In Stock"],
      ["discard", "Discarded"],
    ]);
    expect(movementOf("pick")?.wantsProject).toBe(true);
    expect(movementOf("nope")).toBeUndefined();
  });
  it("only a unit In Stock counts on the shelf: the ledger moves when a unit enters or leaves that stage", () => {
    expect(ledgerDelta(null, "In Stock")).toBe(1); // received, new serial
    expect(ledgerDelta("In Stock", "Separated")).toBe(-1); // picked for a client
    expect(ledgerDelta("Separated", "On Project")).toBe(0); // already off the shelf
    expect(ledgerDelta("Separated", "In Stock")).toBe(1); // put back
    expect(ledgerDelta("In Stock", "RMA")).toBe(-1);
    expect(ledgerDelta("RMA", "In Stock")).toBe(1);
    expect(ledgerDelta("On Project", "Discarded")).toBe(0);
    expect(ledgerDelta("In Stock", "In Stock")).toBe(0);
  });
});

describe("hand-over receipt", () => {
  it("writes the Equipment lines the way the imports did", () => {
    expect(receiptLines([{ serial: "A1", product: "U7-Pro" }, { serial: null, product: "Cable", mac: "AA:BB" }])).toBe("01 - U7-Pro – S/N A1\n02 - Cable – MAC AA:BB");
  });
});

describe("dashboard", () => {
  it("counts units and cost per stage, value installed per client, top products in stock", () => {
    const d = dashboard([
      { status: "In Stock", product: "U7-Pro", client: null, cost: 100 },
      { status: "In Stock", product: "U7-Pro", client: null, cost: null },
      { status: "On Project", product: "HZ2-KPCN-W", client: "Stern", cost: 50 },
      { status: "On Project", product: "HZ2-KPCN-W", client: "Stern", cost: 50 },
      { status: "Separated", product: "CEN-GW1", client: "Roth", cost: 20 },
    ]);
    expect(d.total).toBe(5);
    expect(d.counts).toMatchObject({ "In Stock": 2, "On Project": 2, Separated: 1, RMA: 0, Discarded: 0 });
    expect(d.value).toMatchObject({ "In Stock": 100, "On Project": 100, Separated: 20 });
    expect(d.withoutCost).toBe(1);
    expect(d.valueByClient).toEqual([["Stern", 100]]);
    expect(d.topProducts).toEqual([["U7-Pro", 2]]);
  });
});
