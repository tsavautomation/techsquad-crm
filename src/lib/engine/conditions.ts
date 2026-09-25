// Automation conditions (SPEC §5). Pure, so it is unit-tested and shared by event and scheduled runs.
//
// "days" rules compare today − date (US Eastern), positive when the date is in the past,
// exactly like WebAuthor's "(Days To Today)" filters.
import { todayET } from "@/lib/dates";

export type ConditionRule = {
  field: string;
  op: "=" | "!=" | "<" | "<=" | ">" | ">=" | "empty" | "not_empty";
  value?: string | number | boolean | null;
  /** Compare with another field of the same record instead of a fixed value. */
  field2?: string;
  /** Compare the number of days between the field's date and today. */
  days?: boolean;
};

export type Conditions = { match: "all" | "any"; rules: ConditionRule[] };

/** Whole days from `date` (YYYY-MM-DD or ISO) to `today`; positive when the date is in the past. */
export function daysToToday(date: string, today: string = todayET()): number {
  const d = Date.UTC(+date.slice(0, 4), +date.slice(5, 7) - 1, +date.slice(8, 10));
  const t = Date.UTC(+today.slice(0, 4), +today.slice(5, 7) - 1, +today.slice(8, 10));
  return Math.round((t - d) / 86_400_000);
}

const isEmpty = (v: unknown) => v === null || v === undefined || v === "" || (Array.isArray(v) && v.length === 0);

function compare(a: unknown, op: ConditionRule["op"], b: unknown): boolean {
  // Numbers (incl. money) compare numerically; empty money counts as 0 (SPEC §9.1 Q7).
  const numeric = typeof a === "number" || typeof b === "number";
  const x = numeric ? Number(a ?? 0) : String(a ?? "").toLowerCase();
  const y = numeric ? Number(b ?? 0) : String(b ?? "").toLowerCase();
  switch (op) {
    case "=":
      return x === y;
    case "!=":
      return x !== y;
    case "<":
      return x < y;
    case "<=":
      return x <= y;
    case ">":
      return x > y;
    case ">=":
      return x >= y;
    default:
      return false;
  }
}

export function ruleMatches(rule: ConditionRule, values: Record<string, unknown>, today: string = todayET()): boolean {
  const raw = values[rule.field];
  if (rule.op === "empty") return isEmpty(raw);
  if (rule.op === "not_empty") return !isEmpty(raw);
  if (rule.days) {
    if (typeof raw !== "string" || !raw) return false; // no date → no match
    return compare(daysToToday(raw, today), rule.op, Number(rule.value));
  }
  if (rule.field2 !== undefined) return compare(raw ?? 0, rule.op, values[rule.field2] ?? 0);
  if (typeof rule.value === "boolean") return compare(raw === true ? 1 : 0, rule.op, rule.value ? 1 : 0);
  return compare(raw, rule.op, rule.value);
}

export function conditionsMatch(c: Conditions, values: Record<string, unknown>, today: string = todayET()): boolean {
  if (!c.rules.length) return true;
  return c.match === "any" ? c.rules.some((r) => ruleMatches(r, values, today)) : c.rules.every((r) => ruleMatches(r, values, today));
}

/**
 * Which events a change-history entry raises: 'added', 'modified' and 'field:<column>'
 * for every column that changed (SPEC §5 event types).
 */
export function eventsForChange(action: string, changes: Record<string, unknown>): string[] {
  if (action === "create") return ["added"];
  if (!["update", "submit", "unsubmit"].includes(action)) return []; // archive/delete/restore raise nothing
  return ["modified", ...Object.keys(changes).map((c) => `field:${c}`)];
}

const EVENT_LABELS: Record<string, string> = { added: "added", modified: "modified", daily: "daily", hourly: "hourly" };

/** Plain-English "when" for the admin screen, e.g. "added, COI Expiration changed, daily". */
export function describeEvents(events: string[], label: (field: string) => string): string {
  if (!events.length) return "never (no event)";
  return events.map((e) => (e.startsWith("field:") ? `${label(e.slice(6))} changed` : (EVENT_LABELS[e] ?? e))).join(", ");
}

/** Plain-English conditions, e.g. "COI Expiration is 0 or more days ago". */
export function describeConditions(c: Conditions, label: (field: string) => string): string {
  if (!c.rules.length) return "always";
  const one = (r: ConditionRule) => {
    const f = label(r.field);
    if (r.op === "empty") return `${f} is empty`;
    if (r.op === "not_empty") return `${f} is not empty`;
    const rhs = r.field2 !== undefined ? label(r.field2) : r.value === null || r.value === undefined ? "empty" : String(r.value);
    if (r.days) return `days since ${f} ${r.op} ${rhs}`;
    return `${f} ${r.op} ${rhs}`;
  };
  return c.rules.map(one).join(c.match === "any" ? " or " : " and ");
}

/** Replace {field} tokens using a lookup of display values. */
export function renderTokens(template: string, display: (field: string) => string): string {
  return template.replace(/\{(\w+)\}/g, (_, f: string) => display(f));
}
