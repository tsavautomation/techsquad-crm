// M7: one test per field rule (SPEC §4), written from the spec — not generated from the registry.
// The last test fails if a rule is added to the registry without a case here.
import { describe, expect, it } from "vitest";
import { evaluateRules, type Values } from "@/lib/rules/evaluate";
import { newRecordValues } from "@/lib/records/values";
import { REGISTRY, getTable } from "@/registry";

const TODAY = "2026-09-25";

type Case = {
  rule: number;
  table: string;
  title: string;
  /** Values on top of a fresh record's defaults. */
  values: Values;
  shown?: string[];
  hidden?: string[];
  required?: string[];
  notRequired?: string[];
  set?: Values;
};

const CASES: Case[] = [
  // ---------------------------------------------------------------- Projects (SPEC §4.1)
  { rule: 3370, table: "projects", title: "Building = Yes shows building + unit", values: { in_building: true }, shown: ["building_id", "apartment_or_unit"] },
  { rule: 3371, table: "projects", title: "Building = No hides them", values: { in_building: false }, hidden: ["building_id", "apartment_or_unit"] },
  { rule: 3373, table: "projects", title: "Permit = Yes shows Choose Permit", values: { has_permit: true }, shown: ["permit_id"] },
  { rule: 3372, table: "projects", title: "Permit = No hides Choose Permit", values: { has_permit: false }, hidden: ["permit_id"] },
  { rule: 3374, table: "projects", title: "Designer = Yes shows firm, lead, notes", values: { has_designer: true }, shown: ["design_firm_id", "lead_designer_id", "designer_notes"] },
  { rule: 3463, table: "projects", title: "Designer ≠ Yes hides them", values: { has_designer: false }, hidden: ["design_firm_id", "lead_designer_id", "designer_notes"] },
  { rule: 3376, table: "projects", title: "GC = Yes shows GC org, PM, notes", values: { has_general_contractor: true }, shown: ["general_contractor_id", "gc_pm_id", "general_contractor_notes"] },
  { rule: 3375, table: "projects", title: "GC = No hides them", values: { has_general_contractor: false }, hidden: ["general_contractor_id", "gc_pm_id", "general_contractor_notes"] },
  { rule: 3377, table: "projects", title: "Builder = Yes shows builder + notes", values: { has_builder_developer: true }, shown: ["builder_developer_id", "builder_developer_notes"] },
  { rule: 3378, table: "projects", title: "Builder = No hides them", values: { has_builder_developer: false }, hidden: ["builder_developer_id", "builder_developer_notes"] },
  { rule: 3380, table: "projects", title: "Referral = None hides commission fields", values: { referral_type: "None" }, hidden: ["commission_notes", "referral_contact_id", "referral_organization_id"] },
  { rule: 3379, table: "projects", title: "Referral = Person", values: { referral_type: "Person" }, shown: ["commission_notes", "referral_contact_id"], hidden: ["referral_organization_id"] },
  { rule: 3474, table: "projects", title: "Referral = Organization", values: { referral_type: "Organization" }, shown: ["commission_notes", "referral_organization_id"], hidden: ["referral_contact_id"] },
  {
    rule: 3381, table: "projects", title: "Maintenance Plan = Yes shows the plan fields", values: { maintenance_plan: true },
    shown: ["maintenance_type", "maintenance_status", "maintenance_purchase_date", "maintenance_sales_person_id", "maintenance_amount", "maintenance_history", "maintenance_receipt"],
  },
  {
    rule: 3382, table: "projects", title: "Maintenance Plan = No hides them", values: { maintenance_plan: false },
    hidden: ["maintenance_type", "maintenance_status", "maintenance_purchase_date", "maintenance_sales_person_id", "maintenance_amount", "maintenance_history", "maintenance_receipt"],
  },
  { rule: 3383, table: "projects", title: "Special Orders = Yes shows List Items", values: { special_orders: true }, shown: ["list_items"] },
  { rule: 3471, table: "projects", title: "Special Orders = No hides List Items", values: { special_orders: false }, hidden: ["list_items"] },

  // ---------------------------------------------------------------- Contacts (SPEC §4.2)
  {
    rule: 3289, table: "contacts", title: "Alternate Contact = Yes shows alternate fields", values: { has_alternate_contact: true },
    shown: ["alternate_name", "alternate_role_title", "alternate_phone", "alternate_intl_phone", "alternate_email"],
  },
  {
    rule: 3461, table: "contacts", title: "Alternate Contact ≠ Yes hides them", values: { has_alternate_contact: false },
    hidden: ["alternate_name", "alternate_role_title", "alternate_phone", "alternate_intl_phone", "alternate_email"],
  },
  { rule: 3462, table: "contacts", title: "End Customer: no organization; referral question shown", values: { type: "End Customer" }, hidden: ["organization_id", "role_position"], shown: ["was_referred"] },
  {
    rule: 3296, table: "contacts", title: "Not End Customer: organization shown; referral question and its fields hidden",
    values: { type: "General Contractor", was_referred: true },
    shown: ["organization_id", "role_position"], hidden: ["was_referred", "referred_by_organization_id", "referred_by_contact_id", "referred_by_employee_id"],
  },
  { rule: 3467, table: "contacts", title: "Referred = Yes shows who referred", values: { was_referred: true }, shown: ["referred_by_organization_id", "referred_by_contact_id", "referred_by_employee_id"] },
  { rule: 3468, table: "contacts", title: "Referred = No hides them", values: { was_referred: false }, hidden: ["referred_by_organization_id", "referred_by_contact_id", "referred_by_employee_id"] },

  // ---------------------------------------------------------------- Organizations (SPEC §4.3)
  { rule: 3298, table: "organizations", title: "Commission shown for Concierge", values: { type: "Concierge" }, shown: ["default_commission_markup"] },
  { rule: 3299, table: "organizations", title: "Login/password for Service Provider (case-insensitive, Q5)", values: { type: "Service Provider" }, shown: ["portal_login", "portal_password"], hidden: ["default_commission_markup"] },
  { rule: 3300, table: "organizations", title: "Dealer files for Service Provider", values: { type: "Service Provider" }, shown: ["dealer_number", "dealer_contracts", "price_sheets", "catalogs"] },
  {
    rule: 3301, table: "organizations", title: "Municipality", values: { type: "Municipality" },
    shown: ["portal_login", "portal_password", "coi_file", "coi_expiration"], hidden: ["tax_exempt", "florida_dr13", "default_commission_markup", "dealer_contracts", "logo", "dealer_number", "price_sheets", "catalogs"],
  },
  { rule: 3302, table: "organizations", title: "Tax Exempt question for Commercial Customer", values: { type: "Commercial Customer" }, shown: ["tax_exempt"] },
  {
    rule: 3366, table: "organizations", title: "GC / Builder / Design Firm", values: { type: "General Contractor" },
    shown: ["coi_file", "tax_exempt", "default_commission_markup", "logo", "coi_expiration"], hidden: ["portal_login", "portal_password", "dealer_contracts", "dealer_number", "catalogs", "price_sheets"],
  },
  { rule: 3367, table: "organizations", title: "Tax Exempt = Yes shows DR-13", values: { type: "Supplier", tax_exempt: true }, shown: ["florida_dr13"] },
  { rule: 3368, table: "organizations", title: "Tax Exempt = No hides DR-13", values: { type: "Supplier", tax_exempt: false }, hidden: ["florida_dr13"] },
  {
    rule: 3369, table: "organizations", title: "Realtor", values: { type: "Realtor" },
    shown: ["default_commission_markup", "logo"], hidden: ["portal_login", "coi_file", "tax_exempt", "dealer_contracts", "portal_password", "dealer_number", "catalogs", "price_sheets", "coi_expiration"],
  },
  {
    rule: 3584, table: "organizations", title: "Supplier", values: { type: "Supplier" },
    shown: ["portal_login", "tax_exempt", "dealer_contracts", "logo", "portal_password", "dealer_number", "catalogs", "price_sheets"], hidden: ["coi_file", "default_commission_markup", "coi_expiration"],
  },

  // ---------------------------------------------------------------- Transactions (SPEC §4.4)
  {
    rule: 3476, table: "transactions", title: "Apply to Project", values: { payment_type: "Apply to Project" },
    shown: ["project_id", "type", "portal_number"], hidden: ["contact_id", "organization_id", "reason"],
    required: ["project_id", "type"], notRequired: ["contact_id", "organization_id", "reason"],
  },
  {
    rule: 3477, table: "transactions", title: "Pay Individual", values: { payment_type: "Pay Individual" },
    shown: ["contact_id", "reason"], hidden: ["project_id", "type", "portal_number", "organization_id"],
    required: ["contact_id", "reason"], notRequired: ["project_id", "type"],
  },
  {
    rule: 3478, table: "transactions", title: "Pay Organization", values: { payment_type: "Pay Organization" },
    shown: ["organization_id", "reason"], hidden: ["project_id", "type", "portal_number", "contact_id"],
    required: ["organization_id", "reason"],
  },

  // ---------------------------------------------------------------- Other tables (SPEC §4.5)
  { rule: 3464, table: "employees", title: "D/L expired → status Expired", values: { dl_expiration: "2026-09-24" }, set: { dl_status: "Expired" } },
  { rule: 3579, table: "inventory_checkouts", title: "Materials shows Project", values: { type: "Materials" }, shown: ["project_id"] },
  { rule: 3580, table: "inventory_checkouts", title: "Tools hides and clears Project", values: { type: "Tools", project_id: 7 }, hidden: ["project_id"], set: { project_id: null } },
  { rule: 3364, table: "payouts", title: "Check shows Check Number", values: { payment_method: "Check" }, shown: ["check_number"] },
  { rule: 3365, table: "payouts", title: "Cash hides Check Number", values: { payment_method: "Cash" }, hidden: ["check_number"] },
  { rule: 3600, table: "payouts", title: "Salary reasons show Employee and Amount (Q6)", values: { reason: "Loan" }, shown: ["employee_id", "amount"] },
  { rule: 3822, table: "job_reports", title: "Pending 1 filled shows Pending 2", values: { pending_1: "a" }, shown: ["pending_2"], hidden: ["pending_3"] },
  { rule: 3823, table: "job_reports", title: "Pending 2 filled shows Pending 3", values: { pending_1: "a", pending_2: "b" }, shown: ["pending_3"], hidden: ["pending_4"] },
  { rule: 3827, table: "job_reports", title: "Pending 3 filled shows Pending 4", values: { pending_1: "a", pending_2: "b", pending_3: "c" }, shown: ["pending_4"], hidden: ["pending_5"] },
  { rule: 3828, table: "job_reports", title: "Pending 4 filled shows Pending 5", values: { pending_1: "a", pending_2: "b", pending_3: "c", pending_4: "d" }, shown: ["pending_5"] },
  { rule: 3395, table: "support_notes", title: "Status Closed makes Closed Date required", values: { status: "Closed" }, required: ["closed_date"] },
];

describe("every field rule (SPEC §4)", () => {
  for (const c of CASES) {
    it(`#${c.rule} ${c.table}: ${c.title}`, () => {
      const t = getTable(c.table);
      expect(t.rules.some((r) => r.id === c.rule), `rule ${c.rule} exists on ${c.table}`).toBe(true);
      const r = evaluateRules(t, { ...newRecordValues(t, TODAY), ...c.values }, TODAY);
      for (const f of c.shown ?? []) expect(r.visible.has(f), `${f} shown`).toBe(true);
      for (const f of c.hidden ?? []) expect(r.visible.has(f), `${f} hidden`).toBe(false);
      for (const f of c.required ?? []) expect(r.required.has(f), `${f} required`).toBe(true);
      for (const f of c.notRequired ?? []) expect(r.required.has(f), `${f} not required`).toBe(false);
      for (const [f, v] of Object.entries(c.set ?? {})) expect(r.values[f], `${f} value`).toEqual(v);
    });
  }

  it("covers all 47 rules in the registry", () => {
    const inRegistry = REGISTRY.flatMap((t) => t.rules.map((r) => r.id)).sort();
    const tested = [...new Set(CASES.map((c) => c.rule))].sort();
    expect(inRegistry).toHaveLength(47);
    expect(tested).toEqual(inRegistry);
  });
});

describe("edge cases", () => {
  it("a hidden switch no longer controls anything (Contacts: referral fields disappear with the question)", () => {
    const t = getTable("contacts");
    const r = evaluateRules(t, { ...newRecordValues(t, TODAY), type: "Realtor", was_referred: true }, TODAY);
    expect(r.visible.has("referred_by_contact_id")).toBe(false);
  });

  it("Organizations: DR-13 hides when Tax Exempt itself is hidden (Supplier → Realtor)", () => {
    const t = getTable("organizations");
    const r = evaluateRules(t, { ...newRecordValues(t, TODAY), type: "Realtor", tax_exempt: true }, TODAY);
    expect(r.visible.has("tax_exempt")).toBe(false);
    expect(r.visible.has("florida_dr13")).toBe(false);
  });

  it("hidden fields keep their values (switching back restores them), except where a rule clears", () => {
    const t = getTable("projects");
    const r = evaluateRules(t, { ...newRecordValues(t, TODAY), has_general_contractor: false, gc_pm_id: 5 }, TODAY);
    expect(r.visible.has("gc_pm_id")).toBe(false);
    expect(r.values.gc_pm_id).toBe(5);
  });

  it("date rule uses Eastern 'today': expiring today is not yet expired", () => {
    const t = getTable("employees");
    expect(evaluateRules(t, { dl_expiration: TODAY }, TODAY).values.dl_status).toBeUndefined();
  });

  it("condition values are matched case-insensitively (Q5)", () => {
    const t = getTable("organizations");
    expect(evaluateRules(t, { type: "service provider" }, TODAY).visible.has("portal_login")).toBe(true);
  });

  it("is stable: evaluating the result again changes nothing", () => {
    for (const c of CASES) {
      const t = getTable(c.table);
      const once = evaluateRules(t, { ...newRecordValues(t, TODAY), ...c.values }, TODAY);
      const twice = evaluateRules(t, once.values, TODAY);
      expect([...twice.visible].sort(), `rule ${c.rule}`).toEqual([...once.visible].sort());
      expect(twice.values).toEqual(once.values);
    }
  });
});
