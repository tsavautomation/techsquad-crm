// Record values: defaults, which fields are stored in the record's own row, and validation.
// Shared by the form (browser) and saveRecord (server).
import { todayET } from "@/lib/dates";
import type { RuleResult, Values } from "@/lib/rules/evaluate";
import type { FieldDef, TableDef } from "@/registry/types";

export type Address = { street?: string; address_2?: string; city?: string; state?: string; zip?: string };

/** Field types with no column of their own (uploads live in attachments, computed values are calculated). */
const NOT_IN_ROW: FieldDef["type"][] = ["file", "image", "signature", "computed"];

/** Fields stored as a column on the record row. */
export function isRowField(f: FieldDef) {
  return !NOT_IN_ROW.includes(f.type) && !((f.type === "lookup" || f.type === "group") && f.multiple);
}

/** An uploaded file in form state. `id` is set once it is saved as an attachment. */
export type FileItem = { id?: string; path: string; name: string; mime: string | null; size: number | null; url?: string };

/** Field types the form can edit (computed values are calculated, never typed in). */
export const EDITABLE_TYPES: FieldDef["type"][] = [
  "text",
  "textarea",
  "richtext",
  "select",
  "radio",
  "checkboxes",
  "boolean",
  "date",
  "datetime",
  "money",
  "number",
  "phone",
  "email",
  "url",
  "address",
  "lookup",
  "user",
  "group",
  "file",
  "image",
  "signature",
  "ssn",
  "ein",
];

export const UPLOAD_TYPES: FieldDef["type"][] = ["file", "image", "signature"];
export const isUpload = (f: FieldDef) => UPLOAD_TYPES.includes(f.type);
export const isMultiLookup = (f: FieldDef) => (f.type === "lookup" || f.type === "group") && Boolean(f.multiple);

export function isEditable(f: FieldDef) {
  return EDITABLE_TYPES.includes(f.type) && !f.readOnly && !f.hidden;
}
export function newRecordValues(t: TableDef, today: string = todayET()): Values {
  const v: Values = {};
  for (const f of t.fields) {
    if (f.type === "checkboxes" || isUpload(f) || isMultiLookup(f)) v[f.name] = [];
    else if (f.type === "boolean") v[f.name] = f.default === true;
    else if (f.default === "today") v[f.name] = today;
    else if (f.default === "now") v[f.name] = new Date().toISOString();
    else if (typeof f.default === "string") v[f.name] = f.default;
    else v[f.name] = null;
  }
  return v;
}

export function isBlank(v: unknown): boolean {
  if (v === null || v === undefined || v === "") return true;
  if (Array.isArray(v)) return v.length === 0;
  if (typeof v === "object") return Object.values(v as object).every((x) => x === null || x === undefined || String(x).trim() === "");
  return typeof v === "string" && v.trim() === "";
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const URL_RE = /^(https?:\/\/)?[\w.-]+\.[a-z]{2,}(\/\S*)?$/i;

/** Validate visible, editable values. Returns field → message. */
export function validate(t: TableDef, values: Values, rules: RuleResult, today: string = todayET()): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const f of t.fields) {
    if (!rules.visible.has(f.name)) continue;
    const v = values[f.name];
    if (rules.required.has(f.name) && isBlank(v)) {
      errors[f.name] = "Required";
      continue;
    }
    if (isBlank(v) || !EDITABLE_TYPES.includes(f.type)) continue;

    switch (f.type) {
      case "select":
      case "radio":
        if (f.options && !f.options.some((o) => o.value === v)) errors[f.name] = "Choose one of the options";
        break;
      case "checkboxes":
        if (!Array.isArray(v) || v.some((x) => !f.options?.some((o) => o.value === x))) errors[f.name] = "Invalid choice";
        break;
      case "email":
        if (!EMAIL.test(String(v).trim())) errors[f.name] = "Enter a valid email address";
        break;
      case "url":
        if (!URL_RE.test(String(v).trim())) errors[f.name] = "Enter a valid web address";
        break;
      case "money":
      case "number":
        if (typeof v !== "number" || !Number.isFinite(v)) errors[f.name] = "Enter a number";
        else if (f.type === "number" && !Number.isInteger(v)) errors[f.name] = "Enter a whole number";
        break;
      case "date":
        if (!/^\d{4}-\d{2}-\d{2}$/.test(String(v))) errors[f.name] = "Enter a date";
        else if (f.notFuture && String(v) > today) errors[f.name] = "Can't be in the future";
        break;
      case "datetime":
        if (Number.isNaN(Date.parse(String(v)))) errors[f.name] = "Enter a date and time";
        break;
      case "ssn":
        if (String(v).replace(/\D/g, "").length !== 9) errors[f.name] = "Enter 9 digits";
        break;
      case "ein":
        if (String(v).replace(/\D/g, "").length !== 9) errors[f.name] = "Enter the 9-digit EIN";
        break;
      case "lookup":
      case "group":
        if (f.multiple ? !Array.isArray(v) || v.some((x) => typeof x !== "number") : typeof v !== "number") errors[f.name] = "Choose from the list";
        break;
    }
    if (errors[f.name]) continue;
    if (typeof v === "string") {
      if (f.maxLength && v.length > f.maxLength) errors[f.name] = `At most ${f.maxLength} characters`;
      else if (f.pattern && !new RegExp(f.pattern).test(v)) errors[f.name] = "Only digits, spaces and + - ( ) allowed";
    }
  }
  return errors;
}

/** Tidy user input before validation: trim text, blank strings → null. */
export function normalize(t: TableDef, values: Values): Values {
  const out: Values = { ...values };
  for (const f of t.fields) {
    const v = out[f.name];
    if (typeof v === "string") {
      const s = f.type === "textarea" ? v.replace(/\s+$/, "") : v.trim();
      out[f.name] = s === "" ? null : s;
    } else if (f.type === "address" && v && typeof v === "object") {
      out[f.name] = isBlank(v) ? null : v;
    }
  }
  return out;
}
