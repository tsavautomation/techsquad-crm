/**
 * Generates src/registry/tables/*.ts from techsquad_crm_spec.json (M3).
 *
 *   npx tsx scripts/generate-registry.ts
 *
 * After the first run the generated files are the source of truth and may be
 * edited by hand; re-running overwrites them (check `git diff` first).
 * Anything the generator could not map is reported and listed in each rule's `dropped`.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import type { FieldDef, FieldOption, FieldType, LookupFilter, RuleAction, RuleCondition, RuleDef, TableDef } from "../src/registry/types";
import { COLUMN_RENAMES, NOT_SYSTEM, RULE_FIXES, SENSITIVE, SUBMIT_WORKFLOWS, SYSTEM_COLUMNS, TABLES } from "./lib/registry-names";

type RawField = Record<string, unknown> & {
  id: number;
  type: string;
  label: string;
  column_name: string;
  section: string;
  place: number;
  rules: number;
};
type RawRule = { title: string; triggers: string[]; actions: string[] };
type RawTable = { sections: Record<string, { title: string; config?: unknown }>; fields: RawField[]; rules: RawRule[] | null };

const spec = JSON.parse(readFileSync("techsquad_crm_spec.json", "utf8")) as { tables: Record<string, RawTable> };
const warnings: string[] = [];

// ---------------------------------------------------------------- which raw fields belong to which table

/** Tables whose fields sit in a section of another table's export. */
const SECTION_HOST: Record<string, string> = {
  fx_techsquad_projects_xmcontacts_interactions: "fx_techsquad_projects_xmcontacts",
  fx_techsquad_help_desk_support_note: "fx_techsquad_help_desk",
};

function rawFieldsFor(legacy: string): RawField[] {
  const meta = TABLES[legacy];
  const host = SECTION_HOST[legacy] ?? legacy;
  const fields = spec.tables[host].fields.filter((f) => f.section !== "Summary");
  const own = meta.section ? fields.filter((f) => f.section === meta.section) : fields;
  return own
    .map((f, i) => ({ f, i }))
    .sort((a, b) => a.f.place - b.f.place || a.i - b.i)
    .map(({ f }) => f)
    .filter((f) => {
      if (NOT_SYSTEM.has(`${legacy}.${f.column_name}`)) return true;
      if (SYSTEM_COLUMNS.has(f.column_name)) return false;
      if (f.type === "lookup|client") return false;
      return true;
    });
}

// ---------------------------------------------------------------- column naming

function lookupTarget(f: RawField): string | null {
  return f.type.startsWith("lookup|") ? f.type.slice(7) : null;
}

/** legacy table → (legacy column → new column), built for every table up front so lookups can reference each other. */
const NAMES = new Map<string, Map<string, string>>();
for (const legacy of Object.keys(TABLES)) {
  const map = new Map<string, string>();
  const renames = COLUMN_RENAMES[legacy] ?? {};
  for (const f of rawFieldsFor(legacy)) {
    let name = renames[f.column_name] ?? f.column_name;
    const target = lookupTarget(f);
    if (!renames[f.column_name] && target && TABLES[target] && f.allow_multiple !== "true" && !name.endsWith("_id")) {
      name = `${name}_id`;
    }
    map.set(f.column_name, name);
  }
  const values = [...map.values()];
  const dupes = values.filter((v, i) => values.indexOf(v) !== i);
  if (dupes.length) throw new Error(`${legacy}: duplicate column names ${dupes.join(", ")}`);
  NAMES.set(legacy, map);
}

const newName = (legacyTable: string, legacyColumn: string) => NAMES.get(legacyTable)?.get(legacyColumn);

// ---------------------------------------------------------------- field mapping

const TYPE_MAP: Record<string, FieldType> = {
  text: "text",
  textarea: "textarea",
  editor: "richtext",
  select: "select",
  select2: "select",
  radiobuttongroup: "radio",
  radio: "radio",
  checkbox: "checkboxes",
  boolean: "boolean",
  date: "date",
  datetime: "datetime",
  currency: "money",
  numeric: "number",
  phone: "phone",
  email: "email",
  url: "url",
  address: "address",
  upload: "file",
  mediaimage: "image",
  signature: "signature",
  ssn: "ssn",
  sunbiz: "ein",
  computed: "computed",
};

const TEXTUAL: FieldType[] = ["text", "textarea", "phone", "email", "url", "address", "ssn", "ein"];

function parseJson<T>(raw: unknown, fallback: T): T {
  if (typeof raw !== "string" || !raw.trim()) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function fieldType(f: RawField): FieldType {
  const target = lookupTarget(f);
  if (target === "person") return "user";
  if (target === "site_group") return "group";
  if (target) return "lookup";
  if (f.type === "hidden") return f.column_type === "integer" ? "number" : "text";
  if (f.type === "radiobuttongroup" && f.allow_multiple === "true") return "checkboxes";
  const t = TYPE_MAP[f.type];
  if (!t) throw new Error(`Unknown field type ${f.type} (${f.label})`);
  return t;
}

function parseLookupFilter(raw: string, targetLegacy: string): LookupFilter | undefined {
  const text = raw.replace(/\/\*.*?\*\//g, "").trim();
  if (!text) return undefined;
  const filter: LookupFilter = {};
  for (const clause of text.split(/\bAND\b/i).map((s) => s.trim()).filter(Boolean)) {
    let m = clause.match(/^(\w+)\s*=\s*'([^']*)'$/);
    if (m) {
      filter[newName(targetLegacy, m[1]) ?? m[1]] = m[2];
      continue;
    }
    m = clause.match(/^(\w+)\s+IN\s*\((.*)\)$/i);
    if (m) {
      filter[newName(targetLegacy, m[1]) ?? m[1]] = [...m[2].matchAll(/'([^']*)'/g)].map((x) => x[1]);
      continue;
    }
    m = clause.match(/^(\w+)\s*=\s*\{XM:contact_type\}$/);
    if (m) {
      filter[newName(targetLegacy, m[1]) ?? m[1]] = { sameAs: "type" };
      continue;
    }
    warnings.push(`unparsed lookup filter "${clause}"`);
  }
  return filter;
}

function mapField(legacy: string, f: RawField): FieldDef {
  const table = TABLES[legacy].name;
  const type = fieldType(f);
  const name = newName(legacy, f.column_name)!;
  const cfg = parseJson<Record<string, unknown>>(f.custom_config, {});
  const def: FieldDef = { name, label: String(f.label).replace(/\s+/g, " ").trim(), type, legacy: { column: f.column_name, fieldId: f.id } };

  if (f.required === "true") def.required = true;
  if (f.disable === "true") def.readOnly = true;
  const rulesTouch = Number(f.rules) > 0;
  if (f.type === "hidden" || (f.hide_on_modify === "true" && !rulesTouch)) def.hidden = true;
  if (f.hide_on_modify === "true" && rulesTouch) def.startsHidden = true;
  if (typeof f.section_heading === "string" && f.section_heading.trim()) def.heading = f.section_heading.trim();

  if (["select", "radio", "checkboxes"].includes(type)) {
    const opts = parseJson<{ label: string; value: string; color?: string }[]>(f.options, []);
    def.options = opts
      .filter((o) => o.value !== "" && o.value !== null)
      .map((o): FieldOption => ({ label: String(o.label).trim(), value: String(o.value).trim(), ...(o.color ? { color: o.color } : {}) }));
  }
  if (f.allow_multiple === "true") def.multiple = true;

  const target = lookupTarget(f);
  if (type === "lookup" && target) {
    const meta = TABLES[target];
    if (!meta) throw new Error(`${legacy}.${f.column_name}: lookup to unknown table ${target}`);
    def.lookup = { table: meta.name };
    if (typeof f.lookup_filter === "string") {
      const filter = parseLookupFilter(f.lookup_filter, target);
      if (filter) def.lookup.filter = filter;
    }
    const detail = cfg.lookup_detail as { mapping?: Record<string, string>; update_only_nonempty?: boolean } | undefined;
    if (detail?.mapping) {
      def.lookup.autofill = [];
      for (const [toCode, fromColumn] of Object.entries(detail.mapping)) {
        const to = newName(legacy, toCode.replace(`${legacy}_`, ""));
        const from = newName(target, fromColumn);
        if (!to || !from) {
          warnings.push(`${table}.${name}: auto-fill ${fromColumn} → ${toCode} dropped (field does not exist)`);
          continue;
        }
        def.lookup.autofill.push({ from, to });
      }
      if (detail.update_only_nonempty) def.lookup.autofillOnlyNonEmpty = true;
    }
  }

  const dv = f.default_value;
  if (typeof dv === "string" && dv !== "") {
    if (/^#now\(\)#$/i.test(dv)) def.default = type === "datetime" ? "now" : "today";
    else if (type === "boolean") def.default = dv === "1";
    else def.default = dv;
  }
  // SPEC §9 Q3: a Yes/No box is never blank — it starts as No, so "= No" rules apply on a new form.
  if (type === "boolean" && def.default === undefined) def.default = false;

  const max = Number(f.maxlength);
  if (TEXTUAL.includes(type) && max > 1) def.maxLength = max;
  if (typeof cfg.pattern === "string") def.pattern = cfg.pattern;
  if (typeof cfg.maxlength === "number") def.maxLength = Math.min(def.maxLength ?? Infinity, cfg.maxlength);
  if (typeof f.placeholder === "string" && f.placeholder && f.placeholder !== "Auto-Generated") def.placeholder = f.placeholder;
  if (f.max === "#NOW()#") def.notFuture = true;
  if (typeof cfg.file_extensions === "string") def.fileTypes = cfg.file_extensions.split(",").map((s) => s.trim());

  if (type === "computed" && typeof f.dynamic_code_sql === "string") {
    const m = f.dynamic_code_sql.match(/payin_type_1 = '(\w+)'/);
    def.computed = { kind: "sum", table: "transactions", field: "amount", where: { project_id: "$id", type: m?.[1] ?? "?" } };
  }

  if (SENSITIVE.has(`${table}.${name}`)) def.sensitive = true;
  return def;
}

// ---------------------------------------------------------------- rules

const norm = (s: string) => s.replace(/\s+/g, " ").trim().toLowerCase();

type Resolved = { table: string; field: FieldDef };

function candidates(label: string, pool: Resolved[]) {
  return pool.filter((r) => norm(r.field.label) === norm(label));
}

/** Pick the field a rule condition refers to. */
function resolveCondition(label: string, value: string, pool: Resolved[], rawRules: Map<FieldDef, number>): Resolved | undefined {
  let c = candidates(label, pool);
  if (c.length > 1 && (value === "0" || value === "1")) c = c.filter((r) => r.field.type === "boolean");
  if (c.length > 1) c = c.filter((r) => r.field.options?.some((o) => norm(o.value) === norm(value) || norm(o.label) === norm(value)));
  if (c.length > 1) c = c.filter((r) => (rawRules.get(r.field) ?? 0) > 0);
  return c.length === 1 ? c[0] : undefined;
}

/** Pick the field a rule action refers to (never the field that triggered the rule). */
function resolveAction(label: string, pool: Resolved[], triggers: FieldDef[], rawRules: Map<FieldDef, number>): Resolved | undefined {
  let c = candidates(label, pool);
  if (c.length > 1) c = c.filter((r) => !triggers.includes(r.field));
  if (c.length > 1) c = c.filter((r) => (rawRules.get(r.field) ?? 0) > 0);
  return c.length === 1 ? c[0] : undefined;
}

function parseRules(
  raws: RawRule[],
  pool: Resolved[],
  rawRules: Map<FieldDef, number>,
): { table: string; rule: RuleDef }[] {
  const out: { table: string; rule: RuleDef }[] = [];
  for (const raw of raws) {
    const idMatch = raw.title.match(/Rule #(\d+):\s*(.*)$/);
    const rule: RuleDef = { id: Number(idMatch?.[1]), title: (idMatch?.[2] ?? raw.title).trim(), when: [], then: [] };
    const dropped: string[] = [];
    const owners = new Set<string>();
    const triggerFields: FieldDef[] = [];

    for (const t of raw.triggers) {
      const m = t.match(/^(.*?) \[(\w+)\]\s*(.*)$/);
      if (!m) {
        dropped.push(`condition "${t}"`);
        continue;
      }
      const [, label, op, value] = m;
      const r = resolveCondition(label, value, pool, rawRules);
      if (!r) {
        dropped.push(`condition "${t}"`);
        continue;
      }
      owners.add(r.table);
      triggerFields.push(r.field);
      let cond: RuleCondition;
      if (op === "equal" || op === "not_equal") {
        // Conditions use stored values; WebAuthor sometimes wrote the label or a different case.
        const opt = r.field.options?.find((o) => norm(o.value) === norm(value) || norm(o.label) === norm(value));
        cond = { field: r.field.name, op, value: opt ? opt.value : value };
      } else if (op === "not_empty") cond = { field: r.field.name, op: "not_empty" };
      else if (op === "date_less_than" || op === "date_days_lt") cond = { field: r.field.name, op: "date_before_today" };
      else {
        dropped.push(`condition "${t}" (operator ${op})`);
        continue;
      }
      if (!rule.when.some((w) => JSON.stringify(w) === JSON.stringify(cond))) rule.when.push(cond);
    }

    const DO: Record<string, RuleAction["do"]> = {
      "show-field": "show",
      "hide-field": "hide",
      "set-value": "set",
      "clear-value": "clear",
      "toggle-required": "require",
    };
    for (const a of raw.actions) {
      const m = a.match(/^\[([\w-]+)\]\s*(.*)$/);
      const verb = m && DO[m[1]];
      if (!m || !verb) {
        dropped.push(`action "${a}"`);
        continue;
      }
      const rest = m[2].trim();
      if (!rest) {
        dropped.push(`action "${a}" (no target field)`);
        continue;
      }
      let action: RuleAction | undefined;
      if (verb === "set") {
        // "D/L Status Expired" → field "D/L Status", value "Expired"
        const r = pool
          .filter((p) => norm(rest).startsWith(norm(p.field.label) + " "))
          .sort((x, y) => y.field.label.length - x.field.label.length)[0];
        if (r) {
          owners.add(r.table);
          const value = rest.slice(r.field.label.length).trim();
          const opt = r.field.options?.find((o) => norm(o.label) === norm(value) || norm(o.value) === norm(value));
          action = { do: "set", field: r.field.name, value: opt ? opt.value : value };
        }
      } else {
        const r = resolveAction(rest, pool, triggerFields, rawRules);
        if (r) {
          owners.add(r.table);
          action = { do: verb, field: r.field.name } as RuleAction;
        }
      }
      if (!action) {
        dropped.push(`action "${a}" (field not found)`);
        continue;
      }
      if (!rule.then.some((x) => JSON.stringify(x) === JSON.stringify(action))) rule.then.push(action);
    }

    if (dropped.length) rule.dropped = [...new Set(dropped)];
    if (owners.size > 1) warnings.push(`rule ${rule.id} spans tables ${[...owners].join(", ")}`);
    const table = [...owners][0];
    if (!table) {
      warnings.push(`rule ${rule.id} "${rule.title}" resolved to no table — skipped`);
      continue;
    }
    out.push({ table, rule });
  }
  return out;
}

// ---------------------------------------------------------------- assemble

function sectionConfig(legacy: string): Record<string, unknown> {
  const meta = TABLES[legacy];
  const host = SECTION_HOST[legacy] ?? legacy;
  const sections = Object.values(spec.tables[host].sections);
  const sec = meta.section ? sections.find((s) => s.title === meta.section) : sections.find((s) => s.title !== "Summary");
  return parseJson<Record<string, unknown>>(sec?.config, (sec?.config as Record<string, unknown>) ?? {});
}

const defs = new Map<string, TableDef>();
const rawRuleCounts = new Map<FieldDef, number>();

for (const [legacy, meta] of Object.entries(TABLES)) {
  const raws = rawFieldsFor(legacy);
  const fields = raws.map((f) => {
    const def = mapField(legacy, f);
    rawRuleCounts.set(def, Number(f.rules) || 0);
    return def;
  });
  if (meta.parent) {
    fields.unshift({
      name: meta.parent.field,
      label: TABLES[Object.keys(TABLES).find((k) => TABLES[k].name === meta.parent!.table)!].label,
      type: "lookup",
      required: true,
      hidden: true,
      lookup: { table: meta.parent.table },
      legacy: { column: "parent_id", fieldId: 0 },
    });
  }
  const cfg = sectionConfig(legacy);
  const workflow = SUBMIT_WORKFLOWS[String(cfg.on_record_submit_workflow ?? "0")];
  const def: TableDef = {
    name: meta.name,
    label: meta.label,
    module: meta.module,
    ...(meta.tab ? { tab: meta.tab } : {}),
    itemLabel: String(cfg.item_title ?? meta.label),
    newRecordLabel: String(cfg.new_record_title ?? `New ${meta.label}`),
    ...(meta.parent ? { parent: meta.parent } : {}),
    ...(cfg.show_submit_button || workflow ? { submit: { showButton: Boolean(cfg.show_submit_button), ...(workflow ? { workflow } : {}) } } : {}),
    titleFormula: meta.titleFormula,
    fields,
    rules: [],
    legacy: { table: legacy },
  };
  defs.set(legacy, def);
}

// Rules: resolve against the host table and its sub-grid tables, then attach to whichever table they target.
for (const [legacy, raw] of Object.entries(spec.tables)) {
  if (!raw.rules?.length || !defs.has(legacy)) continue;
  const related = [legacy, ...Object.entries(SECTION_HOST).filter(([, host]) => host === legacy).map(([child]) => child)];
  const pool: Resolved[] = related.flatMap((l) => defs.get(l)!.fields.filter((f) => !f.hidden).map((field) => ({ table: l, field })));
  for (const { table, rule } of parseRules(raw.rules, pool, rawRuleCounts)) defs.get(table)!.rules.push(rule);
}

// Decided fixes to WebAuthor errors (SPEC §9 Q4, Q6).
for (const def of defs.values()) {
  def.rules = def.rules.filter((r) => !(RULE_FIXES.removeRules as readonly number[]).includes(r.id));
  for (const fix of RULE_FIXES.removeActions) {
    const rule = def.rules.find((r) => r.id === fix.rule);
    if (rule) rule.then = rule.then.filter((a) => !(a.do === fix.do && a.field === fix.field));
  }
}

// ---------------------------------------------------------------- write files

mkdirSync("src/registry/tables", { recursive: true });
const header = (legacy: string) =>
  `// Generated from techsquad_crm_spec.json (WebAuthor table ${legacy}) by scripts/generate-registry.ts.\n` +
  `// Now maintained by hand: edit freely, but keep labels and options identical to SPEC.md.\n`;

const exportsList: { file: string; ident: string }[] = [];
for (const [legacy, def] of defs) {
  const ident = def.name.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
  writeFileSync(
    `src/registry/tables/${def.name}.ts`,
    `${header(legacy)}import type { TableDef } from "../types";\n\nexport const ${ident}: TableDef = ${JSON.stringify(def, null, 2)};\n`,
    "utf8",
  );
  exportsList.push({ file: def.name, ident });
}

writeFileSync(
  "src/registry/index.ts",
  `// Generated by scripts/generate-registry.ts — list of all registry tables.\n` +
    `import type { TableDef } from "./types";\n` +
    exportsList.map((e) => `import { ${e.ident} } from "./tables/${e.file}";\n`).join("") +
    `\nexport const REGISTRY: TableDef[] = [\n${exportsList.map((e) => `  ${e.ident},`).join("\n")}\n];\n\n` +
    `const BY_NAME = new Map(REGISTRY.map((t) => [t.name, t]));\n\n` +
    `export function getTable(name: string): TableDef {\n  const t = BY_NAME.get(name);\n  if (!t) throw new Error(\`Unknown table \${name}\`);\n  return t;\n}\n`,
  "utf8",
);

const fieldCount = [...defs.values()].reduce((n, d) => n + d.fields.length, 0);
const ruleCount = [...defs.values()].reduce((n, d) => n + d.rules.length, 0);
console.log(`${defs.size} tables, ${fieldCount} fields, ${ruleCount} rules written to src/registry/`);
const droppedRules = [...defs.values()].flatMap((d) => d.rules.filter((r) => r.dropped).map((r) => `  rule ${r.id} (${d.name}): ${r.dropped!.join("; ")}`));
if (droppedRules.length) console.log(`Rules with dropped parts:\n${droppedRules.join("\n")}`);
if (warnings.length) console.log(`Warnings:\n${warnings.map((w) => `  ${w}`).join("\n")}`);
