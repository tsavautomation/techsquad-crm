// Stock Locations (INV-e Stock flow, SPEC §9.1 INV-e). Not from WebAuthor: where stock units sit —
// the warehouse, each van, a site. A utility list (Lists › Stock Locations), picked on Stock screens.
import type { TableDef } from "../types";

const NEW = { column: "", fieldId: 0 };

export const stockLocations: TableDef = {
  name: "stock_locations",
  label: "Stock Locations",
  module: "utility",
  itemLabel: "Location",
  newRecordLabel: "New Location",
  titleFormula: "{name}",
  origin: "new",
  fields: [
    { name: "title", label: "Title", type: "text", hidden: true, legacy: NEW, maxLength: 200 },
    { name: "name", label: "Location", type: "text", required: true, legacy: NEW, maxLength: 80 },
    {
      name: "kind",
      label: "Kind",
      type: "select",
      required: true,
      default: "Other",
      legacy: NEW,
      options: [
        { label: "Warehouse", value: "Warehouse", color: "#8bc34a" },
        { label: "Van", value: "Van", color: "#2196f3" },
        { label: "Site", value: "Site", color: "#ff9800" },
        { label: "Other", value: "Other", color: "#9e9e9e" },
      ],
    },
    { name: "employee_id", label: "Van of", type: "lookup", legacy: NEW, lookup: { table: "employees" } },
    { name: "active", label: "Active", type: "boolean", default: true, legacy: NEW },
  ],
  rules: [{ id: 900701, title: "Van of, only for vans", when: [{ field: "kind", op: "equal", value: "Van" }], then: [{ do: "show", field: "employee_id" }] }, { id: 900702, title: "Hide Van of otherwise", when: [{ field: "kind", op: "not_equal", value: "Van" }], then: [{ do: "hide", field: "employee_id" }] }],
  legacy: { table: "" },
};
