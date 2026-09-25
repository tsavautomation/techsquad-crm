"use server";

import { revalidatePath } from "next/cache";
import type { Values } from "@/lib/rules/evaluate";
import { getTable } from "@/registry";
import { tableHref } from "@/registry/routes";
import { saveRecord, type SaveResult } from "./save";

/** Called by RecordForm. Validation errors come back to the form; success returns the record id. */
export async function saveRecordAction(tableName: string, id: number | null, values: Values): Promise<SaveResult> {
  const result = await saveRecord(tableName, id, values);
  const t = getTable(tableName);
  if (result.ok && (t.tab || t.module === "utility")) revalidatePath(tableHref(t), "layout");
  return result;
}
