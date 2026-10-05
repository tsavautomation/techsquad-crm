import "server-only";
import { buildRecordPdf } from "@/lib/engine/email";
import { joinTable } from "@/lib/records/relations";
import { adminDb } from "@/lib/supabase/admin";
import { getTable, REGISTRY } from "@/registry";
import type { TableDef } from "@/registry/types";
import { folderFor, oneDriveReady, renameItem, replaceContent, uploadBytes } from "./onedrive";
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
  const folder = await folderFor(t, id);
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

/** Records with no PDF yet, or a stale one, per table. */
export async function pdfsPending(): Promise<{ table: string; ids: number[] }[]> {
  const db = adminDb();
  const out: { table: string; ids: number[] }[] = [];
  for (const t of pdfTables()) {
    const [{ data: rows }, { data: done }] = await Promise.all([
      db.from(t.name).select("id, updated_at").is("deleted_at", null).order("id"),
      db.from("record_pdfs").select("record_id, record_updated_at").eq("table_name", t.name),
    ]);
    const stamp = new Map(((done ?? []) as { record_id: number; record_updated_at: string }[]).map((r) => [r.record_id, Date.parse(r.record_updated_at)]));
    const ids = ((rows ?? []) as { id: number; updated_at: string }[]).filter((r) => (stamp.get(r.id) ?? -1) < Date.parse(r.updated_at)).map((r) => r.id);
    if (ids.length) out.push({ table: t.name, ids });
  }
  return out;
}

/** Write PDFs for pending records until the time budget runs out. */
export async function backfillRecordPdfs(budgetMs: number): Promise<{ written: number; left: number; failed: string[] }> {
  if (!(await oneDriveReady())) return { written: 0, left: 0, failed: [] };
  const started = Date.now();
  let written = 0;
  const failed: string[] = [];
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
