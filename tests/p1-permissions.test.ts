// P1 Simple permissions (SPEC §9.1 P1): the per-person checklist, the seed and the migration agree.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { MODULES, visibleModules } from "@/config/modules";
import { ADMIN_SCREENS, canSeeScreen } from "@/lib/admin/screens";
import { ADMIN_ITEMS, availableChecklist, checklist, checklistKeys, RECORD_COLUMNS, WORKFLOW_ITEMS } from "@/lib/permissions/checklist";
import { seedKeys, USER_PERMISSIONS } from "../scripts/data/user-permissions";
import { USERS } from "../scripts/data/users";

const migration = readFileSync("supabase/migrations/20261002010000_p1_user_permissions.sql", "utf8");
const keys = checklistKeys();

describe("checklist", () => {
  it("has one grid row per list, one extras list per module, then workflows and admin", () => {
    const sections = checklist();
    for (const m of MODULES) {
      const grid = sections.find((s) => s.id === m.slug)!;
      expect(grid.kind).toBe("grid");
      for (const r of grid.rows) expect(r.items.map((i) => i.label)).toEqual(RECORD_COLUMNS.map(([, l]) => l));
      expect(sections.find((s) => s.id === `${m.slug}-more`)?.kind).toBe("list");
    }
    // Calendar and Visits share one resource, so one row.
    expect(sections.find((s) => s.id === "schedule")!.rows.map((r) => r.title)).toEqual(["Calendar, map and visits"]);
    expect(sections.at(-2)!.id).toBe("workflows");
    expect(sections.at(-1)!.id).toBe("admin");
  });

  it("covers every module tab, the admin screens and the workflows", () => {
    for (const m of MODULES) for (const t of m.tabs) expect(keys, t.title).toContain(t.permission);
    for (const s of ADMIN_SCREENS) if (Array.isArray(s.anyOf)) for (const k of s.anyOf) expect(keys, s.title).toContain(k);
    expect(keys).toContain("projects.projects.modify_locked");
    expect(keys).toContain("administrative.records.lock_unlock");
    expect(keys).toContain("forms.records.delete_locked");
    expect(keys).toContain("projects.module.options_utility_tables");
    for (const w of WORKFLOW_ITEMS) expect(keys).toContain(w.key);
    expect(keys.has("site.admin.groups")).toBe(false);
  });

  it("hides items the database catalogue doesn't have", () => {
    const avail = availableChecklist(new Set(["projects.projects.view_page", "projects.projects.create"]));
    expect(avail).toHaveLength(1);
    expect(avail[0].rows[0].items.map((i) => i.key)).toEqual(["projects.projects.view_page", "projects.projects.create"]);
  });

  it("the migration keeps exactly the checklist keys (plus the workflow keys it adds)", () => {
    const kept = new Set([...migration.matchAll(/^'([a-z_.-]+)',?$/gm)].map((m) => m[1]));
    // Workflow keys are inserted by the same migration; Insights got its own key later (20261002020000).
    const LATER = new Set(["insights.page.view", "job_costing.view"]); // added by later migrations (20261002020000, 20261002080000)
    const expected = new Set([...keys].filter((k) => !k.startsWith("workflow.") && !LATER.has(k)));
    expect([...kept].sort()).toEqual([...expected].sort());
    expect(migration).toContain(`'workflow.' || w.id || '.act'`);
    for (const w of WORKFLOW_ITEMS) expect(w.key).toMatch(/^workflow\.[a-z_]+\.act$/);
    for (const t of ["workflow_level_groups", "group_permissions", "group_members", "groups"]) expect(migration).toContain(`drop table public.${t};`);
  });
});

describe("seed (scripts/data/user-permissions.ts)", () => {
  it("has an entry per login, with only checklist keys", () => {
    for (const u of USERS) {
      const s = USER_PERMISSIONS[u.email];
      expect(s, u.email).toBeDefined();
      for (const k of seedKeys(s)) expect(keys, `${u.email}: ${k}`).toContain(k);
    }
  });

  it("keeps what the old groups gave: Fred administrator, Jessica the office, the technician the field", () => {
    expect(USER_PERMISSIONS["fred@tsav.net"].admin).toBe(true);
    const menu = (email: string) => visibleModules(new Set(seedKeys(USER_PERMISSIONS[email]))).flatMap((m) => m.tabs.map((t) => `${m.slug}/${t.slug}`));
    expect(menu("info@tsav.net")).toEqual(["schedule/calendar", "schedule/map", "schedule/visits", "projects/projects", "projects/buildings", "projects/permits", "projects/punch-list", "administrative/rma", "administrative/tasks", "administrative/inventory-checkout", "forms/job-reports", "forms/notes", "forms/survey-and-proposals", "forms/tv-installations"]);
    expect(menu("jessica@tsav.net")).toContain("administrative/transactions");
    expect(menu("lucas@tsav.net")).not.toContain("administrative/transactions");
    const jessica = new Set(seedKeys(USER_PERMISSIONS["jessica@tsav.net"]));
    expect(jessica.has("workflow.project_proposal.act")).toBe(true);
    expect(jessica.has("workflow.stock_status.act")).toBe(true);
    expect(new Set(seedKeys(USER_PERMISSIONS["info@tsav.net"])).has("workflow.project_proposal.act")).toBe(false);
    expect(ADMIN_ITEMS.map((a) => a.key)).toContain("site.admin.members");
  });
});

describe("admin screens", () => {
  it("no Groups or Permissions screen; Users is for user admins", () => {
    expect(ADMIN_SCREENS.map((s) => s.href)).not.toContain("/admin/groups");
    expect(ADMIN_SCREENS.map((s) => s.href)).not.toContain("/admin/permissions");
    const users = ADMIN_SCREENS.find((s) => s.href === "/admin/users")!;
    expect(canSeeScreen(users, new Set(["site.admin.members"]), false)).toBe(true);
    expect(canSeeScreen(users, new Set(), false)).toBe(false);
  });
});
