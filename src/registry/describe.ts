// Plain-English descriptions of registry pieces, for the field catalogue and later for admin screens.
import type { FieldDef, RuleAction, RuleCondition, TableDef } from "./types";

const TYPE_LABEL: Record<FieldDef["type"], string> = {
  text: "Text",
  textarea: "Long text",
  richtext: "Rich text",
  select: "Dropdown",
  radio: "Radio buttons",
  checkboxes: "Checkboxes",
  boolean: "Yes/No",
  date: "Date",
  datetime: "Date + time",
  money: "Money",
  number: "Number",
  phone: "Phone",
  email: "Email",
  url: "URL",
  address: "Address",
  lookup: "Lookup",
  user: "User",
  group: "User group",
  file: "File upload",
  image: "Image",
  signature: "Signature",
  ssn: "SSN",
  ein: "EIN",
  computed: "Computed",
};

export function describeType(f: FieldDef, tables: Map<string, TableDef>): string {
  const base = TYPE_LABEL[f.type];
  if (f.type === "lookup" && f.lookup) return `${base} → ${tables.get(f.lookup.table)?.label ?? f.lookup.table}${f.multiple ? " (many)" : ""}`;
  return f.multiple ? `${base} (many)` : base;
}

export function describeNotes(f: FieldDef, table: TableDef, tables: Map<string, TableDef>): string[] {
  const notes: string[] = [];
  const label = (name: string, t: TableDef = table) => t.fields.find((x) => x.name === name)?.label ?? name;
  if (f.hidden) notes.push("not on the form");
  if (f.startsHidden) notes.push("starts hidden");
  if (f.readOnly) notes.push("read-only");
  if (f.sensitive) notes.push("sensitive: encrypted & masked");
  if (f.default !== undefined) notes.push(`default: ${f.default === true ? "Yes" : f.default === false ? "No" : f.default}`);
  if (f.maxLength) notes.push(`max ${f.maxLength} chars`);
  if (f.pattern) notes.push("digits, spaces and + - ( ) only");
  if (f.notFuture) notes.push("not in the future");
  if (f.fileTypes) notes.push(`files: ${f.fileTypes.join(", ")}`);
  if (f.placeholder) notes.push(`hint: “${f.placeholder}”`);
  if (f.lookup?.filter) {
    const target = tables.get(f.lookup.table);
    for (const [col, v] of Object.entries(f.lookup.filter)) {
      const colLabel = target ? label(col, target) : col;
      if (typeof v === "string") notes.push(`only where ${colLabel} = ${v}`);
      else if (Array.isArray(v)) notes.push(`only where ${colLabel} is ${v.join(" or ")}`);
      else notes.push(`only where ${colLabel} = this record's ${label(v.sameAs)}`);
    }
  }
  if (f.lookup?.autofill?.length) {
    const target = tables.get(f.lookup.table);
    const pairs = f.lookup.autofill.map((a) => `${target ? label(a.from, target) : a.from} → ${label(a.to)}`);
    notes.push(`fills in ${pairs.join(", ")}${f.lookup.autofillOnlyNonEmpty ? " (if not empty)" : ""}`);
  }
  if (f.computed) notes.push(`sum of Transactions amount where type = ${f.computed.where.type}`);
  return notes;
}

function describeCondition(c: RuleCondition, t: TableDef): string {
  const f = t.fields.find((x) => x.name === c.field);
  const name = f?.label ?? c.field;
  const value = f?.type === "boolean" ? (c.value === "1" ? "Yes" : "No") : f?.options?.find((o) => o.value === c.value)?.label ?? c.value;
  switch (c.op) {
    case "equal":
      return `${name} is ${value}`;
    case "not_equal":
      return `${name} is not ${value}`;
    case "not_empty":
      return `${name} is filled in`;
    case "date_before_today":
      return `${name} is before today`;
  }
}

function describeAction(a: RuleAction, t: TableDef): string {
  const name = t.fields.find((x) => x.name === a.field)?.label ?? a.field;
  switch (a.do) {
    case "show":
      return `show ${name}`;
    case "hide":
      return `hide ${name}`;
    case "clear":
      return `clear ${name}`;
    case "require":
      return `make ${name} required`;
    case "set":
      return `set ${name} to ${a.value}`;
  }
}

export function describeRule(r: TableDef["rules"][number], t: TableDef) {
  return {
    when: r.when.map((c) => describeCondition(c, t)).join(" or "),
    then: r.then.length ? r.then.map((a) => describeAction(a, t)).join(", ") : "(nothing)",
  };
}
