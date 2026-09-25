import { describe, expect, it } from "vitest";
import { MODULES } from "@/config/modules";
import { isPublicPath } from "@/lib/supabase/proxy";

describe("module menu (SPEC §1.1)", () => {
  it("has the five WebAuthor modules in order", () => {
    expect(MODULES.map((m) => m.title)).toEqual([
      "Projects",
      "Administrative",
      "Inventory",
      "TS Help Desk",
      "FLEX Forms",
    ]);
  });

  it("keeps WebAuthor tab order for Projects", () => {
    expect(MODULES[0].tabs.map((t) => t.title)).toEqual([
      "Projects",
      "Contacts",
      "Organizations",
      "Buildings / Developments",
      "Permits",
      "Punch List",
    ]);
  });

  it("has unique slugs", () => {
    const slugs = MODULES.flatMap((m) => [m.slug, ...m.tabs.map((t) => `${m.slug}/${t.slug}`)]);
    expect(new Set(slugs).size).toBe(slugs.length);
  });
});

describe("auth guard", () => {
  it("only login, auth callbacks and setup are public", () => {
    expect(isPublicPath("/login")).toBe(true);
    expect(isPublicPath("/auth/callback")).toBe(true);
    expect(isPublicPath("/setup")).toBe(true);
    expect(isPublicPath("/")).toBe(false);
    expect(isPublicPath("/projects")).toBe(false);
    expect(isPublicPath("/loginx")).toBe(false);
  });
});
