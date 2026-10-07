"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/session";
import type { ActionResult } from "@/lib/records/record-actions";
import { adminDb } from "@/lib/supabase/admin";
import { getTable } from "@/registry";
import { deleteItem, disconnect, folderFor, oneDriveReady, uploadBytes } from "./onedrive";
import { backfillRecordPdfs, pdfsPending } from "./record-pdf";
import { BUCKET } from "./store";

// Admin › OneDrive: disconnect, and move files already in CRM storage into OneDrive (Fred chose to move
// them, 2026-09-30). Signatures stay in the CRM. System Administrators only.

export async function disconnectOneDriveAction(): Promise<ActionResult> {
  const me = await requireUser();
  if (!me.isSysadmin) return { ok: false, message: "Only System Administrators can do that." };
  await disconnect(me.id);
  revalidatePath("/admin/onedrive");
  return { ok: true };
}

/** Files still in CRM storage that should move (everything except signatures). */
export async function filesToMove(): Promise<{ count: number; bytes: number }> {
  const me = await requireUser();
  if (!me.isSysadmin) return { count: 0, bytes: 0 };
  const db = adminDb();
  const { data } = await db.from("attachments").select("table_name, field, size_bytes").eq("provider", "supabase").is("deleted_at", null);
  const rows = ((data ?? []) as { table_name: string; field: string | null; size_bytes: number | null }[]).filter((r) => !staysInCrm(r.table_name, r.field));
  return { count: rows.length, bytes: rows.reduce((n, r) => n + Number(r.size_bytes ?? 0), 0) };
}

/** Signatures and the files of private tables (SPEC §9.1 OD-e) never move to OneDrive. */
function staysInCrm(table: string, field: string | null) {
  try {
    const t = getTable(table);
    return Boolean(t.privateFiles) || Boolean(field && t.fields.find((f) => f.name === field)?.type === "signature");
  } catch {
    return true; // table no longer exists: leave it alone
  }
}

/** Records whose PDF copy is missing or stale (SPEC §9.1 OD-c). */
export async function pdfsToWrite(): Promise<number> {
  const me = await requireUser();
  if (!me.isSysadmin || !(await oneDriveReady())) return 0;
  return (await pdfsPending()).reduce((n, p) => n + p.ids.length, 0);
}

/** Write up to ~45 seconds' worth of PDF copies; the screen calls again until nothing is left. */
export async function writePdfsBatchAction(): Promise<ActionResult & { written?: number; left?: number; failed?: string[] }> {
  const me = await requireUser();
  if (!me.isSysadmin) return { ok: false, message: "Only System Administrators can do that." };
  if (!(await oneDriveReady())) return { ok: false, message: "Connect OneDrive first." };
  const r = await backfillRecordPdfs(45_000);
  revalidatePath("/admin/onedrive");
  return { ok: true, written: r.written, left: r.left, failed: r.failed.slice(0, 5) };
}

/** Move up to ~45 seconds' worth of files; the screen calls again until nothing is left. */
export async function moveFilesBatchAction(): Promise<ActionResult & { moved?: number; left?: number; failed?: string[] }> {
  const me = await requireUser();
  if (!me.isSysadmin) return { ok: false, message: "Only System Administrators can do that." };
  if (!(await oneDriveReady())) return { ok: false, message: "Connect OneDrive first." };
  const db = adminDb();
  const { data } = await db.from("attachments").select("id, table_name, record_id, field, provider_path, file_name, size_bytes").eq("provider", "supabase").is("deleted_at", null).order("created_at").limit(200);
  const rows = ((data ?? []) as { id: string; table_name: string; record_id: number; field: string | null; provider_path: string; file_name: string }[]).filter((r) => !staysInCrm(r.table_name, r.field));
  const started = Date.now();
  let moved = 0;
  const failed: string[] = [];
  for (const r of rows) {
    if (Date.now() - started > 45_000) break;
    try {
      const { data: blob, error } = await db.storage.from(BUCKET).download(r.provider_path);
      if (error || !blob) throw new Error(error?.message ?? "missing in storage");
      const folder = await folderFor(getTable(r.table_name), r.record_id);
      const item = await uploadBytes(folder, r.file_name, Buffer.from(await blob.arrayBuffer()));
      const { error: upErr } = await db.from("attachments").update({ provider: "onedrive", provider_path: item.id, provider_folder: folder }).eq("id", r.id).eq("provider", "supabase");
      if (upErr) {
        await deleteItem(item.id);
        throw new Error(upErr.message);
      }
      await db.storage.from(BUCKET).remove([r.provider_path]);
      moved++;
    } catch (e) {
      failed.push(`${r.file_name}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  const left = (await filesToMove()).count;
  revalidatePath("/admin/onedrive");
  return { ok: true, moved, left, failed: failed.slice(0, 5) };
}
