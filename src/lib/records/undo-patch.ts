// F7 undo: which columns of an audit entry can still be put back (pure; tested in tests/f7-undo.test.ts).
import type { TableDef } from "@/registry/types";
import { isEditable, isRowField } from "./values";

export type AuditChanges = Record<string, [unknown, unknown]>;

const same = (a: unknown, b: unknown) => {
  if (a === b || (a == null && b == null)) return true;
  if (typeof a === "number" || typeof b === "number") return Number(a) === Number(b) && a != null && b != null;
  return JSON.stringify(a) === JSON.stringify(b);
};

/**
 * The old values to write back for an "update" entry: only editable row fields, never masked
 * sensitive values, and only where the record still holds the value the entry set (someone else's
 * later change is kept). `skipped` lists the columns left alone because they changed since.
 */
export function undoPatch(t: TableDef, row: Record<string, unknown>, changes: AuditChanges): { patch: Record<string, unknown>; skipped: string[] } {
  const patch: Record<string, unknown> = {};
  const skipped: string[] = [];
  for (const [col, pair] of Object.entries(changes)) {
    if (!Array.isArray(pair) || pair.length !== 2) continue;
    const [before, after] = pair;
    const f = t.fields.find((x) => x.name === col);
    if (col === "title" || !f || !isRowField(f) || !isEditable(f) || f.createOnly) continue; // the title is rebuilt on save
    if (before === "***" || after === "***") continue;
    if (!same(row[col] ?? null, after ?? null)) {
      skipped.push(col);
      continue;
    }
    patch[col] = before ?? null;
  }
  return { patch, skipped };
}
