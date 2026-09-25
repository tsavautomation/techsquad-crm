import "server-only";
import type { Values } from "@/lib/rules/evaluate";
import type { TableDef } from "@/registry/types";
import { getRecord, recordsDb, rowValues, type Row } from "./data";
import { displayNames, loadAttachments, loadJoins } from "./relations";

export type LoadedRecord = {
  row: Row;
  /** Row values + many-to-many ids + attachments, ready for the form or detail page. */
  values: Values;
  /** Display labels for ids in `values`, by field. */
  labels: Record<string, Record<string, string>>;
};

/** Everything the detail page and edit form need for one record, or null if missing/not visible. */
export async function loadRecord(t: TableDef, id: number, perms: ReadonlySet<string>): Promise<LoadedRecord | null> {
  const row = await getRecord(t, id);
  if (!row) return null;
  const db = await recordsDb();
  const [joins, files] = await Promise.all([loadJoins(db, t, id), loadAttachments(db, t, id)]);
  const values = { ...rowValues(t, row, perms), ...joins, ...files };
  return { row, values, labels: await displayNames(db, t, values) };
}

/** Labels for the defaults of a new record (e.g. nothing picked yet → empty). */
export async function labelsFor(t: TableDef, values: Values) {
  return displayNames(await recordsDb(), t, values);
}
