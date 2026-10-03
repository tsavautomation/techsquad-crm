"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth/session";
import { recordsDb } from "@/lib/records/data";
import { getTable } from "@/registry";
import { canDo } from "@/registry/permissions";
import { recordHref, tableHref } from "@/registry/routes";

// F14-a: merge duplicate contacts or organizations (Data page). The database function moves every
// reference, fills blanks on the kept record, soft-deletes the others and writes the history.

export type MergeResult = { ok: true; moved: number } | { ok: false; message: string };

const Input = z.object({
  table: z.enum(["contacts", "organizations"]),
  keep: z.number().int().positive(),
  merge: z.array(z.number().int().positive()).min(1).max(20),
});

export async function mergeRecordsAction(input: z.input<typeof Input>): Promise<MergeResult> {
  const me = await requireUser();
  const parsed = Input.safeParse(input);
  if (!parsed.success) return { ok: false, message: "Pick the record to keep and at least one to merge." };
  const { table, keep, merge } = parsed.data;
  const t = getTable(table);
  if (!(canDo(me.permissions, t, "modify", getTable) && canDo(me.permissions, t, "delete", getTable))) return { ok: false, message: "You need Edit and Delete on this list to merge records." };
  const others = merge.filter((id) => id !== keep);
  if (!others.length) return { ok: false, message: "Pick the record to keep and at least one to merge." };
  const db = await recordsDb();
  const { data, error } = await db.rpc("merge_records", { p_table: table, p_keep: keep, p_merge: others });
  if (error) return { ok: false, message: /permission/i.test(error.message) ? "You need Edit and Delete on this list to merge records." : error.message };
  revalidatePath("/data");
  revalidatePath(tableHref(t));
  for (const id of [keep, ...others]) revalidatePath(recordHref(t, id));
  return { ok: true, moved: Number(data ?? 0) };
}
