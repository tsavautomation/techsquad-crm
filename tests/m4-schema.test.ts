import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { REGISTRY } from "@/registry";
import { buildPermissions } from "../scripts/lib/permissions-map";
import { joinTableName, lockResource, permissionResource } from "../scripts/lib/schema-map";

const keys = new Set(buildPermissions(JSON.parse(readFileSync("techsquad_crm_spec.json", "utf8"))).map((p) => p.key));
// SPEC §9.1 M12-b: each FLEX form got its own record permissions (migration 20260926080000).
for (const tab of ["job-reports", "notes", "staff-performance", "survey-and-proposals", "tv-installations"])
  for (const action of ["view_page", "view_all", "create", "modify", "delete", "archive"]) keys.add(`forms.${tab}.${action}`);
const migration = readFileSync("supabase/migrations/20260925230100_m4_record_tables.sql", "utf8");

describe("record tables ↔ permission catalogue", () => {
  it("every permission key the database checks exists", () => {
    for (const t of REGISTRY) {
      const resource = permissionResource(t);
      if (resource) {
        for (const action of ["view_page", "view_all", "create", "modify", "delete", "archive"]) {
          expect(keys.has(`${t.module}.${resource}.${action}`), `${t.name}: ${t.module}.${resource}.${action}`).toBe(true);
        }
      }
      const lock = lockResource(t);
      if (lock) {
        for (const action of ["modify_locked", "lock_unlock", "delete_locked"]) {
          expect(keys.has(`${t.module}.${lock}.${action}`), `${t.name}: ${t.module}.${lock}.${action}`).toBe(true);
        }
      }
    }
  });

  it("the utility-list permission keys exist", () => {
    for (const m of ["projects", "administrative", "inventory", "help-desk"]) {
      expect(keys.has(`${m}.module.options_utility_tables`), m).toBe(true);
    }
  });

  it("only child tables and utility lists have no resource", () => {
    const without = REGISTRY.filter((t) => !permissionResource(t)).map((t) => t.name).sort();
    expect(without).toEqual(["brands", "contact_interactions", "kb_categories", "suppliers", "support_notes"]);
  });
});

describe("generated migration", () => {
  it("creates all 28 tables with RLS enabled", () => {
    for (const t of REGISTRY) {
      expect(migration, t.name).toContain(`create table public.${t.name} (`);
      expect(migration, t.name).toContain(`alter table public.${t.name} enable row level security;`);
    }
  });

  it("creates link tables for the many-to-many fields", () => {
    for (const jt of [
      joinTableName("job_reports", "team_ids"),
      joinTableName("job_reports", "tagged_ids"),
      joinTableName("tv_installations", "team_ids"),
      joinTableName("kb_articles", "audience_group_ids"),
    ]) {
      expect(migration, jt).toContain(`create table public.${jt} (`);
    }
  });

  it("never lets clients hard-delete records (no DELETE policy on record tables)", () => {
    for (const t of REGISTRY) {
      expect(migration).not.toMatch(new RegExp(`on public\\.${t.name} for delete`));
    }
  });

  it("has no column for uploads or computed fields", () => {
    expect(migration).not.toMatch(/^\s+job_coi /m);
    expect(migration).not.toMatch(/^\s+approved_amount /m);
    expect(migration).toContain("create function public.project_financials");
  });
});
