// Mapping from registry tables to database/permission concepts. Shared by the
// schema generator and tests.
import type { FieldDef, TableDef } from "../../src/registry/types";

/** Field types stored elsewhere: uploads in `attachments`, computed values in functions. */
export const NO_COLUMN_TYPES: FieldDef["type"][] = ["file", "image", "signature", "computed"];

/** Link table for a many-to-many field, e.g. job_reports.team_ids → job_reports_team. */
export function joinTableName(table: string, field: string) {
  return `${table}_${field.replace(/_ids$/, "")}`;
}

/**
 * Permission resource protecting a table: tab slug for most, `records` for the
 * five FLEX forms (they share permissions), none for child tables (they use the
 * parent's) and utility lists (special rule).
 */
export function permissionResource(t: TableDef): string | null {
  if (t.parent) return null;
  if (t.module === "forms") return "records";
  return t.tab ?? null;
}

/** Resource holding a module's "Records: Modify Locked / Lock/Unlock / Delete Locked" permissions. */
const LOCK_RESOURCE: Record<string, string> = {
  projects: "projects",
  administrative: "records",
  inventory: "products",
  "help-desk": "tickets",
  forms: "records",
};

export function lockResource(t: TableDef): string | null {
  return t.parent ? null : (LOCK_RESOURCE[t.module] ?? null);
}

export function projectFinancialsColumns(projects: TableDef) {
  return projects.fields
    .filter((f) => f.type === "computed" && f.computed)
    .map((f) => ({ name: f.name, type: f.computed!.where.type }));
}
