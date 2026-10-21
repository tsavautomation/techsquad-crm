// Project Requests (F26-1, Fred 2026-10-21, "a line on the project, if it's a request for something else"):
// an RFI, a change order or another ask that reached the office about a project, Open until someone marks
// it Done. Who closed it and when are kept by a database trigger (app.project_request_close), so the form,
// the Done button and the future AI routing (F26-3) all leave the same trail. A sub-list of the Project.
import type { TableDef } from "../types";

const NEW = { column: "", fieldId: 0 };

export const projectRequests: TableDef = {
  name: "project_requests",
  label: "Project Requests",
  module: "projects",
  itemLabel: "Project Request",
  newRecordLabel: "New Project Request",
  titleFormula: "{type} – {date}",
  origin: "new",
  parent: { table: "projects", field: "project_id" },
  fields: [
    { name: "title", label: "Title", type: "text", hidden: true, legacy: NEW },
    { name: "project_id", label: "Project", type: "lookup", required: true, lookup: { table: "projects" }, legacy: NEW },
    { name: "date", label: "Date", type: "date", required: true, listColumn: true, legacy: NEW },
    {
      name: "type",
      label: "Type",
      type: "select",
      required: true,
      default: "RFI",
      listColumn: true,
      options: [
        { label: "RFI", value: "RFI", color: "#2563eb" },
        { label: "Change order", value: "Change order", color: "#d97706" },
        { label: "Other", value: "Other", color: "#6b7280" },
      ],
      legacy: NEW,
    },
    { name: "description", label: "Description", type: "textarea", required: true, maxLength: 4000, placeholder: "What is being asked, by whom, and by when", legacy: NEW },
    {
      name: "status",
      label: "Status",
      type: "select",
      required: true,
      default: "Open",
      listColumn: true,
      options: [
        { label: "Open", value: "Open", color: "#d97706" },
        { label: "Done", value: "Done", color: "#16a34a" },
      ],
      legacy: NEW,
    },
    { name: "closed_by", label: "Closed by", type: "user", readOnly: true, formHidden: true, legacy: NEW },
    { name: "closed_at", label: "Closed at", type: "datetime", readOnly: true, formHidden: true, legacy: NEW },
  ],
  rules: [],
  legacy: { table: "" },
};
