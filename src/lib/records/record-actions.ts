"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { requireUser } from "@/lib/auth/session";
import { runAutomationsSafely } from "@/lib/engine/automations";
import { getTable } from "@/registry";
import { canDo, canLockAction } from "@/registry/permissions";
import { recordHref, tableHref } from "@/registry/routes";
import type { TableDef } from "@/registry/types";
import { getRecord, recordsDb } from "./data";
import { canModule } from "./extras";
import type { FileItem } from "./values";

export type ActionResult = { ok: true } | { ok: false; message: string };

const DENIED: ActionResult = { ok: false, message: "You don't have permission to do that." };

/** Where to refresh after a change: the record page (or its parent's, for sub-list rows) and the list. Automations run after the response. */
function refresh(t: TableDef, id: number, parentId?: number) {
  after(runAutomationsSafely);
  if (t.parent && parentId) {
    const p = getTable(t.parent.table);
    revalidatePath(recordHref(p, parentId));
  } else if (t.tab || t.module === "utility") {
    revalidatePath(recordHref(t, id));
    revalidatePath(tableHref(t));
  }
}

async function update(t: TableDef, id: number, patch: Record<string, unknown>): Promise<ActionResult> {
  const db = await recordsDb();
  const { data, error } = await db.from(t.name).update(patch).eq("id", id).select("id");
  if (error) return { ok: false, message: /permission|locked/i.test(error.message) ? error.message.replace(/^.*?: /, "") : error.message };
  if (!data?.length) return DENIED; // filtered out by row-level security
  return { ok: true };
}

/** Submit: stamps Date Submitted, locks the record (SPEC §1.3) and starts its workflow (SPEC §6). */
export async function submitRecordAction(table: string, id: number): Promise<ActionResult> {
  const user = await requireUser();
  const t = getTable(table);
  if (!t.submit || !canDo(user.permissions, t, "modify", getTable)) return DENIED;
  const row = await getRecord(t, id);
  if (!row) return DENIED;
  if (row.locked) return { ok: false, message: "Already submitted." };
  const r = await update(t, id, { locked: true, submitted_at: new Date().toISOString() });
  if (!r.ok) return r;
  // Submitting starts the table's workflow, if it has one (SPEC §6).
  const db = await recordsDb();
  const { error } = await db.rpc("workflow_start", { p_table: t.name, p_id: id, p_trigger: "submit" });
  refresh(t, id);
  return error ? { ok: false, message: `Submitted, but the workflow didn't start: ${error.message}` } : { ok: true };
}

/** Lock / unlock without the submit step ("Records: Lock/Unlock Records"). Unlocking also clears Date Submitted. */
export async function setLockedAction(table: string, id: number, locked: boolean): Promise<ActionResult> {
  const user = await requireUser();
  const t = getTable(table);
  if (!canLockAction(user.permissions, t, "lock_unlock", getTable)) return DENIED;
  const r = await update(t, id, locked ? { locked: true } : { locked: false, submitted_at: null });
  if (r.ok) refresh(t, id);
  return r;
}

export async function setArchivedAction(table: string, id: number, archived: boolean): Promise<ActionResult> {
  const user = await requireUser();
  const t = getTable(table);
  if (!canDo(user.permissions, t, "archive", getTable)) return DENIED;
  const r = await update(t, id, { archived_at: archived ? new Date().toISOString() : null });
  if (r.ok) refresh(t, id);
  return r;
}

/** Soft delete: the record moves to Deleted Items and can be restored. */
export async function deleteRecordAction(table: string, id: number, parentId?: number): Promise<ActionResult> {
  const user = await requireUser();
  const t = getTable(table);
  if (!canDo(user.permissions, t, "delete", getTable)) return DENIED;
  const r = await update(t, id, { deleted_at: new Date().toISOString() });
  if (r.ok) refresh(t, id, parentId);
  return r;
}

export async function restoreRecordAction(table: string, id: number): Promise<ActionResult> {
  const user = await requireUser();
  const t = getTable(table);
  if (!canDo(user.permissions, t, "delete", getTable)) return DENIED;
  const r = await update(t, id, { deleted_at: null });
  if (r.ok) {
    refresh(t, id);
    if (t.tab) revalidatePath(`${tableHref(t)}/deleted`);
  }
  return r;
}

// ---------------------------------------------------------------- notes

export async function addNoteAction(table: string, id: number, body: string, followUp: string | null): Promise<ActionResult> {
  const user = await requireUser();
  const t = getTable(table);
  const text = body.trim();
  if (!text) return { ok: false, message: "Write something first." };
  if (!(await canModule(user.permissions, t, "activity_history_add"))) return DENIED;
  const db = await recordsDb();
  const { error } = await db.from("record_notes").insert({ table_name: t.name, record_id: id, body: text.slice(0, 5000), follow_up_date: followUp || null, created_by: user.id });
  if (error) return { ok: false, message: error.message };
  refresh(t, id);
  return { ok: true };
}

export async function deleteNoteAction(table: string, id: number, noteId: number): Promise<ActionResult> {
  await requireUser();
  const t = getTable(table);
  const db = await recordsDb();
  const { data, error } = await db.from("record_notes").delete().eq("id", noteId).eq("table_name", t.name).eq("record_id", id).select("id");
  if (error) return { ok: false, message: error.message };
  if (!data?.length) return DENIED;
  refresh(t, id);
  return { ok: true };
}

// ---------------------------------------------------------------- checklist

export async function addChecklistItemAction(table: string, id: number, item: string, due: string | null): Promise<ActionResult> {
  const user = await requireUser();
  const t = getTable(table);
  const text = item.trim();
  if (!text) return { ok: false, message: "Write the item first." };
  const db = await recordsDb();
  const { error } = await db.from("record_checklist_items").insert({ table_name: t.name, record_id: id, item: text.slice(0, 1000), due_date: due || null, created_by: user.id });
  if (error) return { ok: false, message: error.message };
  refresh(t, id);
  return { ok: true };
}

export async function toggleChecklistItemAction(table: string, id: number, itemId: number, done: boolean): Promise<ActionResult> {
  const user = await requireUser();
  const t = getTable(table);
  const db = await recordsDb();
  const { data, error } = await db
    .from("record_checklist_items")
    .update(done ? { completed_at: new Date().toISOString(), completed_by: user.id } : { completed_at: null, completed_by: null })
    .eq("id", itemId)
    .eq("table_name", t.name)
    .eq("record_id", id)
    .select("id");
  if (error) return { ok: false, message: error.message };
  if (!data?.length) return DENIED;
  refresh(t, id);
  return { ok: true };
}

export async function deleteChecklistItemAction(table: string, id: number, itemId: number): Promise<ActionResult> {
  await requireUser();
  const t = getTable(table);
  const db = await recordsDb();
  const { data, error } = await db.from("record_checklist_items").delete().eq("id", itemId).eq("table_name", t.name).eq("record_id", id).select("id");
  if (error) return { ok: false, message: error.message };
  if (!data?.length) return DENIED;
  refresh(t, id);
  return { ok: true };
}

// ---------------------------------------------------------------- files pod

/** Attach files already uploaded to storage (see createUploadAction with field "_files"). */
export async function addPodFilesAction(table: string, id: number, files: FileItem[]): Promise<ActionResult> {
  const user = await requireUser();
  const t = getTable(table);
  if (!(await canModule(user.permissions, t, "files_add_new"))) return DENIED;
  for (const f of files) {
    const [tbl, scope, field, uploader] = f.path.split("/");
    if (tbl !== t.name || scope !== String(id) || field !== "_files" || uploader !== user.id) return { ok: false, message: "Unexpected file location" };
  }
  const db = await recordsDb();
  const { error } = await db.from("attachments").insert(
    files.map((f) => ({ table_name: t.name, record_id: id, field: null, provider: "supabase", provider_path: f.path, file_name: f.name.slice(0, 200), mime_type: f.mime, size_bytes: f.size, created_by: user.id })),
  );
  if (error) return { ok: false, message: error.message };
  refresh(t, id);
  return { ok: true };
}

export async function removePodFileAction(table: string, id: number, attachmentId: string): Promise<ActionResult> {
  await requireUser();
  const t = getTable(table);
  const db = await recordsDb();
  const { data, error } = await db
    .from("attachments")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", attachmentId)
    .eq("table_name", t.name)
    .eq("record_id", id)
    .is("field", null)
    .select("id");
  if (error) return { ok: false, message: error.message };
  if (!data?.length) return DENIED;
  refresh(t, id);
  return { ok: true };
}
