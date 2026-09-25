// Rules engine against SPEC §4 (first pass; M7 adds a test for every rule).
import { describe, expect, it } from "vitest";
import { evaluateRules } from "@/lib/rules/evaluate";
import { getTable } from "@/registry";
import { newRecordValues } from "@/lib/records/values";

const run = (table: string, values: Record<string, unknown>) => evaluateRules(getTable(table), values, "2026-09-25");
const fresh = (table: string) => newRecordValues(getTable(table), "2026-09-25");

describe("Projects (SPEC §4.1)", () => {
  it("new form: Building / Permit / Designer / GC / Builder details hidden, Yes/No default No", () => {
    const r = run("projects", fresh("projects"));
    for (const f of ["building_id", "apartment_or_unit", "permit_id", "design_firm_id", "lead_designer_id", "gc_pm_id", "builder_developer_id"]) {
      expect(r.visible.has(f), f).toBe(false);
    }
    // Referral defaults to None → commission fields hidden
    expect(r.visible.has("commission_notes")).toBe(false);
    expect(r.visible.has("referral_contact_id")).toBe(false);
  });

  it("Building or Development = Yes shows its two fields", () => {
    const r = run("projects", { ...fresh("projects"), in_building: true });
    expect(r.visible.has("building_id")).toBe(true);
    expect(r.visible.has("apartment_or_unit")).toBe(true);
  });

  it("General Contractor Yes/No shows the lookup of the same name", () => {
    const r = run("projects", { ...fresh("projects"), has_general_contractor: true });
    expect(r.visible.has("general_contractor_id")).toBe(true);
    expect(r.visible.has("gc_pm_id")).toBe(true);
  });

  it("Referral = Organization shows Organization, hides Person", () => {
    const r = run("projects", { ...fresh("projects"), referral_type: "Organization" });
    expect(r.visible.has("referral_organization_id")).toBe(true);
    expect(r.visible.has("referral_contact_id")).toBe(false);
    expect(r.visible.has("commission_notes")).toBe(true);
  });
});

describe("Organizations by Type (SPEC §4.3 matrix)", () => {
  const cols = ["default_commission_markup", "tax_exempt", "coi_file", "coi_expiration", "logo", "dealer_number", "portal_login", "portal_password", "dealer_contracts", "price_sheets", "catalogs"];
  const shown = (type: string | null) => {
    const r = run("organizations", { ...fresh("organizations"), type });
    return cols.filter((c) => r.visible.has(c));
  };

  it("Design Firm / Developer Builder / General Contractor", () => {
    for (const t of ["Design Firm", "Developer Builder", "General Contractor"]) {
      expect(shown(t), t).toEqual(["default_commission_markup", "tax_exempt", "coi_file", "coi_expiration", "logo"]);
    }
  });
  it("Concierge", () => expect(shown("Concierge")).toEqual(["default_commission_markup", "tax_exempt", "coi_expiration", "logo"]));
  it("Realtor", () => expect(shown("Realtor")).toEqual(["default_commission_markup", "logo"]));
  it("Commercial Customer", () => expect(shown("Commercial Customer")).toEqual(["tax_exempt", "coi_expiration", "logo"]));
  it("Supplier", () =>
    expect(shown("Supplier")).toEqual(["tax_exempt", "logo", "dealer_number", "portal_login", "portal_password", "dealer_contracts", "price_sheets", "catalogs"]));
  it("Service Provider", () =>
    expect(shown("Service Provider")).toEqual(["coi_expiration", "logo", "dealer_number", "portal_login", "portal_password", "dealer_contracts", "price_sheets", "catalogs"]));
  it("Municipality", () => expect(shown("Municipality")).toEqual(["coi_file", "coi_expiration", "portal_login", "portal_password"]));
  it("none chosen", () => expect(shown(null)).toEqual(["coi_expiration", "logo"]));

  it("Florida DR-13 only when Tax Exempt = Yes", () => {
    expect(run("organizations", { ...fresh("organizations"), type: "Supplier", tax_exempt: true }).visible.has("florida_dr13")).toBe(true);
    expect(run("organizations", { ...fresh("organizations"), type: "Supplier", tax_exempt: false }).visible.has("florida_dr13")).toBe(false);
  });
});

describe("Transactions: required only when visible (SPEC §4.4)", () => {
  it("Apply to Project requires Project + Type, not Pay Individual", () => {
    const r = run("transactions", { ...fresh("transactions"), payment_type: "Apply to Project" });
    expect(r.required.has("project_id")).toBe(true);
    expect(r.required.has("type")).toBe(true);
    expect(r.required.has("contact_id")).toBe(false);
    expect(r.required.has("reason")).toBe(false);
  });
  it("Pay Organization requires Organization + Reason", () => {
    const r = run("transactions", { ...fresh("transactions"), payment_type: "Pay Organization" });
    expect([...r.required].sort()).toEqual(["amount", "description", "organization_id", "payment_type", "reason"]);
  });
});

describe("value actions", () => {
  it("Inventory Checkout: Tools hides AND clears Project", () => {
    const r = run("inventory_checkouts", { ...fresh("inventory_checkouts"), type: "Tools", project_id: 5 });
    expect(r.visible.has("project_id")).toBe(false);
    expect(r.values.project_id).toBeNull();
  });
  it("Employees: D/L Expiration in the past sets D/L Status = Expired", () => {
    expect(run("employees", { dl_expiration: "2026-09-24" }).values.dl_status).toBe("Expired");
    expect(run("employees", { dl_expiration: "2026-09-25" }).values.dl_status).toBeUndefined();
  });
  it("Support Notes: Status = Closed makes Closed Date required", () => {
    expect(run("support_notes", { status: "Closed" }).required.has("closed_date")).toBe(true);
    expect(run("support_notes", { status: "Pending" }).required.has("closed_date")).toBe(false);
  });
  it("Job Report pending boxes cascade", () => {
    const r = run("job_reports", { pending_1: "a", pending_2: "b" });
    expect(r.visible.has("pending_2")).toBe(true);
    expect(r.visible.has("pending_3")).toBe(true);
    expect(r.visible.has("pending_4")).toBe(false);
  });
});
