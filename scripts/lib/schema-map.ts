// Mapping from registry tables to database/permission concepts. Shared by the
// schema generator and tests.
import type { FieldDef, TableDef } from "../../src/registry/types";

export { lockResource, permissionResource } from "../../src/registry/permissions";

/** Field types stored elsewhere: uploads in `attachments`, computed values in functions. */
export const NO_COLUMN_TYPES: FieldDef["type"][] = ["file", "image", "signature", "computed"];

/** Link table for a many-to-many field, e.g. job_reports.team_ids → job_reports_team. */
export function joinTableName(table: string, field: string) {
  return `${table}_${field.replace(/_ids$/, "")}`;
}

export function projectFinancialsColumns(projects: TableDef) {
  return projects.fields
    .filter((f) => f.type === "computed" && f.computed)
    .map((f) => ({ name: f.name, type: f.computed!.where.type }));
}
