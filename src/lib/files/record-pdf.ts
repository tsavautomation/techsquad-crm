import "server-only";
import { buildRecordPdf } from "@/lib/engine/email";
import { joinTable } from "@/lib/records/relations";
import { adminDb } from "@/lib/supabase/admin";
import { getTable, REGISTRY } from "@/registry";
import type { TableDef } from "@/registry/types";
import { deleteItem, ensureFolder, folderFor, listChildren, oneDriveReady, renameItem, replaceContent, uploadBytes } from "./onedrive";
import { dateField, fileDate, pdfFileName, technicianField, wantsPdf } from "./pdf-name";

// PDF copies in OneDrive (SPEC §9.1 OD-c): the text of every form that can carry files is written as
// a PDF next to its photos, so the folder stands on its own if the CRM is ever offline. Written after
// each save (record-actions.ts, in the background), rewritten in place when the record changes, and
// filled in for older records by the Admin › OneDrive button and the hourly tick.

export type PdfOutcome = "written" | "updated" | "unchanged" | "skipped";

type Row = { id: number; title: string | null; updated_at: string; created_at: string; deleted_at: string | null; [k: string]: unknown };

/** The tables whose records get a PDF copy: the technicians' forms first, since those matter most offline. */
export const pdfTables = (): TableDef[] => [...REGISTRY.filter(wantsPdf)].sort((a, b) => Number(b.module === "forms") - Number(a.module === "forms"));

async function describe(db: ReturnType<typeof adminDb>, t: TableDef, row: Row) {
  const projectField = t.name === "projects" ? null : t.fields.find((f) => f.type === "lookup" && !f.multiple && f.lookup?.table === "projects");
  const techField = technicianField(t);
  const dField = dateField(t);
  let job: string | null = t.name === "projects" ? row.title : null;
  if (projectField && typeof row[projectField.name] === "number") {
    const { data } = await db.from("projects").select("title").eq("id", row[projectField.name] as number).maybeSingle();
    job = (data as { title: string | null } | null)?.title ?? null;
  }
  let technician: string | null = null;
  if (techField) {
    let ids: number[] = [];
    if (techField.multiple) {
      const { data } = await db.from(joinTable(t, techField)).select("target_id").eq("record_id", row.id);
      ids = ((data ?? []) as { target_id: number }[]).map((r) => r.target_id);
    } else if (typeof row[techField.name] === "number") ids = [row[techField.name] as number];
    if (ids.length) {
      const { data } = await db.from("employee_names").select("id, title").in("id", ids);
      technician = ((data ?? []) as { title: string | null }[]).map((e) => e.title).filter(Boolean).join(", ") || null;
    }
  }
  const date = fileDate(dField ? (row[dField.name] as string | null) : null, fileDate(row.created_at, ""));
  // The form's name as on the menu ("Job Report"); the generic item label ("Record") says nothing.
  return pdfFileName({ formLabel: t.name === "projects" ? "Project" : t.label, job: job ?? (t.name === "projects" ? null : row.title), technician, date, id: row.id });
}

/** Write (or rewrite) one record's PDF. Never throws for a missing record or an unconnected OneDrive. */
export async function dumpRecordPdf(tableName: string, id: number): Promise<PdfOutcome> {
  const t = getTable(tableName);
  if (!wantsPdf(t) || !(await oneDriveReady())) return "skipped";
  const db = adminDb();
  const techField = technicianField(t);
  const dField = dateField(t);
  const projectField = t.fields.find((f) => f.type === "lookup" && !f.multiple && f.lookup?.table === "projects");
  const cols = ["id", "title", "updated_at", "created_at", "deleted_at", projectField?.name, techField && !techField.multiple ? techField.name : null, dField?.name].filter(Boolean).join(", ");
  const { data } = await db.from(t.name).select(cols).eq("id", id).maybeSingle();
  const row = data as unknown as Row | null;
  if (!row || row.deleted_at) return "skipped";
  const { data: prev } = await db.from("record_pdfs").select("item_id, name, record_updated_at").eq("table_name", t.name).eq("record_id", id).maybeSingle();
  const have = prev as { item_id: string; name: string; record_updated_at: string } | null;
  if (have && Date.parse(have.record_updated_at) >= Date.parse(row.updated_at)) return "unchanged";

  // Text only: the photos already sit in the same folder, and downloading them made each copy take seconds.
  const pdf = await buildRecordPdf(db, t.name, id, { withImages: false });
  if (!pdf) return "skipped";
  const bytes = Buffer.from(pdf.content, "base64");
  const name = await describe(db, t, row);

  if (have) {
    try {
      await replaceContent(have.item_id, bytes);
      if (have.name !== name) await renameItem(have.item_id, name);
      await db.from("record_pdfs").update({ name, record_updated_at: row.updated_at, written_at: new Date().toISOString() }).eq("table_name", t.name).eq("record_id", id);
      return "updated";
    } catch (e) {
      // Deleted or moved in OneDrive by hand: write a fresh copy below.
      if ((e as { status?: number }).status !== 404) throw e;
    }
  }
  // Next to the record's own photos and videos when it has any (OD-d); folderFor() dates the folder by
  // today, which would put a PDF written later in a folder of its own.
  const { data: att } = await db.from("attachments").select("provider_folder").eq("table_name", t.name).eq("record_id", id).eq("provider", "onedrive").is("deleted_at", null).not("provider_folder", "is", null).order("created_at", { ascending: false }).limit(1);
  const folder = ((att ?? []) as { provider_folder: string | null }[])[0]?.provider_folder || (await folderFor(t, id));
  const item = await uploadBytes(folder, name, bytes);
  await db.from("record_pdfs").upsert({ table_name: t.name, record_id: id, item_id: item.id, name: item.name ?? name, folder, record_updated_at: row.updated_at, written_at: new Date().toISOString() });
  return "written";
}

/** For the background: a failure is logged, never raised. */
export async function dumpRecordPdfSafely(tableName: string, id: number) {
  try {
    await dumpRecordPdf(tableName, id);
  } catch (e) {
    console.error(`record pdf ${tableName} #${id}:`, e instanceof Error ? e.message : e);
  }
}

/**
 * Records with no PDF yet, or a stale one, per table. Newest changes first (OD-d): a report written
 * today must never wait behind the thousands imported from WebAuthor.
 */
export async function pdfsPending(): Promise<{ table: string; ids: number[] }[]> {
  const db = adminDb();
  const out: { table: string; ids: number[] }[] = [];
  for (const t of pdfTables()) {
    const [rows, done] = await Promise.all([
      allRows<{ id: number; updated_at: string }>((from, to) => db.from(t.name).select("id, updated_at").is("deleted_at", null).order("updated_at", { ascending: false }).order("id").range(from, to)),
      allRows<{ record_id: number; record_updated_at: string }>((from, to) => db.from("record_pdfs").select("record_id, record_updated_at").eq("table_name", t.name).order("record_id").range(from, to)),
    ]);
    const stamp = new Map(done.map((r) => [r.record_id, Date.parse(r.record_updated_at)]));
    const ids = rows.filter((r) => (stamp.get(r.id) ?? -1) < Date.parse(r.updated_at)).map((r) => r.id);
    if (ids.length) out.push({ table: t.name, ids });
  }
  return out;
}

/** Every row of a query, 1,000 at a time (the database answers at most 1,000 per request). */
async function allRows<T>(page: (from: number, to: number) => PromiseLike<{ data: unknown; error: { message: string } | null }>): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await page(from, from + 999);
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as T[];
    out.push(...rows);
    if (rows.length < 1000) return out;
  }
}

/**
 * OD-e: PDF copies that must not be in OneDrive (private tables such as Staff Performance) are
 * removed, and a record folder left empty goes with them. Idempotent; runs at the start of each backfill.
 */
export async function removePrivatePdfs(): Promise<number> {
  const privateTables = REGISTRY.filter((t) => t.privateFiles).map((t) => t.name);
  if (!privateTables.length) return 0;
  const db = adminDb();
  const { data } = await db.from("record_pdfs").select("table_name, record_id, item_id, folder").in("table_name", privateTables).limit(200);
  const rows = (data ?? []) as { table_name: string; record_id: number; item_id: string; folder: string }[];
  let removed = 0;
  for (const r of rows) {
    await deleteItem(r.item_id);
    await db.from("record_pdfs").delete().eq("table_name", r.table_name).eq("record_id", r.record_id);
    removed++;
    if (r.folder && (await listChildren(r.folder)).length === 0) {
      await deleteItem(await ensureFolder(r.folder));
      await db.from("onedrive_folders").delete().eq("path", r.folder);
    }
  }
  return removed;
}

/** Write PDFs for pending records until the time budget runs out. */
export async function backfillRecordPdfs(budgetMs: number): Promise<{ written: number; left: number; failed: string[] }> {
  if (!(await oneDriveReady())) return { written: 0, left: 0, failed: [] };
  const started = Date.now();
  let written = 0;
  const failed: string[] = [];
  try {
    await removePrivatePdfs();
  } catch (e) {
    failed.push(`private copies: ${e instanceof Error ? e.message : String(e)}`);
  }
  const pending = await pdfsPending();
  let left = pending.reduce((n, p) => n + p.ids.length, 0);
  for (const p of pending) {
    for (const id of p.ids) {
      if (Date.now() - started > budgetMs) return { written, left, failed };
      try {
        const r = await dumpRecordPdf(p.table, id);
        if (r === "written" || r === "updated") written++;
        left--;
      } catch (e) {
        failed.push(`${p.table} #${id}: ${e instanceof Error ? e.message : String(e)}`);
        left--;
      }
    }
  }
  return { written, left, failed };
}
