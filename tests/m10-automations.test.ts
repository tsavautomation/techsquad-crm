// The 39 seeded automations (SPEC §5) only refer to tables and fields that exist, and read sensibly.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { describeConditions, describeEvents, type Conditions } from "@/lib/engine/conditions";
import { REGISTRY } from "@/registry";

type Seed = { id: number; table: string; active: boolean; events: string[]; conditions: Conditions; actions: Record<string, unknown>[] };

/** Pull the rows out of the seed migration: (id, 'table', 'title', active, '{events}', 'conditions', 'actions', ...). */
function seeds(): Seed[] {
  const sql = readFileSync("supabase/migrations/20260926040100_m10_automation_seed.sql", "utf8");
  const re = /\((\d+), '(\w+)', '(?:[^']|'')*', (true|false), '\{([^}]*)\}',\s*'([^']*)',\s*'([^']*)'/g;
  return [...sql.matchAll(re)].map((m) => ({
    id: Number(m[1]),
    table: m[2],
    active: m[3] === "true",
    events: m[4] ? m[4].split(",") : [],
    conditions: JSON.parse(m[5]),
    actions: JSON.parse(m[6]),
  }));
}

const tables = new Map(REGISTRY.map((t) => [t.name, t]));
// Columns every record table has besides its registry fields.
const SYSTEM = new Set(["submitted_at", "locked", "archived_at", "deleted_at", "created_at", "updated_at"]);

describe("seeded automations", () => {
  const rows = seeds();

  it("all 39 are there, 38 active (837 disabled, SPEC §9.1 Q8)", () => {
    expect(rows).toHaveLength(39);
    expect(rows.filter((r) => !r.active).map((r) => r.id)).toEqual([837]);
  });

  it("every table, field and option they use exists", () => {
    for (const r of rows.filter((x) => x.active)) {
      const t = tables.get(r.table);
      expect(t, `#${r.id} table`).toBeDefined();
      const has = (f: string) => SYSTEM.has(f) || t!.fields.some((x) => x.name === f);
      for (const e of r.events.filter((x) => x.startsWith("field:"))) expect(has(e.slice(6)), `#${r.id} event ${e}`).toBe(true);
      for (const c of r.conditions.rules) {
        expect(has(c.field), `#${r.id} condition ${c.field}`).toBe(true);
        if (c.field2) expect(has(c.field2), `#${r.id} condition ${c.field2}`).toBe(true);
      }
      for (const a of r.actions) {
        const tokens = JSON.stringify(a).match(/\{(\w+)\}/g) ?? [];
        for (const tok of tokens) expect(has(tok.slice(1, -1)), `#${r.id} token ${tok}`).toBe(true);
        if (a.type === "update") {
          for (const [k, v] of Object.entries(a.set as Record<string, unknown>)) {
            const f = t!.fields.find((x) => x.name === k);
            expect(f, `#${r.id} sets ${k}`).toBeDefined();
            if (v !== null && f?.options) expect(f.options.map((o) => o.value), `#${r.id} ${k} option`).toContain(v);
          }
        }
        if (a.type === "checklist" && a.target) expect(t!.fields.find((x) => x.name === a.target)?.lookup, `#${r.id} target`).toBeDefined();
        for (const f of (a.files as string[] | undefined) ?? []) expect(["file", "image"]).toContain(t!.fields.find((x) => x.name === f)?.type);
      }
    }
  });

  it("describes events and conditions in plain English", () => {
    const label = (f: string) => ({ coi_expiration: "COI Expiration", invoiced_amount: "Invoiced", paid_amount: "Paid" })[f] ?? f;
    expect(describeEvents(["daily", "added", "field:coi_expiration"], label)).toBe("daily, added, COI Expiration changed");
    expect(describeConditions({ match: "all", rules: [{ field: "coi_expiration", days: true, op: ">=", value: 0 }] }, label)).toBe("days since COI Expiration >= 0");
    expect(describeConditions({ match: "all", rules: [{ field: "invoiced_amount", op: "<=", field2: "paid_amount" }] }, label)).toBe("Invoiced <= Paid");
    expect(describeConditions({ match: "all", rules: [] }, label)).toBe("always");
  });
});
