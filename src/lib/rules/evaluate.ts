// Field rules engine (SPEC §4). Pure: runs in the browser as the user types and on
// the server before saving, so both always agree.
//
// Declarative: start from each field's initial visibility, then apply every rule
// whose condition currently matches, in rule-number order. The result depends only
// on the current values, never on the order the user clicked things.
import { todayET } from "@/lib/dates";
import type { FieldDef, RuleCondition, TableDef } from "@/registry/types";

export type Values = Record<string, unknown>;

export type RuleResult = {
  visible: Set<string>;
  required: Set<string>;
  /** Values after `set` / `clear` actions. */
  values: Values;
};

function isEmpty(v: unknown) {
  return v === null || v === undefined || v === "" || (Array.isArray(v) && v.length === 0);
}

/** Compare a stored value with a rule's value; Yes/No rules use "1"/"0". */
function sameValue(field: FieldDef | undefined, value: unknown, ruleValue: string | undefined) {
  if (field?.type === "boolean") return (value === true ? "1" : "0") === ruleValue;
  if (isEmpty(value)) return false;
  return String(value).trim().toLowerCase() === String(ruleValue ?? "").trim().toLowerCase();
}

function matches(c: RuleCondition, fields: Map<string, FieldDef>, values: Values, today: string) {
  const f = fields.get(c.field);
  const v = values[c.field];
  switch (c.op) {
    case "equal":
      return sameValue(f, v, c.value);
    case "not_equal":
      return !sameValue(f, v, c.value);
    case "not_empty":
      return !isEmpty(v);
    case "date_before_today":
      return typeof v === "string" && v !== "" && v.slice(0, 10) < today;
  }
}

export function evaluateRules(table: TableDef, input: Values, today: string = todayET()): RuleResult {
  const fields = new Map(table.fields.map((f) => [f.name, f]));
  const rules = [...table.rules].sort((a, b) => a.id - b.id);
  const initial = new Set(table.fields.filter((f) => !f.hidden && !f.startsHidden).map((f) => f.name));
  let values = { ...input };
  let visible = new Set(initial);
  let required = new Set<string>();

  // Settle to a fixed point: set/clear actions change values other rules read, and
  // showing/hiding a field changes which rules it can trigger.
  for (let pass = 0; pass < 8; pass++) {
    // A field that is hidden doesn't trigger rules (SPEC §9.1): hiding "Referred by anyone?"
    // also hides what it controlled, even if it still holds "Yes".
    const triggers = visible;
    visible = new Set(initial);
    required = new Set(table.fields.filter((f) => f.required).map((f) => f.name));
    const next = { ...values };

    for (const rule of rules) {
      if (!rule.when.some((c) => triggers.has(c.field) && matches(c, fields, values, today))) continue;
      for (const a of rule.then) {
        switch (a.do) {
          case "show":
            visible.add(a.field);
            break;
          case "hide":
            visible.delete(a.field);
            break;
          case "require":
            required.add(a.field);
            break;
          case "set":
            next[a.field] = a.value;
            break;
          case "clear":
            next[a.field] = fields.get(a.field)?.type === "checkboxes" ? [] : null;
            break;
        }
      }
    }

    const valuesChanged = Object.keys(next).some((k) => JSON.stringify(next[k]) !== JSON.stringify(values[k]));
    const visibilityChanged = visible.size !== triggers.size || [...visible].some((f) => !triggers.has(f));
    values = next;
    if (!valuesChanged && !visibilityChanged) break;
  }

  // A field nobody can see can't be demanded.
  for (const name of [...required]) if (!visible.has(name)) required.delete(name);
  return { visible, required, values };
}
