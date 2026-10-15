import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { gzipSync, strToU8 } from "fflate";
import { etSlot } from "@/lib/engine/schedule";
import { deleteItem, listChildren, oneDriveReady, uploadBytes } from "@/lib/files/onedrive";
import { adminDb, hasAdminKey } from "@/lib/supabase/admin";
import { BACKUPS_ROOT, PAGE, backupFolder, columnsOf, expiredFolders, pkColumns, toCsv, type BackupKind, type BackupTable } from "./format";
import { loadBackupSettings } from "./settings";

// BK-a Backups: the nightly copy. One backups row per run; each table is read through the service role in
// pages ordered by its primary key, written as <table>.json.gz and <table>.csv into the run's OneDrive folder,
// then noted on the row. A run that outlives the tick's budget keeps its row "running" and is picked up by the
// next tick (the lease stops two ticks working on it at once). When every table is in, a manifest.json closes
// the folder and the sweep removes folders older than the retention window.

type BackupRow = { id: number; day: string; kind: BackupKind; status: string; folder_path: string; started_at: string; lease_until: string | null; tables: BackupTable[]; bytes: number; rows_total: number };
export type RunResult = { id: number; status: string; tables_done: number; tables_total: number; rows: number; bytes: number; skipped?: string; error?: string };

async function readAll(db: SupabaseClient, table: string, pk: string[]): Promise<Record<string, unknown>[]> {
  const out: Record<string, unknown>[] = [];
  for (let from = 0; ; from += PAGE) {
    let q = db.from(table).select("*").range(from, from + PAGE - 1);
    for (const c of pk) q = q.order(c, { ascending: true });
    const { data, error } = await q;
    if (error) throw new Error(`${table}: ${error.message}`);
    const rows = (data ?? []) as Record<string, unknown>[];
    out.push(...rows);
    if (rows.length < PAGE) return out;
  }
}

/** Start or continue a backup. `only` limits it to some tables (the safety copy before a restore). */
export async function runBackup(opts: { kind: BackupKind; budgetMs: number; now?: Date; startedBy?: string | null; only?: string[] }): Promise<RunResult> {
  if (!hasAdminKey()) return { id: 0, status: "skipped", tables_done: 0, tables_total: 0, rows: 0, bytes: 0, skipped: "no admin key" };
  if (!(await oneDriveReady())) return { id: 0, status: "skipped", tables_done: 0, tables_total: 0, rows: 0, bytes: 0, skipped: "OneDrive is not connected" };
  const db = adminDb();
  const now = opts.now ?? new Date();
  const slot = etSlot(now);
  const time = new Intl.DateTimeFormat("en-GB", { timeZone: "America/New_York", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).format(now);
  const deadline = now.getTime() + opts.budgetMs;

  // The row: today's nightly one (new or still running), or a fresh manual / before-restore one.
  let row: BackupRow | null = null;
  if (opts.kind === "nightly") {
    const { data } = await db.from("backups").select("*").eq("kind", "nightly").eq("day", slot.date).maybeSingle();
    row = data as BackupRow | null;
    if (row && row.status !== "running") return summary(row, "already done");
    if (row && row.lease_until && Date.parse(row.lease_until) > now.getTime()) return summary(row, "another tick is on it");
  }
  if (!row) {
    const { data, error } = await db
      .from("backups")
      .insert({ day: slot.date, kind: opts.kind, folder_path: backupFolder(opts.kind, slot.date, time), started_by: opts.startedBy ?? null, lease_until: new Date(deadline + 120_000).toISOString() })
      .select("*")
      .single();
    if (error) {
      if (error.code === "23505") return { id: 0, status: "skipped", tables_done: 0, tables_total: 0, rows: 0, bytes: 0, skipped: "already started" };
      throw new Error(`backups: ${error.message}`);
    }
    row = data as BackupRow;
  } else {
    await db.from("backups").update({ lease_until: new Date(deadline + 120_000).toISOString() }).eq("id", row.id);
  }

  const { data: list, error: le } = await db.rpc("backup_tables");
  if (le) throw new Error(`backup_tables: ${le.message}`);
  let tables = (list ?? []) as { table_name: string; pk: string }[];
  if (opts.only) tables = tables.filter((t) => opts.only!.includes(t.table_name));
  const done = new Map(row.tables.map((t) => [t.name, t]));

  try {
    for (const t of tables) {
      if (done.has(t.table_name)) continue;
      if (Date.now() > deadline) break;
      const rows = await readAll(db, t.table_name, pkColumns(t.pk));
      const json = gzipSync(strToU8(JSON.stringify(rows)), { level: 6 });
      const jsonItem = await uploadBytes(row.folder_path, `${t.table_name}.json.gz`, Buffer.from(json));
      const csvItem = await uploadBytes(row.folder_path, `${t.table_name}.csv`, Buffer.from(toCsv(rows, columnsOf(rows)), "utf8"));
      const entry: BackupTable = { name: t.table_name, rows: rows.length, bytes: (jsonItem.size ?? json.length) + (csvItem.size ?? 0), json_id: jsonItem.id, csv_id: csvItem.id };
      done.set(t.table_name, entry);
      row.tables = [...done.values()];
      row.bytes = row.tables.reduce((s, x) => s + x.bytes, 0);
      row.rows_total = row.tables.reduce((s, x) => s + x.rows, 0);
      await db.from("backups").update({ tables: row.tables, bytes: row.bytes, rows_total: row.rows_total, lease_until: new Date(Date.now() + opts.budgetMs + 120_000).toISOString() }).eq("id", row.id);
    }
    const finished = tables.every((t) => done.has(t.table_name));
    if (finished) {
      const manifest = { day: row.day, kind: row.kind, folder: row.folder_path, generated_at: new Date().toISOString(), tables: row.tables.map(({ name, rows, bytes }) => ({ name, rows, bytes })) };
      await uploadBytes(row.folder_path, "manifest.json", Buffer.from(JSON.stringify(manifest, null, 2), "utf8"));
      await db.from("backups").update({ status: "done", finished_at: new Date().toISOString(), lease_until: null }).eq("id", row.id);
      row.status = "done";
      if (opts.kind === "nightly") await sweep(db, slot.date);
    } else {
      await db.from("backups").update({ lease_until: null }).eq("id", row.id);
    }
    return { ...summary(row), tables_total: tables.length };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await db.from("backups").update({ status: "failed", error: message, finished_at: new Date().toISOString(), lease_until: null }).eq("id", row.id);
    return { ...summary(row), status: "failed", error: message };
  }
}

function summary(row: BackupRow, skipped?: string): RunResult {
  return { id: row.id, status: row.status, tables_done: row.tables.length, tables_total: row.tables.length, rows: row.rows_total, bytes: row.bytes, ...(skipped ? { skipped } : {}) };
}

/** Remove OneDrive folders older than the retention window and mark their rows expired. Never throws. */
async function sweep(db: SupabaseClient, today: string) {
  try {
    const { retention_days } = await loadBackupSettings(db);
    const children = await listChildren(BACKUPS_ROOT);
    const old = expiredFolders(children.filter((c) => c.folder).map((c) => c.name), today, retention_days);
    for (const name of old) {
      const item = children.find((c) => c.name === name)!;
      await deleteItem(item.id);
      await db.from("onedrive_folders").delete().like("path", `${BACKUPS_ROOT}/${name}%`);
      await db.from("backups").update({ status: "expired", tables: [] }).eq("folder_path", `${BACKUPS_ROOT}/${name}`).neq("status", "running");
    }
  } catch {
    // the next night tries again
  }
}

/** The tick's step: from the configured hour on, run (or continue) tonight's copy within the budget. */
export async function nightlyBackupStep(now: Date, budgetMs: number): Promise<RunResult | { skipped: string }> {
  if (!hasAdminKey()) return { skipped: "no admin key" };
  const db = adminDb();
  const settings = await loadBackupSettings(db);
  const slot = etSlot(now);
  if (Number(slot.hour) < settings.hour) return { skipped: `before ${settings.hour}:00` };
  return runBackup({ kind: "nightly", budgetMs, now });
}
