"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { requireUser } from "@/lib/auth/session";
import { runAutomationsNow, runAutomationsSafely, sendQueuedSafely } from "@/lib/engine/automations";
import { getTable } from "@/registry";
import { canDo, canLockAction } from "@/registry/permissions";
import { recordHref, tableHref } from "@/registry/routes";
import type { TableDef } from "@/registry/types";
import { getRecord, recordsDb, rowValues } from "./data";
import { canModule, loadPeople } from "./extras";
import { mentionedIn } from "./mentions";
import { saveRecord } from "./save";
import { undoPatch, type AuditChanges } from "./undo-patch";
import { isPendingOneDrive } from "@/lib/files/paths";
import { wantsPdf } from "@/lib/files/pdf-name";
import { dumpRecordPdfSafely } from "@/lib/files/record-pdf";
import { attachOneDriveUploads } from "@/lib/files/store";
import type { FileItem } from "./values";

export type ActionResult = { ok: true } | { ok: false; message: string };

const DENIED: ActionResult = { ok: false, message: "You don't have permission to do that." };

/** Where to refresh after a change: the record page (or its parent's, for sub-list rows) and the list. Automations run after the response. */
function refresh(t: TableDef, id: number, parentId?: number) {
  after(runAutomationsSafely);
  // SPEC §9.1 OD-c: the record's PDF copy in OneDrive follows every change (built after the response).
  if (wantsPdf(t)) after(() => dumpRecordPdfSafely(t.name, id));
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

/**
 * Undo (F7): put back the fields a history entry changed, through the normal save path, so
 * permissions, rules and the audit log apply as for any edit. Fields someone changed since are kept.
 */
export async function undoChangeAction(table: string, id: number, auditId: number): Promise<ActionResult & { skipped: string[] }> {
  const user = await requireUser();
  const t = getTable(table);
  if (!canDo(user.permissions, t, "modify", getTable)) return { ...DENIED, skipped: [] };
  const db = await recordsDb();
  const { data: entry } = await db.from("audit_log").select("action, changes").eq("id", auditId).eq("table_name", t.name).eq("record_id", id).maybeSingle();
  if (!entry || entry.action !== "update") return { ok: false, message: "That change can't be undone.", skipped: [] };
  const row = await getRecord(t, id);
  if (!row) return { ok: false, message: "This record no longer exists or you can't see it.", skipped: [] };
  const { patch, skipped } = undoPatch(t, row, entry.changes as AuditChanges);
  if (!Object.keys(patch).length) return { ok: false, message: "Nothing to undo: those fields have changed since.", skipped };
  const r = await saveRecord(t.name, id, rowValues(t, { ...row, ...patch }, user.permissions));
  if (!r.ok) return { ok: false, message: r.message ?? Object.values(r.errors)[0] ?? "Could not undo.", skipped };
  await runAutomationsNow();
  after(sendQueuedSafely);
  refresh(t, id);
  return { ok: true, skipped };
}

/** The history entry a just-saved edit wrote, for the "Undo" on the Saved toast (F7). */
export async function lastChangeId(table: string, id: number): Promise<number | null> {
  const user = await requireUser();
  const db = await recordsDb();
  const { data } = await db
    .from("audit_log")
    .select("id")
    .eq("table_name", table)
    .eq("record_id", id)
    .eq("action", "update")
    .eq("actor", user.id)
    .gte("at", new Date(Date.now() - 60_000).toISOString())
    .order("at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data?.id as number | undefined) ?? null;
}

// ---------------------------------------------------------------- notes

/** `tagged`: people picked with "@" in the note; only those whose @Name is still in the text are tagged. */
export async function addNoteAction(table: string, id: number, body: string, followUp: string | null, tagged: string[] = []): Promise<ActionResult> {
  const user = await requireUser();
  const t = getTable(table);
  const text = body.trim().slice(0, 5000);
  if (!text) return { ok: false, message: "Write something first." };
  if (!(await canModule(user.permissions, t, "activity_history_add"))) return DENIED;
  const db = await recordsDb();
  const { data: note, error } = await db
    .from("record_notes")
    .insert({ table_name: t.name, record_id: id, body: text, follow_up_date: followUp || null, created_by: user.id })
    .select("id")
    .single();
  if (error) return { ok: false, message: error.message };
  const people = tagged.length ? (await loadPeople(db)).filter((p) => tagged.includes(p.id) && p.id !== user.id) : [];
  const ids = mentionedIn(text, people);
  if (ids.length) {
    const rows = ids.map((u) => ({ note_id: (note as { id: number }).id, table_name: t.name, record_id: id, user_id: u, created_by: user.id }));
    const { error: tagError } = await db.from("record_mentions").insert(rows);
    if (tagError) return { ok: false, message: `Note saved, but tagging failed: ${tagError.message}` };
  }
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

export async function addChecklistItemAction(table: string, id: number, item: string, due: string | null, assignedTo: string | null = null): Promise<ActionResult> {
  const user = await requireUser();
  const t = getTable(table);
  const text = item.trim();
  if (!text) return { ok: false, message: "Write the item first." };
  const db = await recordsDb();
  const { error } = await db.from("record_checklist_items").insert({ table_name: t.name, record_id: id, item: text.slice(0, 1000), due_date: due || null, assigned_to: assignedTo || null, created_by: user.id });
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

/** F11-a: hand a checklist item to a person (null = nobody). They see it in the alerts bell until it is ticked. */
export async function assignChecklistItemAction(table: string, id: number, itemId: number, userId: string | null): Promise<ActionResult> {
  await requireUser();
  const t = getTable(table);
  const db = await recordsDb();
  const { data, error } = await db.from("record_checklist_items").update({ assigned_to: userId || null }).eq("id", itemId).eq("table_name", t.name).eq("record_id", id).select("id");
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
  const crm = files.filter((f) => !isPendingOneDrive(f.path));
  const od = files.filter((f) => isPendingOneDrive(f.path));
  for (const f of crm) {
    const [tbl, scope, field, uploader] = f.path.split("/");
    if (tbl !== t.name || scope !== String(id) || field !== "_files" || uploader !== user.id) return { ok: false, message: "Unexpected file location" };
  }
  const db = await recordsDb();
  let rows: Record<string, unknown>[] = crm.map((f) => ({ table_name: t.name, record_id: id, field: null, provider: "supabase", provider_path: f.path, file_name: f.name.slice(0, 200), mime_type: f.mime, size_bytes: f.size, created_by: user.id }));
  try {
    rows = rows.concat((await attachOneDriveUploads(t, id, null, od.map((f) => f.path), user.id)).map((x) => ({ ...x, table_name: t.name, record_id: id, field: null, created_by: user.id })));
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  }
  const { error } = await db.from("attachments").insert(rows);
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
