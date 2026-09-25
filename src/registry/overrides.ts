// Form settings (PLAN M12) layered over the registry. Pure: the server loads the rows
// (src/lib/admin/field-settings.ts) and applies them to the shared TableDef objects, so
// forms, lists, validation, emails and automations all see the same labels and options.
import type { FieldDef, FieldOption, TableDef } from "./types";

export type FieldSetting = {
  table_name: string;
  field_name: string;
  label: string | null;
  required: boolean | null;
  help: string | null;
  sort_order: number | null;
  options: FieldOption[] | null;
};

/** Options after settings: base values keep working even if a setting forgot them. */
function mergeOptions(base: FieldOption[] | undefined, override: FieldOption[] | null): FieldOption[] | undefined {
  if (!override || !base) return base;
  const known = new Set(override.map((o) => o.value));
  return [...override.map((o) => ({ ...o })), ...base.filter((o) => !known.has(o.value)).map((o) => ({ ...o }))];
}

/** A table's fields with settings applied (base fields are never modified). */
export function applySettings(baseFields: FieldDef[], settings: FieldSetting[], parentField?: string): FieldDef[] {
  const byField = new Map(settings.map((s) => [s.field_name, s]));
  const fields = baseFields.map((f, i) => {
    const s = byField.get(f.name);
    if (!s) return { field: f, order: i };
    const next: FieldDef = { ...f };
    if (s.label?.trim()) next.label = s.label.trim();
    if (s.required !== null && f.name !== parentField && f.type !== "computed") next.required = s.required;
    if (s.help !== null) next.help = s.help.trim() || undefined;
    if (s.options) next.options = mergeOptions(f.options, s.options);
    return { field: next, order: s.sort_order ?? i };
  });
  // Stable: fields without a new position keep their place relative to each other.
  return fields
    .map((x, i) => ({ ...x, i }))
    .sort((a, b) => a.order - b.order || a.i - b.i)
    .map((x) => x.field);
}

const base = new WeakMap<TableDef, FieldDef[]>();

/** Apply settings to the shared registry objects in place (server only). */
export function applyToRegistry(registry: TableDef[], settings: FieldSetting[]) {
  const byTable = Map.groupBy(settings, (s) => s.table_name);
  for (const t of registry) {
    if (!base.has(t)) base.set(t, t.fields);
    t.fields = applySettings(base.get(t)!, byTable.get(t.name) ?? [], t.parent?.field);
  }
}

/** The registry's own definition of a table's fields, before settings. */
export function baseFields(t: TableDef): FieldDef[] {
  return base.get(t) ?? t.fields;
}
