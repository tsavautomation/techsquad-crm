// Service Requests (F6 Client portal, Fred 2026-10-10): what a customer asked for in their portal — a service
// call, something that stopped working, a question — with photos or videos from their phone. The customer
// never picks a date: the office calls back, confirms and schedules. A sub-list of the Project (its permissions).
import type { TableDef } from "../types";

const NEW = { column: "", fieldId: 0 };

export const serviceRequests: TableDef = {
  name: "service_requests",
  label: "Service Requests",
  module: "projects",
  itemLabel: "Service Request",
  newRecordLabel: "New Service Request",
  titleFormula: "{kind} – {project_id}",
  origin: "new",
  parent: { table: "projects", field: "project_id" },
  fields: [
    { name: "title", label: "Title", type: "text", hidden: true, legacy: NEW },
    { name: "project_id", label: "Project", type: "lookup", required: true, lookup: { table: "projects" }, legacy: NEW },
    { name: "contact_id", label: "Asked by", type: "lookup", readOnly: true, lookup: { table: "contacts" }, legacy: NEW },
    {
      name: "kind",
      label: "Type",
      type: "select",
      required: true,
      options: [
        { label: "Service call", value: "Service call", color: "#2563eb" },
        { label: "Something stopped working", value: "Something stopped working", color: "#dc2626" },
        { label: "Question", value: "Question", color: "#7c3aed" },
        { label: "Other", value: "Other", color: "#6b7280" },
      ],
      legacy: NEW,
    },
    { name: "description", label: "What is going on", type: "textarea", required: true, maxLength: 2000, legacy: NEW },
    { name: "media", label: "Photos and videos", type: "file", legacy: NEW },
    {
      name: "status",
      label: "Status",
      type: "select",
      required: true,
      default: "Requested",
      heading: "Office",
      options: [
        { label: "Requested", value: "Requested", color: "#d97706" },
        { label: "Scheduled", value: "Scheduled", color: "#2563eb" },
        { label: "Done", value: "Done", color: "#16a34a" },
        { label: "Cancelled", value: "Cancelled", color: "#6b7280" },
      ],
      legacy: NEW,
    },
    { name: "visit_id", label: "Visit", type: "lookup", lookup: { table: "visits" }, help: "The visit scheduled for this request. The customer sees its date and status in the portal.", legacy: NEW },
    { name: "office_notes", label: "Office notes", type: "textarea", maxLength: 2000, help: "Internal. The customer never sees this.", legacy: NEW },
  ],
  rules: [],
  legacy: { table: "" },
};
