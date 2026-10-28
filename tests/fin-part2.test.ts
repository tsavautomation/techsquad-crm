import { describe, expect, it } from "vitest";
import { acceptedItems, autoLinkCandidate, changeOrderNumber, dateET, mapMethod, partsCost, planTransactions, syncOwns, type ExistingTx, type PlanChangeOrder, type PlanProposal, type PlanRequest, type PortalArea } from "@/lib/portalio/plan";

// FIN Part 2 (Fred 2026-10-28, SPEC §9.1 FIN-i…FIN-l): the Portal.io sync as a pure plan. The cases Fred asked for in
// the second brief: proposals with items, change orders, invoices from payment requests, payments from paid requests,
// idempotency by Portal.io ids, a person's edits kept, and the automatic link only with a single candidate.

const TODAY = "2026-10-28";
const areas: PortalArea[] = [
  { options: [
    { status: "Accepted", items: [
      { id: 1, itemType: "Part", brand: "Samsung", model: "QN85", shortDescription: "85 inch TV", quantity: 1, cost: 2098.9, sellPrice: 2799, total: { amount: 2799 }, supplier: "21st" },
      { id: 2, itemType: "Part", brand: "Wyze", model: "C2", quantity: 3, cost: 34.99, sellPrice: 0, total: { amount: 0 } },
      { id: 3, itemType: "Labor", description: "Installation", quantity: 8, cost: 50, sellPrice: 120, total: { amount: 960 } },
      { id: 4, itemType: "CustomItem", description: "Custom bracket", quantity: 2, cost: 10, sellPrice: 40, total: { amount: 80 } },
    ] },
    { status: "Draft", items: [{ id: 9, itemType: "Part", quantity: 1, cost: 99999, total: { amount: 0 } }] },
  ] },
];
const proposal: PlanProposal = { id: 1935053, number: 3154, name: "Glait Res. - Drapery Tracks", total: 10557.83, accepted_at: "2026-09-29T20:17:12Z", sales_tax: 575.47, areas };
const co: PlanChangeOrder = { id: 1977615, number: 1, name: "Change Order #1", status: "Accepted", total: 2118.18, decided_at: "2026-10-21T17:40:07Z", sales_tax: 120, areas: [{ options: [{ status: "Accepted", items: [{ id: 50, itemType: "Part", quantity: 2, cost: 100 }] }] }] };
const paid: PlanRequest = { id: 397653, status: "Paid", amount: 8446.26, dueDate: "2026-09-29T20:17:12Z", description: "Payment 1 for Proposal #3154", paymentMethod: "CreditCard" };
const open: PlanRequest = { id: 412744, status: "Submitted", amount: 2111.57, dueDate: "2026-11-15T12:05:14Z", description: "Payment 2 for Proposal #3154", paymentMethod: null };
const plan = (over: Partial<Parameters<typeof planTransactions>[0]> = {}) => planTransactions({ projectId: 77, proposal, changeOrders: [co], requests: [paid, open], mainId: null, existing: [], today: TODAY, ...over });

describe("FIN-i an accepted proposal becomes an Approved Proposal with its items", () => {
  it("creates the main proposal with the title as Description, the accepted date, Sales Tax and Parts = Σ cost × qty of Part + CustomItem", () => {
    const p = plan({ changeOrders: [], requests: [] });
    expect(p.create).toHaveLength(1);
    const m = p.create[0];
    expect(m.key).toBe("main");
    expect(m.values).toMatchObject({ payment_type: "Apply to Project", project_id: 77, type: "Proposal", description: "Glait Res. - Drapery Tracks", portal_number: "3154", amount: 10557.83, date: "2026-09-29", is_change_order: false, sales_tax: 575.47, portal_proposal_id: 1935053 });
    // 2098.90 + 3 × 34.99 + 2 × 10 = 2223.87; the Labor line and the Draft option stay out
    expect(m.values.parts_cost).toBe(2223.87);
    expect(p.items).toEqual([{ key: "main", rows: expect.any(Array) }]);
    expect(p.items[0].rows).toHaveLength(4);
    expect(p.items[0].rows[0]).toMatchObject({ portal_item_id: 1, item_type: "Part", brand: "Samsung", name: "85 inch TV", quantity: 1, cost: 2098.9, sell_price: 2799, total: 2799, supplier: "21st" });
  });
  it("the Parts rule alone", () => {
    expect(partsCost(acceptedItems(areas))).toBe(2223.87);
    expect(partsCost([{ itemType: "Labor", cost: 50, quantity: 2 }])).toBeNull();
    expect(partsCost([{ itemType: "Part", cost: null, quantity: 2 }])).toBeNull();
    // no option marked Accepted → every option counts
    expect(acceptedItems([{ options: [{ status: "Draft", items: [{ id: 1 }] }, { status: "Draft", items: [{ id: 2 }] }] }])).toHaveLength(2);
  });
  it("the main proposal already linked by hand (PI-c) only gets its ids, tax and parts: Amount and Description stay for Refresh / Replace", () => {
    const existing: ExistingTx[] = [{ id: 1249, type: "Proposal", amount: 5113.53, description: "typed by hand", invoice_status: null, due_date: null, due_date_edited_at: null, parent_transaction_id: null, sales_tax: null, parts_cost: null, portal_proposal_id: null, portal_change_order_id: null, portal_request_id: null, portal_synced: null }];
    const p = plan({ changeOrders: [], requests: [], mainId: 1249, existing });
    expect(p.create).toEqual([]);
    expect(p.update).toEqual([{ id: 1249, set: { portal_proposal_id: 1935053, sales_tax: 575.47, parts_cost: 2223.87 }, why: "main" }]);
  });
});

describe("FIN-i change orders", () => {
  it("an accepted change order is its own Approved Proposal row, numbered <main>CO<n>, flagged, with its parts; a pending one is not", () => {
    const p = plan({ requests: [] });
    const c = p.create.find((x) => x.key === "co")!;
    expect(c.values).toMatchObject({ type: "Proposal", is_change_order: true, portal_number: "3154CO1", description: "Change Order #1", amount: 2118.18, date: "2026-10-21", sales_tax: 120, parts_cost: 200, portal_proposal_id: 1935053, portal_change_order_id: 1977615 });
    expect(p.items.find((i) => i.key === "co:1977615")?.rows).toHaveLength(1);
    const pending = plan({ changeOrders: [{ ...co, status: "ViewedByClient" }], requests: [] });
    expect(pending.create.filter((x) => x.key === "co")).toEqual([]);
    expect(changeOrderNumber(3166, 2, 9)).toBe("3166CO2");
  });
  it("a change order whose total changed in Portal.io is updated, unless a person edited the Amount here", () => {
    const row: ExistingTx = { id: 5, type: "Proposal", amount: 2000, description: "Change Order #1", invoice_status: null, due_date: null, due_date_edited_at: null, parent_transaction_id: 4, sales_tax: 120, parts_cost: 200, portal_proposal_id: 1935053, portal_change_order_id: 1977615, portal_request_id: null, portal_synced: { amount: 2000, description: "Change Order #1" } };
    const p = plan({ requests: [], existing: [row] });
    const u = p.update.find((x) => x.why === "co:1977615")!;
    expect(u.set.amount).toBe(2118.18);
    expect(p.kept).toEqual([]);
    const edited = plan({ requests: [], existing: [{ ...row, amount: 1500 }] }); // the person changed 2000 → 1500
    expect(edited.update.find((x) => x.why === "co:1977615")!.set.amount).toBeUndefined();
    expect(edited.kept[0]).toMatch(/Amount edited here/);
  });
});

describe("FIN-j payment requests → Invoices, paid requests → Payments", () => {
  it("creates an Invoice per request (Due Date in Eastern time, Portal.io status word) and a Payment for the paid one with the method mapped and no fee", () => {
    const p = plan({ changeOrders: [] });
    const invoices = p.create.filter((x) => x.key === "invoice");
    expect(invoices).toHaveLength(2);
    expect(invoices[0].values).toMatchObject({ type: "Invoice", description: "Payment 1 for Proposal #3154", amount: 8446.26, due_date: "2026-09-29", invoice_status: "Paid", portal_request_id: 397653, date: TODAY });
    expect(invoices[1].values).toMatchObject({ invoice_status: "Submitted", due_date: "2026-11-15", portal_request_id: 412744 });
    const payments = p.create.filter((x) => x.key === "payment");
    expect(payments).toHaveLength(1);
    expect(payments[0].values).toMatchObject({ type: "Payment", amount: 8446.26, method: "Credit Card", portal_request_id: 397653, date: TODAY });
    expect(payments[0].values.cc_fee).toBeUndefined(); // the API has no fee: the office types it (FIN-a)
  });
  it("Draft and Cancelled requests make no invoice; a request first seen Declined makes none either", () => {
    const p = plan({ changeOrders: [], requests: [{ ...open, status: "Draft" }, { ...open, id: 2, status: "Cancelled" }, { ...open, id: 3, status: "Declined" }] });
    expect(p.create.filter((x) => x.key !== "main")).toEqual([]);
  });
  it("maps the methods Portal.io uses", () => {
    expect(mapMethod("CreditCard")).toBe("Credit Card");
    expect(mapMethod("Wire Transfer")).toBe("Wire");
    expect(mapMethod("ACH")).toBe("ACH");
    expect(mapMethod("QuickBooks")).toBe("Other");
    expect(mapMethod(null)).toBeNull();
    expect(dateET("2026-09-30T02:30:00Z")).toBe("2026-09-29"); // 10:30 PM Eastern the day before
    expect(dateET("2026-10-01")).toBe("2026-10-01");
  });
});

describe("FIN-k idempotent, and a person's edits are never written over", () => {
  const existingFrom = (p: ReturnType<typeof plan>, ids: number[]): ExistingTx[] =>
    p.create.map((c, i) => ({ id: ids[i], type: c.values.type, amount: c.values.amount as number, description: c.values.description as string, invoice_status: (c.values.invoice_status as string | null) ?? null, due_date: (c.values.due_date as string | null) ?? null, due_date_edited_at: null, parent_transaction_id: c.key === "co" ? ids[0] : null, sales_tax: (c.values.sales_tax as number | null) ?? null, parts_cost: (c.values.parts_cost as number | null) ?? null, portal_proposal_id: (c.values.portal_proposal_id as number | null) ?? null, portal_change_order_id: (c.values.portal_change_order_id as number | null) ?? null, portal_request_id: (c.values.portal_request_id as number | null) ?? null, portal_synced: c.values.portal_synced }));
  it("a second run over the same data creates nothing and changes nothing", () => {
    const first = plan();
    expect(first.create.map((c) => c.key)).toEqual(["main", "co", "invoice", "payment", "invoice"]);
    const existing = existingFrom(first, [1, 2, 3, 4, 5]);
    const second = plan({ mainId: 1, existing });
    expect(second.create).toEqual([]);
    expect(second.update).toEqual([]);
    expect(second.kept).toEqual([]);
  });
  it("a Due Date moved by the office stays; the status still follows Portal.io; a paid request adds the Payment once", () => {
    const first = plan({ changeOrders: [] });
    const existing = existingFrom(first, [1, 3, 4, 5]);
    const inv = existing.find((t) => t.portal_request_id === 412744)!;
    inv.due_date = "2026-12-20";
    inv.due_date_edited_at = "2026-10-28T10:00:00Z";
    const second = plan({ changeOrders: [], mainId: 1, existing, requests: [paid, { ...open, status: "Paid", paymentMethod: "ACH" }] });
    const u = second.update.find((x) => x.why === "invoice:412744")!;
    expect(u.set.due_date).toBeUndefined();
    expect(u.set.invoice_status).toBe("Paid");
    expect(second.kept[0]).toMatch(/Due Date moved here to 2026-12-20/);
    const pays = second.create.filter((x) => x.key === "payment");
    expect(pays).toHaveLength(1);
    expect(pays[0].values).toMatchObject({ portal_request_id: 412744, method: "ACH", amount: 2111.57 });
  });
  it("syncOwns: a field equal to what the sync wrote is the sync's; a different one is the person's", () => {
    const t: ExistingTx = { id: 1, type: "Invoice", amount: 100, description: "x", invoice_status: "Viewed", due_date: "2026-01-01", due_date_edited_at: null, parent_transaction_id: null, sales_tax: null, parts_cost: null, portal_proposal_id: null, portal_change_order_id: null, portal_request_id: 9, portal_synced: { amount: 100, invoice_status: "Submitted" } };
    expect(syncOwns(t, "amount")).toBe(true);
    expect(syncOwns(t, "invoice_status")).toBe(false);
    expect(syncOwns(t, "description")).toBe(true); // never written by the sync → free
    expect(syncOwns({ ...t, due_date_edited_at: "2026-01-02T00:00:00Z" }, "due_date")).toBe(false);
  });
});

describe("FIN-k rows typed before the integration are adopted, not duplicated", () => {
  const blank = { invoice_status: null, due_date: null, due_date_edited_at: null, parent_transaction_id: null, sales_tax: null, parts_cost: null, portal_proposal_id: null, portal_change_order_id: null, portal_request_id: null, portal_synced: null };
  it("a Payment imported from the sheet with the same amount gets the request id and keeps its date and fee; the Invoice too", () => {
    const existing: ExistingTx[] = [
      { id: 1, type: "Proposal", date: "2026-09-29", amount: 10557.83, description: "typed", ...blank },
      { id: 2, type: "Payment", date: "2026-10-01", amount: 8446.26, description: "1st payment", ...blank },
      { id: 3, type: "Invoice", date: "2026-09-29", amount: 8446.26, description: "Invoice 1", ...blank },
    ];
    const p = plan({ changeOrders: [], requests: [paid], mainId: 1, existing });
    expect(p.create).toEqual([]);
    expect(p.update.find((u) => u.why === "payment:397653")).toMatchObject({ id: 2, set: { portal_request_id: 397653 } });
    const inv = p.update.find((u) => u.why === "invoice:397653")!;
    expect(inv.id).toBe(3);
    expect(inv.set).toMatchObject({ portal_request_id: 397653, invoice_status: "Paid", due_date: "2026-09-29" });
  });
  it("a different amount is new money: created, the old row left alone", () => {
    const existing: ExistingTx[] = [{ id: 1, type: "Proposal", date: "2026-09-29", amount: 10557.83, description: "typed", ...blank }, { id: 2, type: "Payment", date: "2026-10-01", amount: 5000, description: "deposit", ...blank }];
    const p = plan({ changeOrders: [], requests: [paid], mainId: 1, existing });
    expect(p.create.map((c) => c.key)).toEqual(["invoice", "payment"]);
  });
  it("a hand-typed change order row with the same amount is adopted as the change order", () => {
    const existing: ExistingTx[] = [{ id: 1, type: "Proposal", date: "2026-09-29", amount: 10557.83, description: "typed", ...blank }, { id: 2, type: "Proposal", date: "2026-10-21", amount: 2118.18, description: "CO typed", ...blank }];
    const p = plan({ requests: [], mainId: 1, existing });
    expect(p.create).toEqual([]);
    expect(p.update.find((u) => u.why === "co:1977615")).toMatchObject({ id: 2, set: { portal_change_order_id: 1977615, is_change_order: true, portal_number: "3154CO1" } });
  });
});

describe("FIN-l automatic link only with a single candidate", () => {
  it("one project of the same Portal.io customer → that project; none, two, or a stronger sign elsewhere → the review queue", () => {
    expect(autoLinkCandidate(37748, [1040], [])).toBe(1040);
    expect(autoLinkCandidate(37748, [1040], [{ id: 1040, score: 100 }, { id: 2, score: 60 }])).toBe(1040);
    expect(autoLinkCandidate(37748, [], [])).toBeNull();
    expect(autoLinkCandidate(37748, [1040, 1041], [])).toBeNull();
    expect(autoLinkCandidate(37748, [1040], [{ id: 2, score: 100 }])).toBeNull(); // a Transaction elsewhere already carries the Portal #
    expect(autoLinkCandidate(null, [1040], [])).toBeNull();
  });
});
