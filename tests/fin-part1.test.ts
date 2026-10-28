import { describe, expect, it } from "vitest";
import { dueBuckets, figures, financialStatus, ordinal, paymentNumbers, reliabilitySuggestion, type FinRow } from "@/lib/finance/status";
import { getTable } from "@/registry";
import { evaluateRules } from "@/lib/rules/evaluate";
import { newRecordValues } from "@/lib/records/values";

// FIN Part 1 (Fred 2026-10-28, SPEC §9.1 FIN-a…FIN-e): the money rules that replace the Sales Projections sheet.
// The eight checks Fred asked for, over the pure rule (project_financials() only aggregates).

const TODAY = "2026-10-28";
const base: FinRow = { project_id: 1, approved_amount: 10000, invoiced_amount: 0, paid_amount: 0, discount_amount: 0, cc_fee_amount: 0, tip_amount: 0, sales_tax: 0, parts_cost: 0, open_invoice_dues: [], job_status: "Installation", category: "Low Voltage", commission_percent: null, commission_amount: null };

describe("FIN-c Financial Status, in order", () => {
  it("1. a Complete project with a balance is Delinquent", () => {
    expect(financialStatus({ ...base, job_status: "Complete", paid_amount: 4000 }, 0, TODAY)).toBe("Delinquent");
  });
  it("2. a project under way with an invoice past due is Past Due; the grace delays it", () => {
    const r = { ...base, open_invoice_dues: ["2026-10-20"] };
    expect(financialStatus(r, 0, TODAY)).toBe("Past Due");
    expect(financialStatus(r, 10, TODAY)).toBe("Current"); // 8 days late, 10 days of grace
    expect(financialStatus(r, 7, TODAY)).toBe("Past Due");
  });
  it("3. moving the Due Date to the future makes it Current again", () => {
    expect(financialStatus({ ...base, open_invoice_dues: ["2026-11-15"] }, 0, TODAY)).toBe("Current");
  });
  it("Balance ≤ 0 wins over everything: Paid", () => {
    expect(financialStatus({ ...base, job_status: "Complete", paid_amount: 10000, open_invoice_dues: ["2026-01-01"] }, 0, TODAY)).toBe("Paid");
    expect(financialStatus({ ...base, paid_amount: 9000, discount_amount: 1000 }, 0, TODAY)).toBe("Paid");
  });
  it("nothing with money is No data; Proposal Denied is never receivable", () => {
    expect(financialStatus({ ...base, approved_amount: 0 }, 0, TODAY)).toBe("No data");
    expect(financialStatus({ ...base, job_status: "Proposal Denied" }, 0, TODAY)).toBe("Paid");
  });
});

describe("FIN-b figures", () => {
  it("4. a card payment with a fee: the fee never reduces the balance and Paid % stays ≤ 100", () => {
    const f = figures({ ...base, approved_amount: 12306.28, paid_amount: 12306.28, cc_fee_amount: 380.86 }, TODAY);
    expect(f.balance).toBe(0);
    expect(f.paidPct).toBe(100);
    expect(f.ccFees).toBe(380.86);
  });
  it("5. a change order adds to Approved (the function sums every Proposal row, main + change orders)", () => {
    // project_financials sums type = 'Proposal' regardless of is_change_order: 82213.19 + 2118.18
    const f = figures({ ...base, approved_amount: 82213.19 + 2118.18, paid_amount: 24569.88 + 49327.91 }, TODAY);
    expect(f.approved).toBeCloseTo(84331.37, 2);
    expect(f.balance).toBeCloseTo(10433.58, 2);
    expect(f.balancePct).toBe(12.4);
  });
  it("discount reduces the balance and is listed apart", () => {
    const f = figures({ ...base, paid_amount: 9500, discount_amount: 500 }, TODAY);
    expect(f.balance).toBe(0);
    expect(f.discount).toBe(500);
  });
  it("next due and days late come from the open invoices", () => {
    const f = figures({ ...base, open_invoice_dues: ["2026-10-01", "2026-11-20"] }, TODAY);
    expect(f.nextDue).toBe("2026-11-20");
    expect(f.daysLate).toBe(27);
  });
});

describe("FIN-e P&L", () => {
  it("6. Profit with and without commission; labor is left out with the warning", () => {
    const without = figures({ ...base, sales_tax: 700, parts_cost: 3000 }, TODAY);
    expect(without.commission).toBe(0);
    expect(without.profit).toBe(6300);
    expect(without.marginPct).toBe(63);
    expect(without.labor).toBeNull();
    const withPct = figures({ ...base, sales_tax: 700, parts_cost: 3000, commission_percent: 10 }, TODAY);
    expect(withPct.commission).toBe(1000);
    expect(withPct.profit).toBe(5300);
    const withAmount = figures({ ...base, sales_tax: 700, parts_cost: 3000, commission_amount: 250 }, TODAY);
    expect(withAmount.commission).toBe(250);
  });
});

describe("FIN-a payments and reliability", () => {
  it("Payment # follows the date order within the project", () => {
    const n = paymentNumbers([
      { id: 9, date: "2026-03-01" },
      { id: 3, date: "2026-01-15" },
      { id: 5, date: "2026-01-15" },
    ]);
    expect(n.get(3)).toBe(1);
    expect(n.get(5)).toBe(2);
    expect(n.get(9)).toBe(3);
    expect(ordinal(1)).toBe("1st");
    expect(ordinal(2)).toBe("2nd");
    expect(ordinal(11)).toBe("11th");
    expect(ordinal(23)).toBe("23rd");
  });
  it("FIN-d reliability suggestion from average days late", () => {
    expect(reliabilitySuggestion([])).toBeNull();
    expect(reliabilitySuggestion([0, 3, -5])).toEqual({ level: "High", avgDays: 1 });
    expect(reliabilitySuggestion([20, 30])).toEqual({ level: "Medium", avgDays: 25 });
    expect(reliabilitySuggestion([60])).toEqual({ level: "Low", avgDays: 60 });
  });
  it("due buckets 30 / 60 / 90", () => {
    expect(dueBuckets([{ due: "2026-10-20", amount: 1 }, { due: "2026-11-10", amount: 2 }, { due: "2026-12-20", amount: 4 }, { due: "2027-01-20", amount: 8 }, { due: "2027-03-01", amount: 16 }], TODAY)).toEqual({ late: 1, d30: 2, d60: 4, d90: 8 });
  });
});

describe("8. Pay Individual / commissions keep working; new fields hide with the Type", () => {
  it("Pay Individual still requires exactly the old fields and shows none of the new ones", () => {
    const t = getTable("transactions");
    const r = evaluateRules(t, { ...newRecordValues(t, TODAY), payment_type: "Pay Individual", type: "Payment" }, TODAY);
    expect([...r.required].sort()).toEqual(["amount", "contact_id", "description", "payment_type", "reason"]);
    for (const f of ["method", "cc_fee", "tip", "discount", "due_date", "invoice_status", "is_change_order", "parts_cost"]) expect(r.visible.has(f), f).toBe(false);
  });
  it("Apply to Project › Payment shows the payment details; Invoice the due date; Proposal the change-order fields", () => {
    const t = getTable("transactions");
    const pay = evaluateRules(t, { ...newRecordValues(t, TODAY), payment_type: "Apply to Project", type: "Payment" }, TODAY);
    expect(pay.visible.has("method") && pay.visible.has("cc_fee") && !pay.visible.has("due_date")).toBe(true);
    const inv = evaluateRules(t, { ...newRecordValues(t, TODAY), payment_type: "Apply to Project", type: "Invoice" }, TODAY);
    expect(inv.visible.has("due_date") && inv.visible.has("invoice_status") && !inv.visible.has("method")).toBe(true);
    const prop = evaluateRules(t, { ...newRecordValues(t, TODAY), payment_type: "Apply to Project", type: "Proposal" }, TODAY);
    expect(prop.visible.has("is_change_order") && prop.visible.has("parts_cost") && !prop.visible.has("cc_fee")).toBe(true);
  });
  it("7. Electrical projects are not in the module", () => {
    // loadFinanceProjects filters category = 'Low Voltage' at the query; the rule itself never looks at the category.
    expect(financialStatus({ ...base, category: "Electrical" }, 0, TODAY)).toBe("Current");
  });
});
