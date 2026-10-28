import { describe, expect, it } from "vitest";
import { cleanTitle, monthFromHeader, parseSheet, planSheetLink, splitNumber, type SheetExistingTx } from "@/lib/finance/sheet";
import { customerKey, sheetSuggestions, withLearned } from "@/lib/finance/sheet-link";

// FIN-m (Fred 2026-10-28): the Sales Projections sheet read into rows, the suggestions, and what Link writes.

const header = ["Year", "Date", "Customer", "Indicator/Designer", "Comission", "Invoice", "Project", "Amount", 2023, new Date("2025-01-24T00:00:00Z"), new Date("2025-02-24T00:00:00Z"), new Date("2026-01-01T00:00:00Z"), new Date("2026-10-26T00:00:00Z"), "Discount", "Credit Card Fee", "Tip", "Paid $", "Open Balance ", "Paid %", "Balance %", "Due Now", "Next payment", "Final", "Status", "Receivable", "Probability", "Parts", "Labor", "Comm", "Sales Tax", "Profit", "Payment Notes"];
const line = (over: Record<number, unknown>) => {
  const r: unknown[] = new Array(header.length).fill(null);
  for (const [k, v] of Object.entries(over)) r[Number(k)] = v;
  return r as (string | number | null)[];
};

describe("reading the sheet", () => {
  it("month headers: Jan-24 typed by Luana became 24 January 2025; a real date keeps its year; 2023 is the lump", () => {
    expect(monthFromHeader(new Date("2025-01-24T00:00:00Z"))).toBe("2024-01");
    expect(monthFromHeader(new Date("2025-12-25T00:00:00Z"))).toBe("2025-12");
    expect(monthFromHeader(new Date("2026-01-01T00:00:00Z"))).toBe("2026-01");
    expect(monthFromHeader("Mar-26")).toBe("2026-03");
    expect(monthFromHeader(2023)).toBe("2023");
    expect(monthFromHeader("Discount")).toBeNull();
  });
  it("numbers: Portal.io proposal, change order, quote", () => {
    expect(splitNumber("2357CO1")).toEqual({ main_number: 2357, change_order: 1 });
    expect(splitNumber("2732")).toEqual({ main_number: 2732, change_order: null });
    expect(splitNumber("Q8178388 ")).toEqual({ main_number: null, change_order: null });
    expect(cleanTitle("2732-The Alexander Group - 1611 W 24th", "2732")).toBe("The Alexander Group - 1611 W 24th");
    expect(cleanTitle("Something else", "2732")).toBe("Something else");
  });
  it("rows: payments by month, extras, the Y commission flag; totals and empty lines skipped", () => {
    const rows = parseSheet(header, [
      line({ 0: 2024, 1: "2024-02-13", 2: "2135 Lake Av", 3: "The Alexander Group", 4: "Y ", 5: 1673, 6: "1673-2135 - AV Automation", 7: 97690.66, 8: 48845.33, 10: 39076.26, 12: 9769.07, 14: 380.86, 23: "Completed", 24: "Paid", 25: "HIGH", 28: 674.7, 31: "paid by check" }),
      line({ 5: "2357CO1", 6: "2357CO1-Change order", 7: 1000 }),
      line({ 0: "Total", 7: 999999 }),
      line({}),
    ]);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ year: 2024, date: "2024-02-13", customer: "2135 Lake Av", designer: "The Alexander Group", commission: true, number: "1673", main_number: 1673, change_order: null, title: "1673-2135 - AV Automation", amount: 97690.66, cc_fee: 380.86, status: "Completed", receivable: "Paid", probability: "HIGH", commission_amount: 674.7, notes: "paid by check" });
    expect(rows[0].payments).toEqual([{ month: "2023", amount: 48845.33 }, { month: "2024-02", amount: 39076.26 }, { month: "2026-10", amount: 9769.07 }]);
    expect(rows[1]).toMatchObject({ main_number: 2357, change_order: 1, commission: false, payments: [] });
    expect(rows[0].row_key).toBe("1673|1673-2135 - av automation");
  });
});

describe("suggestions", () => {
  const projects = [
    { id: 1, title: "Lazarus Residence", job_address: { street: "2135 Lake Ave", zip: "33154" }, owner_email: null, owner_phone: null, owner_name: "Guimar Urbina" },
    { id: 2, title: "Hyman - 2687 Flamingo", job_address: null, owner_email: null, owner_phone: null, owner_name: "Simcha Hyman" },
  ];
  const row = (over: Record<string, unknown>) => ({ ...parseSheet(header, [line({ 5: 1673, 6: "1673-x", 7: 1 })])[0], ...over });
  it("a Portal.io proposal already linked wins; then the job address; then the customer name", () => {
    expect(sheetSuggestions(row({}), projects, new Map(), new Map([[1673, { project_id: 2, title: "Hyman" }]]))[0]).toMatchObject({ id: 2, score: 100 });
    expect(sheetSuggestions(row({ customer: "2135 Lake Av" }), projects, new Map(), new Map())[0]).toMatchObject({ id: 1, reason: "Same job address" });
    expect(sheetSuggestions(row({ customer: "2687 Flamingo: Simcha Hyman", title: "3121-2687 Flamingo - TV Install" }), projects, new Map(), new Map())[0]).toMatchObject({ id: 2 });
    expect(sheetSuggestions(row({ customer: "Nobody" }), projects, new Map(), new Map())).toEqual([]);
  });
});

describe("what Link writes", () => {
  const row = parseSheet(header, [line({ 0: 2024, 1: "2024-02-13", 5: 1673, 6: "1673-2135 - AV Automation", 7: 97690.66, 8: 48845.33, 10: 39076.26, 12: 9769.07, 13: 100, 14: 380.86 })])[0];
  const tx = (o: Partial<SheetExistingTx> & { id: number; type: string; amount: number }): SheetExistingTx => ({ date: null, portal_number: null, portal_proposal_id: null, portal_request_id: null, portal_change_order_id: null, is_change_order: false, sheet_ref: null, cc_fee: null, tip: null, discount: null, ...o });
  it("an empty project gets the proposal and one payment per month, dated the first of the month; the lump of 2023 on 12/31; discount and fee on the last payment", () => {
    const p = planSheetLink(7, row, 55, []);
    expect(p.update).toEqual([]);
    expect(p.create.map((c) => [c.type, c.amount, c.date, c.sheet_ref])).toEqual([
      ["Proposal", 97690.66, "2024-02-13", "7:proposal"],
      ["Payment", 48845.33, "2023-12-31", "7:2023"],
      ["Payment", 39076.26, "2024-02-01", "7:2024-02"],
      ["Payment", 9769.07, "2026-10-01", "7:2026-10"],
    ]);
    expect(p.create[0]).toMatchObject({ description: "2135 - AV Automation", portal_number: "1673", is_change_order: false });
    expect(p.create[3]).toMatchObject({ discount: 100, cc_fee: 380.86 });
  });
  it("the proposal from Portal.io (same number) and a payment of the same amount are adopted, never duplicated; the sync's payment takes the sheet's month", () => {
    const existing = [tx({ id: 1, type: "Proposal", amount: 97690.66, portal_number: "1673", portal_proposal_id: 999 }), tx({ id: 2, type: "Payment", amount: 9769.07, date: "2026-11-03", portal_request_id: 5 }), tx({ id: 3, type: "Payment", amount: 39076.26, date: "2024-02-20" })];
    const p = planSheetLink(7, row, 55, existing);
    expect(p.create.map((c) => c.sheet_ref)).toEqual(["7:2023"]);
    expect(p.update).toEqual(expect.arrayContaining([
      { id: 1, set: { sheet_ref: "7:proposal" }, why: "proposal" },
      { id: 3, set: { sheet_ref: "7:2024-02" }, why: "payment:2024-02" },
      { id: 2, set: { sheet_ref: "7:2026-10", date: "2026-10-01", discount: 100, cc_fee: 380.86 }, why: "payment:2026-10" },
    ]));
    // a second run plans nothing new
    const again = planSheetLink(7, row, 55, [...existing.map((t, i) => ({ ...t, sheet_ref: ["7:proposal", "7:2026-10", "7:2024-02"][i], date: i === 1 ? "2026-10-01" : t.date, discount: i === 1 ? 100 : null, cc_fee: i === 1 ? 380.86 : null })), tx({ id: 4, type: "Payment", amount: 48845.33, sheet_ref: "7:2023" })]);
    expect(again.create).toEqual([]);
    expect(again.update).toEqual([]);
  });
  it("a change order row hangs on the project's main proposal", () => {
    const co = parseSheet(header, [line({ 5: "1673CO1", 6: "1673CO1-Extra", 7: 500 })])[0];
    const p = planSheetLink(8, co, 55, [tx({ id: 1, type: "Proposal", amount: 97690.66, portal_number: "1673" })]);
    expect(p.create[0]).toMatchObject({ type: "Proposal", is_change_order: true, parent_transaction_id: 1, portal_number: "1673CO1", description: "Extra" });
  });
});

describe("FIN-n remembering a link", () => {
  it("the learned project goes first, replacing itself if already there; the customer key ignores case and spaces", () => {
    const learned = { id: 2, title: "Hyman (#2)", reason: "You linked this customer to this project", score: 95 };
    expect(withLearned([{ id: 1, title: "A", reason: "Similar name", score: 60 }, { id: 2, title: "Hyman (#2)", reason: "Similar name", score: 55 }], learned)).toEqual([learned, { id: 1, title: "A", reason: "Similar name", score: 60 }]);
    expect(withLearned(null, learned)).toEqual([learned]);
    expect(customerKey("2687 Flamingo:  Simcha Hyman ")).toBe(customerKey("2687 flamingo: simcha hyman"));
  });
});
