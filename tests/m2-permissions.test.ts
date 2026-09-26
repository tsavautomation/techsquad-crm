import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildPermissions, effectivePermissions, GROUPS, type PermissionRow } from "../scripts/lib/permissions-map";
import { visibleModules } from "@/config/modules";

const spec = JSON.parse(readFileSync("techsquad_crm_spec.json", "utf8"));
const seeded = buildPermissions(spec);

/**
 * Grants after the M12 permission review (SPEC §9.1 M12-a/b/d, migration 20260926080000):
 * Everyone loses the Projects-module record keys, each FLEX form gets its own keys
 * (Technicians none on Staff Performance), Office Management + COO get Admin's inventory access.
 */
function reviewed(rows: PermissionRow[]): PermissionRow[] {
  const FORM_TABS = ["job-reports", "notes", "staff-performance", "survey-and-proposals", "tv-installations"];
  const RECORD = ["view_page", "view_all", "create", "modify", "delete", "archive"];
  const out: PermissionRow[] = [];
  for (const r of rows) {
    let groups = r.groups;
    if (/^projects\.(projects|contacts|organizations|buildings|permits)\./.test(r.key)) groups = groups.filter((g) => g !== "everyone");
    if (r.key.startsWith("inventory.") && groups.includes("admin")) groups = [...new Set([...groups, "office_management", "coo"])];
    if (r.module === "forms" && r.resource === "records" && RECORD.includes(r.action)) {
      for (const tab of FORM_TABS) {
        out.push({ ...r, key: `forms.${tab}.${r.action}`, resource: tab, groups: tab === "staff-performance" ? groups.filter((g) => g !== "technician") : groups });
      }
      groups = [];
    }
    out.push({ ...r, groups });
  }
  return out;
}
const rows = reviewed(seeded);

/** "module/tab" list a user in these groups would see in the menu. */
function menuFor(...groups: string[]) {
  return visibleModules(effectivePermissions(rows, groups)).flatMap((m) => m.tabs.map((t) => `${m.slug}/${t.slug}`));
}

const PROJECTS_EVERYONE = [
  "projects/projects",
  "projects/contacts",
  "projects/organizations",
  "projects/buildings",
  "projects/permits",
];
const PROJECTS_TECH = ["projects/projects", "projects/buildings", "projects/permits"];
const FORMS = [
  "forms/job-reports",
  "forms/notes",
  "forms/staff-performance",
  "forms/survey-and-proposals",
  "forms/tv-installations",
];

// Expected menus, written by hand from SPEC §7.3 (not derived from the generator).
describe("menu per group (SPEC §7.3)", () => {
  it("Everyone only: nothing (M12-a: each group grants what its people need)", () => {
    expect(menuFor()).toEqual([]);
  });

  it("Technician: Projects, Buildings, Permits, Punch List; Tasks, RMA, Inventory Checkout; forms except Staff Performance (M12-b)", () => {
    expect(menuFor("technician")).toEqual([
      ...PROJECTS_TECH,
      "projects/punch-list",
      "administrative/rma",
      "administrative/tasks",
      "administrative/inventory-checkout",
      ...FORMS.filter((f) => f !== "forms/staff-performance"),
    ]);
  });

  it("Project Manager: Payroll, Vehicle, RMA, Tasks but not Employees or Transactions", () => {
    expect(menuFor("project_manager")).toEqual([
      ...PROJECTS_EVERYONE,
      "projects/punch-list",
      "administrative/payroll",
      "administrative/vehicles",
      "administrative/rma",
      "administrative/tasks",
      ...FORMS,
    ]);
  });

  it("Admin: no Punch List, no Administrative record tabs; Inventory Product + Stock + Sale (Q11)", () => {
    expect(menuFor("admin")).toEqual([
      ...PROJECTS_EVERYONE,
      "inventory/products",
      "inventory/stock",
      "inventory/sales",
      ...FORMS,
    ]);
  });

  it("Sale has exactly the same grants as Stock (SPEC §9 Q11)", () => {
    for (const r of rows.filter((x) => x.module === "inventory" && x.resource === "sales")) {
      const stock = rows.find((x) => x.key === `inventory.stock.${r.action}`);
      if (stock) expect(new Set(r.groups), r.key).toEqual(new Set(stock.groups));
    }
  });

  it("Office Management: everything except Payroll; Inventory like Admin (M12-d); includes Help Desk", () => {
    expect(menuFor("office_management")).toEqual([
      ...PROJECTS_EVERYONE,
      "projects/punch-list",
      "administrative/employees",
      "administrative/transactions",
      "administrative/vehicles",
      "administrative/rma",
      "administrative/tasks",
      "administrative/inventory-checkout",
      "inventory/products",
      "inventory/stock",
      "inventory/sales",
      "help-desk/tickets",
      "help-desk/articles",
      ...FORMS,
    ]);
  });

  it("Treasurer: Administrative incl. Payroll; Inventory Checkout page but no Help Desk", () => {
    expect(menuFor("treasurer")).toEqual([
      ...PROJECTS_EVERYONE,
      "projects/punch-list",
      "administrative/employees",
      "administrative/payroll",
      "administrative/transactions",
      "administrative/vehicles",
      "administrative/rma",
      "administrative/tasks",
      "administrative/inventory-checkout",
      ...FORMS,
    ]);
  });

  it("Electrical / LV departments grant nothing", () => {
    expect(menuFor("electrical_department", "lv_department")).toEqual([]);
  });

  it("System Administrators see every tab", () => {
    const all = menuFor("system_administrators");
    expect(all).toContain("inventory/sales");
    expect(all).toHaveLength(23);
  });
});

describe("record permissions (SPEC §7.3 spot checks)", () => {
  const has = (groups: string[], key: string) => effectivePermissions(rows, groups).has(key);

  it("Projects: Everyone alone no longer views (M12-a), Technician views but cannot create", () => {
    expect(has([], "projects.projects.view_all")).toBe(false);
    expect(has(["technician"], "projects.projects.view_all")).toBe(true);
    expect(has(["technician"], "projects.projects.create")).toBe(false);
    expect(has(["project_manager"], "projects.projects.create")).toBe(true);
  });

  it("Projects archive only Test/Treasurer (+SA)", () => {
    expect(has(["treasurer"], "projects.projects.archive")).toBe(true);
    expect(has(["office_management"], "projects.projects.archive")).toBe(false);
  });

  it("Organizations: Accounting cannot create (unlike other Projects tabs)", () => {
    expect(has(["accounting"], "projects.organizations.create")).toBe(false);
    expect(has(["accounting"], "projects.contacts.create")).toBe(true);
  });

  it("Payroll: PM creates but cannot modify or view all", () => {
    expect(has(["project_manager"], "administrative.payroll.create")).toBe(true);
    expect(has(["project_manager"], "administrative.payroll.modify")).toBe(false);
    expect(has(["project_manager"], "administrative.payroll.view_all")).toBe(false);
  });

  it("FLEX forms: Technician can add and modify but not delete; PM cannot modify; per form since M12-b", () => {
    expect(has(["technician"], "forms.job-reports.create")).toBe(true);
    expect(has(["technician"], "forms.job-reports.modify")).toBe(true);
    expect(has(["technician"], "forms.job-reports.delete")).toBe(false);
    expect(has(["technician"], "forms.staff-performance.view_page")).toBe(false);
    expect(has(["project_manager"], "forms.tv-installations.modify")).toBe(false);
    expect(has(["technician"], "forms.records.create")).toBe(false);
  });

  it("Site admin (Members/Groups) for Admin and Test only among non-SA groups", () => {
    for (const g of GROUPS.map((x) => x.slug).filter((s) => s !== "system_administrators")) {
      expect(has([g], "site.admin.groups"), g).toBe(g === "admin" || g === "test");
    }
  });
});

describe("catalogue integrity", () => {
  it("every key is unique and well-formed", () => {
    const keys = rows.map((r) => r.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const k of keys) expect(k).toMatch(/^[a-z-]+\.[a-z-]+\.[a-z0-9_]+$/);
  });

  it("every grant refers to a known group", () => {
    const slugs = new Set(GROUPS.map((g) => g.slug));
    for (const r of rows) for (const g of r.groups) expect(slugs.has(g)).toBe(true);
  });
});
