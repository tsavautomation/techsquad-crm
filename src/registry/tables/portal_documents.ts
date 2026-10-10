// Client Documents (F6 Client portal, Fred 2026-10-10): the PDFs the customer portal can show — manuals,
// quick guides, warranty terms (a library ticked per project on the Project page) or a file meant for one
// project only (signed proposal, TV installation form). Not from WebAuthor; maintained by hand.
import type { TableDef } from "../types";

const NEW = { column: "", fieldId: 0 };

export const portalDocuments: TableDef = {
  name: "portal_documents",
  label: "Client Documents",
  module: "administrative",
  tab: "portal-documents",
  itemLabel: "Client Document",
  newRecordLabel: "New Client Document",
  titleFormula: null,
  origin: "new",
  fields: [
    { name: "title", label: "Title", type: "text", required: true, maxLength: 120, placeholder: "E.g. Crestron Home quick guide, Wi-Fi instructions", legacy: NEW },
    {
      name: "category",
      label: "Category",
      type: "select",
      required: true,
      help: "Add more categories in Admin › Form settings as you need them.",
      options: [
        { label: "Manual", value: "Manual", color: "#2563eb" },
        { label: "Quick guide", value: "Quick guide", color: "#16a34a" },
        { label: "Warranty", value: "Warranty", color: "#7c3aed" },
        { label: "Proposal", value: "Proposal", color: "#d97706" },
        { label: "Form", value: "Form", color: "#0891b2" },
        { label: "Other", value: "Other", color: "#6b7280" },
      ],
      legacy: NEW,
    },
    { name: "file", label: "File", type: "file", required: true, help: "PDF, picture or scan. The customer opens it in the portal.", legacy: NEW },
    {
      name: "project_id",
      label: "Only for this project",
      type: "lookup",
      lookup: { table: "projects" },
      help: "Leave blank for a library document (ticked per project on the Project page). Set a project for a file that belongs to that customer only.",
      legacy: NEW,
    },
    { name: "notes", label: "Notes", type: "textarea", maxLength: 1000, placeholder: "Shown to the customer under the title.", legacy: NEW },
  ],
  rules: [],
  legacy: { table: "" },
};
