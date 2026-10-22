// Logins & passwords (F30, Fred 2026-10-22): the office's shared logins — shopping sites, Apple IDs, suppliers,
// software — in one tab. Password and PIN are `sensitive`: encrypted at rest, masked on screen, decrypted only
// for people who may change the record (the office), never in emails or PDFs; `privateFiles` keeps the whole
// table out of OneDrive and the backups. Every reveal or copy is logged (sensitive_reveals).
import type { TableDef } from "../types";

const NEW = { column: "", fieldId: 0 };

export const credentials: TableDef = {
  name: "credentials",
  label: "Logins & passwords",
  module: "administrative",
  tab: "credentials",
  itemLabel: "Login",
  newRecordLabel: "New Login",
  titleFormula: null,
  origin: "new",
  privateFiles: true,
  detailAddon: "credential",
  fields: [
    { name: "title", label: "Site / service", type: "text", required: true, maxLength: 120, listColumn: true, placeholder: "E.g. Amazon, Apple ID (office iPad), ADI", legacy: NEW },
    {
      name: "category",
      label: "Category",
      type: "select",
      required: true,
      listColumn: true,
      options: [
        { label: "Shopping", value: "Shopping", color: "#d97706" },
        { label: "Apple ID", value: "Apple ID", color: "#6b7280" },
        { label: "Supplier", value: "Supplier", color: "#2563eb" },
        { label: "Software and services", value: "Software and services", color: "#7c3aed" },
        { label: "Social media", value: "Social media", color: "#db2777" },
        { label: "Utilities", value: "Utilities", color: "#16a34a" },
        { label: "Other", value: "Other", color: "#64748b" },
      ],
      legacy: NEW,
    },
    { name: "url", label: "Address", type: "url", listColumn: true, placeholder: "https://…", legacy: NEW },
    { name: "username", label: "Username / email", type: "text", maxLength: 200, listColumn: true, legacy: NEW },
    { name: "password", label: "Password", type: "text", sensitive: true, maxLength: 200, legacy: NEW },
    { name: "pin", label: "PIN / security answer", type: "text", sensitive: true, maxLength: 200, legacy: NEW },
    { name: "two_factor", label: "2FA / where the code goes", type: "text", maxLength: 200, placeholder: "E.g. text to Jessica's phone, authenticator on the office iPad", legacy: NEW },
    { name: "phone", label: "Phone", type: "phone", heading: "Account", legacy: NEW },
    { name: "fax", label: "Fax", type: "phone", legacy: NEW },
    { name: "account_number", label: "Account #", type: "text", maxLength: 100, legacy: NEW },
    { name: "contact", label: "Contact", type: "text", maxLength: 200, placeholder: "Our rep there, their phone or email", legacy: NEW },
    { name: "purpose", label: "Used for", type: "text", maxLength: 200, heading: "Notes", placeholder: "E.g. parts orders, the showroom Apple TV", legacy: NEW },
    { name: "notes", label: "Notes", type: "textarea", maxLength: 2000, legacy: NEW },
    { name: "password_changed_on", label: "Password last changed", type: "date", legacy: NEW },
    {
      name: "status",
      label: "Status",
      type: "select",
      required: true,
      default: "Active",
      listColumn: true,
      options: [
        { label: "Active", value: "Active", color: "#16a34a" },
        { label: "Inactive", value: "Inactive", color: "#6b7280" },
      ],
      legacy: NEW,
    },
  ],
  rules: [],
  legacy: { table: "" },
};
