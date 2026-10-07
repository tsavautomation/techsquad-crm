// Documents (F23, Fred 2026-10-07): the company's important papers in one place — operating licences,
// insurance certificates, workers' comp — each a file with a title, grouped by category on a board.
// Replaces the old CRM's "WIKI" tab. Not from WebAuthor; maintained by hand.
import type { TableDef } from "../types";

const NEW = { column: "", fieldId: 0 };

export const companyDocuments: TableDef = {
  name: "company_documents",
  label: "Documents",
  module: "administrative",
  tab: "documents",
  itemLabel: "Document",
  newRecordLabel: "New Document",
  titleFormula: null,
  origin: "new",
  fields: [
    { name: "title", label: "Title", type: "text", required: true, maxLength: 120, placeholder: "E.g. Liability insurance 2026, State licence", legacy: NEW },
    {
      name: "category",
      label: "Category",
      type: "select",
      required: true,
      help: "The group the document sits in on the board. Add more categories in Admin › Form settings as you need them.",
      // Fred's first two groups; admins add others in Form settings (overrides merge with these).
      options: [
        { label: "Insurance", value: "Insurance", color: "#2563eb" },
        { label: "Licences", value: "Licences", color: "#16a34a" },
        { label: "Contracts", value: "Contracts", color: "#7c3aed" },
        { label: "Other", value: "Other", color: "#6b7280" },
      ],
      legacy: NEW,
    },
    { name: "file", label: "File", type: "file", required: true, help: "PDF, photo or scan of the document.", legacy: NEW },
    { name: "expires_on", label: "Expires on", type: "date", help: "Leave blank when the document does not expire.", legacy: NEW },
    { name: "notes", label: "Notes", type: "textarea", maxLength: 2000, placeholder: "Policy number, who issued it, where the original is…", legacy: NEW },
  ],
  rules: [],
  legacy: { table: "" },
};
