// The registry must match the WebAuthor export (SPEC §3): every user field, label,
// option (label + stored value, in order), required flag and lookup target.
// Deliberate differences are listed explicitly below so they can't creep in silently.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { REGISTRY, getTable } from "@/registry";
import type { FieldDef } from "@/registry/types";

type RawField = Record<string, unknown> & { id: number; type: string; label: string; column_name: string; section: string };
const spec = JSON.parse(readFileSync("techsquad_crm_spec.json", "utf8")) as {
  tables: Record<string, { fields: RawField[]; rules: unknown[] | null }>;
};

const SYSTEM = new Set(["person_id_creator", "person_id_modifier", "date_created", "date_modified", "client_id", "locked", "date_submitted"]);
const byLegacyTable = new Map(REGISTRY.map((t) => [t.legacy.table, t]));
const SUBGRID_SECTIONS: Record<string, string> = {
  "fx_techsquad_projects_xmcontacts:Interactions": "fx_techsquad_projects_xmcontacts_interactions",
  "fx_techsquad_help_desk:Support Note": "fx_techsquad_help_desk_support_note",
};

/** Every exported user field, paired with the registry table it should live in. */
const exported: { legacyTable: string; raw: RawField }[] = [];
for (const [legacyTable, t] of Object.entries(spec.tables)) {
  for (const raw of t.fields) {
    if (raw.section === "Summary" || raw.type === "lookup|client") continue;
    if (SYSTEM.has(raw.column_name) && !(legacyTable === "fx_techsquad_employee_xmrma" && raw.column_name === "date_submitted")) continue;
    exported.push({ legacyTable: SUBGRID_SECTIONS[`${legacyTable}:${raw.section}`] ?? legacyTable, raw });
  }
}

function findField(legacyTable: string, raw: RawField): FieldDef | undefined {
  return byLegacyTable.get(legacyTable)?.fields.find((f) => f.legacy.fieldId === raw.id);
}

const normLabel = (s: string) => s.replace(/\s+/g, " ").trim();

describe("registry ↔ WebAuthor export", () => {
  it("covers all 28 tables", () => {
    expect(REGISTRY).toHaveLength(28);
    for (const legacy of Object.keys(spec.tables)) expect(byLegacyTable.has(legacy), legacy).toBe(true);
  });

  it("has every exported user field, and nothing extra except parent links", () => {
    for (const { legacyTable, raw } of exported) expect(findField(legacyTable, raw), `${legacyTable}.${raw.column_name}`).toBeDefined();
    const expectedCount = exported.length + REGISTRY.filter((t) => t.parent).length;
    expect(REGISTRY.reduce((n, t) => n + t.fields.length, 0)).toBe(expectedCount);
  });

  it("keeps labels identical (whitespace aside)", () => {
    for (const { legacyTable, raw } of exported) expect(findField(legacyTable, raw)!.label).toBe(normLabel(raw.label));
  });

  it("keeps dropdown / radio / checkbox options identical and in order", () => {
    for (const { legacyTable, raw } of exported) {
      const f = findField(legacyTable, raw)!;
      if (!f.options) continue;
      const rawOpts = (JSON.parse(String(raw.options || "[]")) as { label: string; value: string }[])
        .filter((o) => o.value !== "")
        .map((o) => ({ label: String(o.label).trim(), value: String(o.value).trim() }));
      expect(f.options.map(({ label, value }) => ({ label, value })), `${legacyTable}.${raw.column_name}`).toEqual(rawOpts);
    }
  });

  it("keeps required flags", () => {
    for (const { legacyTable, raw } of exported) {
      expect(Boolean(findField(legacyTable, raw)!.required), `${legacyTable}.${raw.column_name}`).toBe(raw.required === "true");
    }
  });

  it("points lookups at the right table", () => {
    for (const { legacyTable, raw } of exported) {
      const target = raw.type.startsWith("lookup|") ? raw.type.slice(7) : null;
      if (!target || ["person", "site_group"].includes(target)) continue;
      expect(findField(legacyTable, raw)!.lookup?.table).toBe(byLegacyTable.get(target)!.name);
    }
  });

  it("has all 49 rules except the two do-nothing rules removed by decision (SPEC §9 Q4)", () => {
    const exportedRules = Object.values(spec.tables).reduce((n, t) => n + (t.rules?.length ?? 0), 0);
    expect(exportedRules).toBe(49);
    const ids = REGISTRY.flatMap((t) => t.rules.map((r) => r.id));
    expect(ids).toHaveLength(47);
    expect(ids).not.toContain(3399);
    expect(ids).not.toContain(3400);
  });

  it("payroll rule 3600 shows Employee and Amount and no longer hides Amount (SPEC §9 Q6)", () => {
    expect(getTable("payouts").rules.find((r) => r.id === 3600)!.then).toEqual([
      { do: "show", field: "employee_id" },
      { do: "show", field: "amount" },
    ]);
  });

  it("Yes/No fields start as No (SPEC §9 Q3)", () => {
    for (const t of REGISTRY) for (const f of t.fields) if (f.type === "boolean") expect(typeof f.default, `${t.name}.${f.name}`).toBe("boolean");
  });
});

describe("registry internal consistency", () => {
  it("rules, auto-fills and lookup filters refer to fields that exist", () => {
    for (const t of REGISTRY) {
      const names = new Set(t.fields.map((f) => f.name));
      for (const r of t.rules) {
        for (const c of r.when) expect(names.has(c.field), `${t.name} rule ${r.id} condition ${c.field}`).toBe(true);
        for (const a of r.then) expect(names.has(a.field), `${t.name} rule ${r.id} action ${a.field}`).toBe(true);
      }
      for (const f of t.fields) {
        if (!f.lookup) continue;
        const target = getTable(f.lookup.table);
        const targetNames = new Set(target.fields.map((x) => x.name));
        for (const a of f.lookup.autofill ?? []) {
          expect(targetNames.has(a.from), `${t.name}.${f.name} autofill from ${a.from}`).toBe(true);
          expect(names.has(a.to), `${t.name}.${f.name} autofill to ${a.to}`).toBe(true);
        }
        for (const [col, v] of Object.entries(f.lookup.filter ?? {})) {
          expect(targetNames.has(col), `${t.name}.${f.name} filter ${col}`).toBe(true);
          if (typeof v === "object" && !Array.isArray(v)) expect(names.has(v.sameAs)).toBe(true);
        }
      }
    }
  });

  it("rule condition values are real option values", () => {
    for (const t of REGISTRY) {
      for (const r of t.rules) {
        for (const c of r.when) {
          const f = t.fields.find((x) => x.name === c.field)!;
          if (f.options && c.value !== undefined) {
            expect(f.options.map((o) => o.value), `${t.name} rule ${r.id}`).toContain(c.value);
          }
        }
      }
    }
  });

  it("only the known broken WebAuthor rule parts were dropped (SPEC §9 Q4, Q6)", () => {
    const dropped = REGISTRY.flatMap((t) => t.rules.filter((r) => r.dropped).map((r) => r.id)).sort();
    expect(dropped).toEqual([3372, 3373, 3600]);
  });

  it("marks the sensitive fields (SPEC §9 Q18)", () => {
    const sensitive = REGISTRY.flatMap((t) => t.fields.filter((f) => f.sensitive).map((f) => `${t.name}.${f.name}`)).sort();
    expect(sensitive).toEqual([
      "employees.ssn",
      "job_reports.logins_and_passwords",
      "organizations.portal_password",
      "projects.system_credentials",
    ]);
  });

  it("every tab in the menu has a registry table", () => {
    const tabs = REGISTRY.filter((t) => t.tab).map((t) => `${t.module}/${t.tab}`);
    expect(tabs).toHaveLength(23);
  });

  it("field names are unique per table and snake_case", () => {
    for (const t of REGISTRY) {
      const names = t.fields.map((f) => f.name);
      expect(new Set(names).size, t.name).toBe(names.length);
      for (const n of names) expect(n, `${t.name}.${n}`).toMatch(/^[a-z][a-z0-9_]*$/);
    }
  });
});
