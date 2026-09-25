import "server-only";
import { encrypt, isEncrypted, MASK } from "@/lib/crypto";
import { requireUser } from "@/lib/auth/session";
import { evaluateRules, type Values } from "@/lib/rules/evaluate";
import { getTable } from "@/registry";
import { canDo, canLockAction } from "@/registry/permissions";
import type { TableDef } from "@/registry/types";
import { getRecord, recordsDb, rowValues } from "./data";
import { buildTitle } from "./title";
import { isEditable, isRowField, newRecordValues, normalize, validate } from "./values";

export type SaveResult = { ok: true; id: number } | { ok: false; errors: Record<string, string>; message?: string };

/**
 * The single write path for records (CLAUDE.md "One write path"):
 * permission check → rules → validation → encryption → title → write.
 * The database's RLS and triggers re-check permissions and write the audit log.
 */
export async function saveRecord(tableName: string, id: number | null, input: Values): Promise<SaveResult> {
  const user = await requireUser();
  const t: TableDef = getTable(tableName);

  if (!canDo(user.permissions, t, id ? "modify" : "create", getTable)) {
    return { ok: false, errors: {}, message: "You don't have permission to do that." };
  }

  let base: Values;
  if (id) {
    const row = await getRecord(t, id);
    if (!row) return { ok: false, errors: {}, message: "This record no longer exists or you can't see it." };
    if (row.locked && !canLockAction(user.permissions, t, "modify_locked", getTable)) {
      return { ok: false, errors: {}, message: "This record is locked (submitted) and can't be edited." };
    }
    base = rowValues(t, row, user.permissions);
  } else {
    base = newRecordValues(t);
  }

  // Only fields the form may edit are taken from the browser; everything else keeps its stored value.
  const merged: Values = { ...base };
  for (const f of t.fields) if (isEditable(f) && f.name in input) merged[f.name] = input[f.name];

  const normalized = normalize(t, merged);
  const rules = evaluateRules(t, normalized);
  const values = rules.values;
  const errors = validate(t, values, rules);
  if (Object.keys(errors).length) return { ok: false, errors };

  const row: Record<string, unknown> = {};
  for (const f of t.fields) {
    if (!isRowField(f) || !(f.name in values)) continue;
    if (f.type === "computed") continue;
    let v = values[f.name];
    if (f.sensitive && typeof v === "string" && v) {
      if (v === MASK) continue; // unchanged, and the user couldn't see it anyway
      if (!isEncrypted(v)) v = encrypt(v);
    }
    row[f.name] = v ?? null;
  }

  const db = await recordsDb();
  row.title = await buildTitle(t, values, id, db);

  if (id) {
    const { error } = await db.from(t.name).update(row).eq("id", id);
    if (error) return { ok: false, errors: {}, message: friendly(error.message) };
    return { ok: true, id };
  }

  const { data, error } = await db.from(t.name).insert(row).select("id").single();
  if (error || !data) return { ok: false, errors: {}, message: friendly(error?.message ?? "Could not save") };
  const newId = (data as { id: number }).id;
  // Formulas using the record number ("#{id} …") can only be filled once the id exists.
  if (t.titleFormula?.includes("{id}")) {
    await db.from(t.name).update({ title: await buildTitle(t, values, newId, db) }).eq("id", newId);
  }
  return { ok: true, id: newId };
}

function friendly(message: string) {
  if (/row-level security|permission/i.test(message)) return "You don't have permission to do that.";
  if (/locked/i.test(message)) return "This record is locked (submitted) and can't be edited.";
  return message;
}
