import "server-only";
import { gunzipSync, strFromU8 } from "fflate";
import { downloadItem } from "@/lib/files/onedrive";
import { adminDb } from "@/lib/supabase/admin";
import { RESTORE_BLOCKED, type BackupTable } from "./format";
import { runBackup } from "./run";

// BK-a: put one table back as it was in a backup. Safety first: the table as it is now goes to OneDrive
// ("before-restore" copy, listed like any other backup), then the rows from the chosen night are written
// back by primary key with triggers off (public.restore_rows), optionally everything newer is deleted, and
// the id counter is fixed. Every restore is logged in backup_restores.

export type RestoreResult = { ok: true; rows_written: number; rows_deleted: number; snapshot_id: number | null } | { ok: false; message: string };

export async function restoreTable(opts: { backupId: number; table: string; deleteMissing: boolean; userId: string }): Promise<RestoreResult> {
  const db = adminDb();
  if (RESTORE_BLOCKED.has(opts.table)) return { ok: false, message: "This table cannot be restored from here." };
  const { data: backup } = await db.from("backups").select("id, status, tables").eq("id", opts.backupId).maybeSingle();
  const entry = ((backup as { status: string; tables: BackupTable[] } | null)?.tables ?? []).find((t) => t.name === opts.table);
  if (!backup || (backup as { status: string }).status !== "done" || !entry) return { ok: false, message: "That backup does not contain this table." };

  const log = async (fields: Record<string, unknown>) => {
    await db.from("backup_restores").insert({ backup_id: opts.backupId, table_name: opts.table, restored_by: opts.userId, ...fields });
  };

  // 1. Safety copy of the table as it is right now.
  const snap = await runBackup({ kind: "before_restore", budgetMs: 240_000, startedBy: opts.userId, only: [opts.table] });
  if (snap.status !== "done") {
    await log({ error: `safety copy failed: ${snap.error ?? snap.skipped ?? snap.status}` });
    return { ok: false, message: `The safety copy could not be made (${snap.error ?? snap.skipped ?? snap.status}); nothing was changed.` };
  }

  // 2. The rows from that night.
  const file = await downloadItem(entry.json_id);
  if (!file) {
    await log({ snapshot_backup_id: snap.id, error: "backup file missing in OneDrive" });
    return { ok: false, message: "The backup file is no longer in OneDrive; nothing was changed." };
  }
  let rows: Record<string, unknown>[];
  try {
    rows = JSON.parse(strFromU8(gunzipSync(new Uint8Array(file.bytes)))) as Record<string, unknown>[];
  } catch {
    await log({ snapshot_backup_id: snap.id, error: "backup file unreadable" });
    return { ok: false, message: "The backup file could not be read; nothing was changed." };
  }

  // 3. Write them back, 500 at a time.
  let written = 0;
  let deleted = 0;
  try {
    for (let i = 0; i < rows.length; i += 500) {
      const { data, error } = await db.rpc("restore_rows", { p_table: opts.table, p_rows: rows.slice(i, i + 500) });
      if (error) throw new Error(error.message);
      written += Number(data ?? 0);
    }
    const ids = rows.map((r) => r.id).filter((v): v is number => typeof v === "number");
    if (opts.deleteMissing && ids.length === rows.length) {
      const { data, error } = await db.rpc("restore_delete_missing", { p_table: opts.table, p_ids: ids });
      if (error) throw new Error(error.message);
      deleted = Number(data ?? 0);
    }
    await db.rpc("restore_fix_sequence", { p_table: opts.table });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await log({ snapshot_backup_id: snap.id, rows_written: written, rows_deleted: deleted, error: message });
    return { ok: false, message: `The restore stopped with an error: ${message}. Rows already written stay; the safety copy from just before is in the list.` };
  }
  await log({ snapshot_backup_id: snap.id, rows_written: written, rows_deleted: deleted });
  return { ok: true, rows_written: written, rows_deleted: deleted, snapshot_id: snap.id };
}
