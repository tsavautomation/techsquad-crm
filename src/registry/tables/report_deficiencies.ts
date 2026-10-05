// Report Deficiencies (F18 Visit = Report rule, SPEC §9.1 F18-b). Not from WebAuthor: created by the
// rule, never by hand; Admin / COO excuse them with a reason. Maintained by hand.
import type { TableDef } from "../types";

const NEW = { column: "", fieldId: 0 };

export const reportDeficiencies: TableDef = {
  name: "report_deficiencies",
  label: "Report Deficiencies",
  module: "administrative",
  tab: "report-deficiencies",
  itemLabel: "Report Deficiency",
  newRecordLabel: "New Report Deficiency",
  titleFormula: "{employee_id} – {type} – {date}",
  origin: "new",
  detailAddon: "deficiency",
  fields: [
    { name: "title", label: "Title", type: "text", hidden: true, legacy: NEW },
    { name: "employee_id", label: "Employee", type: "lookup", required: true, heading: "Deficiency", lookup: { table: "employees" }, legacy: NEW },
    { name: "date", label: "Visit date", type: "date", required: true, legacy: NEW },
    { name: "project_id", label: "Project", type: "lookup", lookup: { table: "projects" }, legacy: NEW },
    { name: "visit_id", label: "Visit", type: "lookup", lookup: { table: "visits" }, legacy: NEW },
    {
      name: "type",
      label: "Type",
      type: "select",
      required: true,
      options: [
        { label: "Late", value: "Late", color: "#d97706" },
        { label: "Missing", value: "Missing", color: "#dc2626" },
      ],
      legacy: NEW,
    },
    {
      name: "status",
      label: "Status",
      type: "select",
      required: true,
      default: "Open",
      options: [
        { label: "Pending", value: "Open", color: "#dc2626" },
        { label: "Excused", value: "Excused", color: "#16a34a" },
      ],
      legacy: NEW,
    },
    { name: "report_id", label: "Job Report", type: "lookup", readOnly: true, formHidden: true, lookup: { table: "job_reports" }, legacy: NEW },
    { name: "excuse_reason", label: "Excuse reason", type: "textarea", readOnly: true, formHidden: true, heading: "Excuse", maxLength: 1000, legacy: NEW },
    { name: "excused_by", label: "Excused by", type: "user", readOnly: true, formHidden: true, legacy: NEW },
    { name: "excused_at", label: "Excused at", type: "datetime", readOnly: true, formHidden: true, legacy: NEW },
  ],
  rules: [],
  legacy: { table: "" },
};
