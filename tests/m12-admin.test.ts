// Admin screens (PLAN M12): the permissions they rely on are real checklist keys (per person since SPEC §9.1 P1).
import { describe, expect, it } from "vitest";
import { MODULES } from "@/config/modules";
import { ADMIN_SCREENS, canSeeScreen } from "@/lib/admin/screens";
import { checklistKeys } from "@/lib/permissions/checklist";

const keys = checklistKeys();

describe("admin permissions", () => {
  it("every admin screen and module tab is guarded by a checklist key", () => {
    for (const s of ADMIN_SCREENS) if (Array.isArray(s.anyOf)) for (const k of s.anyOf) expect(keys, s.title).toContain(k);
    for (const m of MODULES) for (const t of m.tabs) expect(keys, t.title).toContain(t.permission);
  });

  it("the checklist has no WebAuthor-only features", () => {
    expect(keys).toContain("projects.projects.modify");
    expect(keys).toContain("administrative.records.modify_locked");
    expect(keys.has("administrative.module.binder_binders")).toBe(false);
    expect(keys.has("administrative.module.options_impersonate_users")).toBe(false);
    expect(keys.has("site.admin.groups")).toBe(false);
  });

  it("OneDrive is for administrators only", () => {
    const od = ADMIN_SCREENS.find((s) => s.href === "/admin/onedrive")!;
    expect(canSeeScreen(od, keys, false)).toBe(false);
    expect(canSeeScreen(od, new Set(), true)).toBe(true);
  });
});
