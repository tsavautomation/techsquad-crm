"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/session";
import { recordsDb } from "@/lib/records/data";
import { saveRecord } from "@/lib/records/save";
import { pairKey } from "./dedupe";
import { loadOwnerProjects } from "./load";

// PJ-b: merge / undo / not a duplicate (item 2), the standard-name apply (item 5) and the owner's projects for
// the form (item 3). Merge and undo run in the database function merge_project / unmerge_project (one transaction,
// every link moved, the moved ids kept for Undo); the permission is Projects › modify.

export type Result<T = object> = ({ ok: true } & T) | { ok: false; message: string };

const CAN = "projects.projects.modify";
const msg = (e: unknown) => (e instanceof Error ? e.message : String(e));

async function editor() {
  const user = await requireUser();
  if (!user.isSysadmin && !user.permissions.has(CAN)) return null;
  return user;
}

function done() {
  revalidatePath("/projects/duplicates");
  revalidatePath("/projects/standardize");
  revalidatePath("/projects/projects", "layout");
}

/** Everything of `fromId` moves to `intoId`; `fromId` is archived as "merged into", never deleted. */
export async function mergeProjectsAction(fromId: number, intoId: number, reason: string): Promise<Result<{ mergeId: number }>> {
  if (!(await editor())) return { ok: false, message: "Only people who may edit Projects can merge them." };
  if (!Number.isInteger(fromId) || !Number.isInteger(intoId) || fromId === intoId) return { ok: false, message: "Pick which project to keep." };
  const db = await recordsDb();
  const { data, error } = await db.rpc("merge_project", { p_from: fromId, p_into: intoId, p_reason: reason.trim().slice(0, 300) });
  if (error) return { ok: false, message: error.message };
  done();
  return { ok: true, mergeId: Number(data) };
}

/** Puts every moved row back and unarchives the merged project. */
export async function undoMergeAction(mergeId: number): Promise<Result> {
  if (!(await editor())) return { ok: false, message: "Only people who may edit Projects can undo a merge." };
  const db = await recordsDb();
  const { error } = await db.rpc("unmerge_project", { p_merge_id: mergeId });
  if (error) return { ok: false, message: error.message };
  done();
  return { ok: true };
}

/** The pair never shows again on Possible duplicates (and the save-time check lets both exist). */
export async function notDuplicateAction(a: number, b: number): Promise<Result> {
  const user = await editor();
  if (!user) return { ok: false, message: "Only people who may edit Projects can decide this." };
  const [x, y] = pairKey(a, b);
  const db = await recordsDb();
  const { error } = await db.from("project_not_duplicates").upsert({ a: x, b: y, decided_by: user.id }, { onConflict: "a,b", ignoreDuplicates: true });
  if (error) return { ok: false, message: error.message };
  done();
  return { ok: true };
}

/** Takes a "not a duplicate" decision back. */
export async function forgetNotDuplicateAction(a: number, b: number): Promise<Result> {
  if (!(await editor())) return { ok: false, message: "Only people who may edit Projects can decide this." };
  const [x, y] = pairKey(a, b);
  const db = await recordsDb();
  const { error } = await db.from("project_not_duplicates").delete().eq("a", x).eq("b", y);
  if (error) return { ok: false, message: error.message };
  done();
  return { ok: true };
}

/** Item 5: renames the chosen projects through the ordinary write path (validated, audited, never a new record). */
export async function renameProjectsAction(items: { id: number; title: string }[]): Promise<Result<{ renamed: number; failed: { id: number; message: string }[] }>> {
  if (!(await editor())) return { ok: false, message: "Only people who may edit Projects can rename them." };
  let renamed = 0;
  const failed: { id: number; message: string }[] = [];
  for (const it of items.slice(0, 600)) {
    const title = it.title.trim().slice(0, 200);
    if (!title) continue;
    try {
      const r = await saveRecord("projects", it.id, { title });
      if (r.ok) renamed++;
      else failed.push({ id: it.id, message: r.message ?? Object.values(r.errors)[0] ?? "Could not save" });
    } catch (e) {
      failed.push({ id: it.id, message: msg(e) });
    }
  }
  done();
  return { ok: true, renamed, failed };
}

/** Item 3: the projects this contact already owns, for the new-project form. */
export async function ownerProjectsAction(contactId: number) {
  await requireUser();
  const db = await recordsDb();
  return loadOwnerProjects(db, contactId);
}
