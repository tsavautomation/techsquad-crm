import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { encrypt, isEncrypted, MASK } from "@/lib/crypto";
import { requireUser } from "@/lib/auth/session";
import { evaluateRules, type Values } from "@/lib/rules/evaluate";
import { getTable } from "@/registry";
import { canDo, canLockAction } from "@/registry/permissions";
import type { TableDef } from "@/registry/types";
import { getRecord, recordsDb, rowValues } from "./data";
import { loadAttachments, loadJoins, syncAttachments, syncJoin } from "./relations";
import { sanitizeRichText } from "./sanitize";
import { buildTitle } from "./title";
import { isEditable, isMultiLookup, isRowField, isUpload, newRecordValues, normalize, validate, type FileItem } from "./values";

export type SaveResult = { ok: true; id: number } | { ok: false; errors: Record<string, string>; message?: string };

/**
 * The single write path for records (CLAUDE.md "One write path"):
 * permission check → rules → validation → encryption → title → write → links and files.
 * The database's RLS and triggers re-check permissions and write the audit log.
 */
export async function saveRecord(tableName: string, id: number | null, input: Values): Promise<SaveResult> {
  const user = await requireUser();
  const t: TableDef = getTable(tableName);

  if (!canDo(user.permissions, t, id ? "modify" : "create", getTable)) {
    return { ok: false, errors: {}, message: "You don't have permission to do that." };
  }

  const db = await recordsDb();
  let base: Values;
  if (id) {
    const row = await getRecord(t, id);
    if (!row) return { ok: false, errors: {}, message: "This record no longer exists or you can't see it." };
    if (row.locked && !canLockAction(user.permissions, t, "modify_locked", getTable)) {
      return { ok: false, errors: {}, message: "This record is locked (submitted) and can't be edited." };
    }
    base = { ...rowValues(t, row, user.permissions), ...(await loadJoins(db, t, id)), ...(await loadAttachments(db, t, id)) };
  } else {
    base = newRecordValues(t);
  }

  // Only fields the form may edit are taken from the browser; everything else keeps its stored value.
  const merged: Values = { ...base };
  for (const f of t.fields) if (isEditable(f) && f.name in input) merged[f.name] = input[f.name];
  await applyReadOnlyAutofill(db, t, base, merged);

  const normalized = normalize(t, merged);
  const rules = evaluateRules(t, normalized);
  const values = rules.values;
  const errors = validate(t, values, rules);
  if (Object.keys(errors).length) return { ok: false, errors };

  const row: Record<string, unknown> = {};
  for (const f of t.fields) {
    if (!isRowField(f) || !(f.name in values)) continue;
    let v = values[f.name];
    if (f.type === "richtext" && typeof v === "string") v = sanitizeRichText(v);
    if ((f.type === "ssn" || f.type === "ein") && typeof v === "string") v = v.replace(/\D/g, "") || null;
    if (f.sensitive && typeof v === "string" && v) {
      if (v === MASK) continue; // unchanged, and the user couldn't see it anyway
      if (!isEncrypted(v)) v = encrypt(v);
    }
    row[f.name] = v ?? null;
  }
  row.title = await buildTitle(t, values, id, db);

  let recordId = id;
  if (recordId) {
    const { error } = await db.from(t.name).update(row).eq("id", recordId);
    if (error) return { ok: false, errors: {}, message: friendly(error.message) };
  } else {
    const { data, error } = await db.from(t.name).insert(row).select("id").single();
    if (error || !data) return { ok: false, errors: {}, message: friendly(error?.message ?? "Could not save") };
    recordId = (data as { id: number }).id;
    // Formulas using the record number ("#{id} …") can only be filled once the id exists.
    if (t.titleFormula?.includes("{id}")) {
      await db.from(t.name).update({ title: await buildTitle(t, values, recordId, db) }).eq("id", recordId);
    }
  }

  // Many-to-many links and files live in their own tables.
  try {
    for (const f of t.fields) {
      if (!isEditable(f) || !(f.name in input)) continue;
      if (isMultiLookup(f)) await syncJoin(db, t, f, recordId, (values[f.name] as number[] | null) ?? []);
      if (isUpload(f)) await syncAttachments(db, t, f, recordId, (values[f.name] as FileItem[] | null) ?? [], user.id);
    }
  } catch (e) {
    return { ok: false, errors: {}, message: `Saved, but: ${e instanceof Error ? e.message : String(e)}` };
  }
  return { ok: true, id: recordId };
}

/**
 * Read-only fields filled from a picked record (e.g. Stock › Brand/Model/Prices from the
 * chosen Product, SPEC §2.2) are recalculated here, so they can't be tampered with in the browser.
 * Editable auto-fill targets keep what the form sent (the user may have adjusted them).
 */
async function applyReadOnlyAutofill(db: SupabaseClient, t: TableDef, before: Values, values: Values) {
  const byName = new Map(t.fields.map((f) => [f.name, f]));
  for (const f of t.fields) {
    const map = (f.lookup?.autofill ?? []).filter((m) => byName.get(m.to)?.readOnly);
    if (!map.length) continue;
    const picked = values[f.name];
    if (typeof picked !== "number") {
      if (picked === null && before[f.name] !== null) for (const m of map) values[m.to] = null;
      continue;
    }
    if (picked === before[f.name] && before[f.name] !== undefined && map.every((m) => before[m.to] !== null && before[m.to] !== undefined)) continue;
    const { data } = await db.from(f.lookup!.table).select(map.map((m) => m.from).join(",")).eq("id", picked).maybeSingle();
    const src = (data ?? {}) as Values;
    for (const m of map) values[m.to] = src[m.from] ?? null;
  }
}

function friendly(message: string) {
  if (/row-level security|permission/i.test(message)) return "You don't have permission to do that.";
  if (/locked/i.test(message)) return "This record is locked (submitted) and can't be edited.";
  return message;
}
