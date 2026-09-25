// Shape and sanity checks for an automation (SPEC §5), shared by the editor (M12) and the tests.
// Pure: no database. `check` also confirms every field, option and token exists on the table.
import { z } from "zod";
import type { TableDef } from "@/registry/types";

const Rule = z.object({
  field: z.string().min(1),
  op: z.enum(["=", "!=", "<", "<=", ">", ">=", "empty", "not_empty"]),
  value: z.union([z.string(), z.number(), z.boolean(), z.null()]).optional(),
  field2: z.string().min(1).optional(),
  days: z.boolean().optional(),
});

export const ConditionsSchema = z.object({ match: z.enum(["all", "any"]), rules: z.array(Rule) });

const addressList = z.array(z.string().trim().min(1)).default([]);

export const ActionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("update"), set: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])) }),
  z.object({ type: z.literal("archive") }),
  z.object({ type: z.literal("checklist"), target: z.string().optional(), item: z.string().trim().min(1) }),
  z.object({
    type: z.literal("email"),
    from: z.string().trim().min(1),
    to: addressList,
    cc: addressList.optional(),
    bcc: addressList.optional(),
    subject: z.string().trim().min(1),
    card: z.boolean().optional(),
    link: z.boolean().optional(),
    pdf: z.boolean().optional(),
    files: z.array(z.string()).optional(),
  }),
]);

export const EVENT_RE = /^(added|modified|daily|hourly|field:\w+)$/;

export const AutomationSchema = z.object({
  title: z.string().trim().min(1, "Title is required").max(120),
  active: z.boolean(),
  events: z.array(z.string().regex(EVENT_RE)),
  conditions: ConditionsSchema,
  actions: z.array(ActionSchema).min(1, "Add at least one action"),
  notes: z.string().trim().max(500).nullable().optional(),
});

export type AutomationInput = z.infer<typeof AutomationSchema>;

// Columns every record table has besides its registry fields.
const SYSTEM = new Set(["submitted_at", "locked", "archived_at", "created_at", "updated_at"]);
const EMAIL_OR_TOKEN = /^([^\s@<>]+@[^\s@<>]+\.[^\s@<>]+|\{\w+\})$/;
const FROM = /^([^\s@<>]+@tsav\.net|[\w .'-]+)$/i;

/** Problems with an automation on table `t`, in plain English (empty = fine). */
export function check(t: TableDef, a: AutomationInput): string[] {
  const errors: string[] = [];
  const field = (name: string) => t.fields.find((f) => f.name === name);
  const has = (name: string) => SYSTEM.has(name) || Boolean(field(name));
  const label = (name: string) => field(name)?.label ?? name;

  if (!a.events.length) errors.push("Choose when it runs.");
  for (const e of a.events) if (e.startsWith("field:") && !has(e.slice(6))) errors.push(`Unknown field in "when": ${e.slice(6)}`);

  for (const r of a.conditions.rules) {
    if (!has(r.field)) errors.push(`Unknown field in a condition: ${r.field}`);
    if (r.field2 !== undefined && !has(r.field2)) errors.push(`Unknown field in a condition: ${r.field2}`);
    if (r.days && !["date", "datetime"].includes(field(r.field)?.type ?? "") && !SYSTEM.has(r.field)) errors.push(`"Days since" needs a date field, not ${label(r.field)}.`);
    if (r.days && (r.value === undefined || r.value === null || Number.isNaN(Number(r.value)))) errors.push(`"Days since ${label(r.field)}" needs a number of days.`);
  }

  const tokens = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]);
  for (const act of a.actions) {
    switch (act.type) {
      case "update":
        if (!Object.keys(act.set).length) errors.push("A “set field” action has no field.");
        for (const [k, v] of Object.entries(act.set)) {
          const f = field(k);
          if (!f) errors.push(`Unknown field to set: ${k}`);
          else if (f.readOnly && f.type === "computed") errors.push(`${f.label} is calculated and can't be set.`);
          else if (v !== null && f.options && !f.options.some((o) => o.value === v)) errors.push(`“${v}” is not an option of ${f.label}.`);
        }
        break;
      case "checklist":
        if (act.target && !field(act.target)?.lookup) errors.push(`Checklist target ${act.target} is not a link to another record.`);
        for (const tok of tokens(act.item)) if (!has(tok)) errors.push(`Unknown field {${tok}} in checklist item.`);
        break;
      case "email":
        if (!act.to.length && !(act.bcc ?? []).length) errors.push("An email needs at least one recipient.");
        if (!FROM.test(act.from)) errors.push(`“From” must be a name (e.g. TS CRM) or a tsav.net address, not ${act.from}.`);
        for (const x of [...act.to, ...(act.cc ?? []), ...(act.bcc ?? [])]) {
          if (!EMAIL_OR_TOKEN.test(x)) errors.push(`Not an email address: ${x}`);
          for (const tok of tokens(x)) if (field(tok)?.type !== "email") errors.push(`{${tok}} is not an email field.`);
        }
        for (const tok of tokens(act.subject)) if (!has(tok)) errors.push(`Unknown field {${tok}} in subject.`);
        for (const f of act.files ?? []) if (!["file", "image", "signature"].includes(field(f)?.type ?? "")) errors.push(`${label(f)} is not a file field.`);
        break;
    }
  }
  return errors;
}
