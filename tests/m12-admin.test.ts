// Admin screens (PLAN M12): the permissions they rely on exist, and "used" vs WebAuthor-only is sensible.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { MODULES } from "@/config/modules";
import { usedPermissionKeys } from "@/lib/admin/permission-usage";
import { ADMIN_SCREENS, canSeeScreen } from "@/lib/admin/screens";
import { buildPermissions } from "../scripts/lib/permissions-map";

const catalogue = new Set(buildPermissions(JSON.parse(readFileSync("techsquad_crm_spec.json", "utf8"))).map((p) => p.key));

describe("admin permissions", () => {
  it("every admin screen and module tab is guarded by a real WebAuthor permission", () => {
    for (const s of ADMIN_SCREENS) if (Array.isArray(s.anyOf)) for (const k of s.anyOf) expect(catalogue, s.title).toContain(k);
    for (const m of MODULES) for (const t of m.tabs) expect(catalogue, t.title).toContain(t.permission);
  });

  it("marks record permissions as used and WebAuthor-only features as not", () => {
    const used = usedPermissionKeys();
    expect(used).toContain("projects.projects.modify");
    expect(used).toContain("administrative.records.modify_locked");
    expect(used).toContain("site.admin.groups");
    expect(used).not.toContain("administrative.module.binder_binders");
    expect(used).not.toContain("administrative.module.options_impersonate_users");
    const usedInCatalogue = [...catalogue].filter((k) => used.has(k)).length;
    expect(usedInCatalogue).toBeGreaterThan(150);
    expect(usedInCatalogue).toBeLessThan(catalogue.size);
  });

  it("the Permissions screen is for System Administrators only", () => {
    const perms = ADMIN_SCREENS.find((s) => s.href === "/admin/permissions")!;
    expect(canSeeScreen(perms, new Set(catalogue), false)).toBe(false);
    expect(canSeeScreen(perms, new Set(), true)).toBe(true);
  });
});
