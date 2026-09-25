import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildPermissions, effectivePermissions, GROUPS } from "../scripts/lib/permissions-map";
import { visibleModules } from "@/config/modules";

const spec = JSON.parse(readFileSync("techsquad_crm_spec.json", "utf8"));
const rows = buildPermissions(spec);

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
const FORMS = [
  "forms/job-reports",
  "forms/notes",
  "forms/staff-performance",
  "forms/survey-and-proposals",
  "forms/tv-installations",
];

// Expected menus, written by hand from SPEC §7.3 (not derived from the generator).
describe("menu per group (SPEC §7.3)", () => {
  it("Everyone only (e.g. Carlos): Projects module minus Punch List, nothing else", () => {
    expect(menuFor()).toEqual(PROJECTS_EVERYONE);
  });

  it("Technician: all Projects tabs incl. Punch List; Tasks, RMA, Inventory Checkout; FLEX forms", () => {
    expect(menuFor("technician")).toEqual([
      ...PROJECTS_EVERYONE,
      "projects/punch-list",
      "administrative/rma",
      "administrative/tasks",
      "administrative/inventory-checkout",
      ...FORMS,
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

  it("Admin: no Punch List, no Administrative record tabs; Inventory Product + Stock", () => {
    expect(menuFor("admin")).toEqual([...PROJECTS_EVERYONE, "inventory/products", "inventory/stock", ...FORMS]);
  });

  it("Office Management: everything except Payroll, Inventory; includes Help Desk", () => {
    expect(menuFor("office_management")).toEqual([
      ...PROJECTS_EVERYONE,
      "projects/punch-list",
      "administrative/employees",
      "administrative/transactions",
      "administrative/vehicles",
      "administrative/rma",
      "administrative/tasks",
      "administrative/inventory-checkout",
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

  it("Electrical / LV departments grant nothing beyond Everyone", () => {
    expect(menuFor("electrical_department", "lv_department")).toEqual(PROJECTS_EVERYONE);
  });

  it("System Administrators see every tab, including Sale (granted to nobody)", () => {
    const all = menuFor("system_administrators");
    expect(all).toContain("inventory/sales");
    expect(all).toHaveLength(23);
  });
});

describe("record permissions (SPEC §7.3 spot checks)", () => {
  const has = (groups: string[], key: string) => effectivePermissions(rows, groups).has(key);

  it("Projects: everyone views, Technician cannot create", () => {
    expect(has([], "projects.projects.view_all")).toBe(true);
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

  it("FLEX forms: Technician can add and modify but not delete; PM cannot modify", () => {
    expect(has(["technician"], "forms.records.create")).toBe(true);
    expect(has(["technician"], "forms.records.modify")).toBe(true);
    expect(has(["technician"], "forms.records.delete")).toBe(false);
    expect(has(["project_manager"], "forms.records.modify")).toBe(false);
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
