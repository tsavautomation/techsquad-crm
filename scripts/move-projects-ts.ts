/**
 * Move the old "PROJECTS TS / <designer or GC> / <client folder>" folders in OneDrive into the CRM's
 * project folders, "TechSquad CRM / Projects / <project> (<id>)", so everything about a project sits in
 * one place (Fred 2026-10-06, SPEC §9.1 OD-f). Only folders whose project is certain move:
 *   - a folder decided by hand on Admin › Report archive (F16-d), or
 *   - a folder whose report files were ALL imported into the same project by the archive import (F16),
 *     with none left unmatched.
 * Everything else stays where it is, listed with the reason, for Fred to move by hand.
 *
 *   npx tsx --conditions=react-server --env-file=.env.local scripts/move-projects-ts.ts            # dry run → docs/projects-ts-move.xlsx
 *   npx tsx --conditions=react-server --env-file=.env.local scripts/move-projects-ts.ts --apply    # move them
 *
 * A move keeps the OneDrive item ids, so the archive Job Reports' file links keep working. The folder
 * paths the CRM stores (attachments.provider_folder, record_pdfs.folder, the onedrive_folders cache)
 * are rewritten after each move, and every move is logged in app_integrations key "projects_ts_moves"
 * (item id, from, to) so it can be undone.
 */
import { writeFileSync } from "node:fs";
import ExcelJS from "exceljs";
import { folderKey } from "@/lib/archive/match";
import { loadDecisions } from "@/lib/archive/sync";
import { getItem, listChildren, moveIntoFolder } from "@/lib/files/onedrive";
import { safeName } from "@/lib/files/paths";
import { adminDb } from "@/lib/supabase/admin";

const OLD_ROOT = "PROJECTS TS";
const NEW_ROOT = "TechSquad CRM/Projects";
const LOG_KEY = "projects_ts_moves";
/** A folder matched only by its imported files needs at least this many of them to count as certain. */
const MIN_FILES = 3;
const apply = process.argv.includes("--apply");

type Plan = { gc: string; folder: string; itemId: string; files: number; projectId: number | null; project: string | null; dest: string | null; reason: string };
type Move = { itemId: string; from: string; to: string; name: string; movedAt: string };

async function main() {
  const db = adminDb();

  // Projects that exist today.
  const { data: pr } = await db.from("projects").select("id, title").is("deleted_at", null);
  const projects = new Map(((pr ?? []) as { id: number; title: string | null }[]).map((p) => [p.id, p.title ?? "Project"]));

  // What the archive import found per client folder.
  type R = { gc_folder: string; client_folder: string; status: string; project_id: number | null };
  const rows: R[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db.from("report_files").select("gc_folder, client_folder, status, project_id").order("id").range(from, from + 999);
    if (error) throw new Error(error.message);
    rows.push(...((data ?? []) as R[]));
    if ((data ?? []).length < 1000) break;
  }
  const byFolder = new Map<string, { files: number; projects: Set<number>; unmatched: number }>();
  for (const r of rows) {
    const k = `${r.gc_folder}/${r.client_folder}`;
    const f = byFolder.get(k) ?? { files: 0, projects: new Set(), unmatched: 0 };
    f.files++;
    if (r.project_id) f.projects.add(r.project_id);
    if (r.status === "unmatched") f.unmatched++;
    byFolder.set(k, f);
  }
  const decisions = new Map((await loadDecisions()).map((d) => [folderKey(d.folder), d.projectId]));

  // The tree as it is now.
  const plan: Plan[] = [];
  const gcs = (await listChildren(OLD_ROOT)).filter((c) => c.folder).sort((a, b) => a.name.localeCompare(b.name));
  for (const gc of gcs) {
    const clients = (await listChildren(`${OLD_ROOT}/${gc.name}`)).filter((c) => c.folder).sort((a, b) => a.name.localeCompare(b.name));
    for (const c of clients) {
      const stats = byFolder.get(`${gc.name}/${c.name}`);
      const key = folderKey(c.name);
      let projectId: number | null = null;
      let reason: string;
      if (decisions.has(key)) {
        projectId = decisions.get(key) ?? null;
        reason = projectId ? "decided by hand on Admin › Report archive" : "decided by hand: no project";
      } else if (!stats) {
        reason = "no report files were listed for this folder (no “…Reports” subfolder), so nothing ties it to a project";
      } else if (stats.projects.size === 1 && stats.unmatched === 0 && stats.files >= MIN_FILES) {
        projectId = [...stats.projects][0];
        reason = `all ${stats.files} report files were imported into this project`;
      } else if (stats.projects.size === 1 && stats.unmatched === 0) {
        reason = `only ${stats.files} report file${stats.files === 1 ? "" : "s"} tie it to a project (fewer than ${MIN_FILES}): not sure enough`;
      } else if (stats.projects.size === 0) {
        reason = `none of its ${stats.files} report files found a project`;
      } else if (stats.projects.size > 1) {
        reason = `its report files point to ${stats.projects.size} different projects`;
      } else {
        reason = `${stats.unmatched} of its ${stats.files} report files found no project`;
      }
      if (projectId && !projects.has(projectId)) {
        reason = `project #${projectId} no longer exists`;
        projectId = null;
      }
      const title = projectId ? projects.get(projectId)! : null;
      plan.push({ gc: gc.name, folder: c.name, itemId: c.id, files: stats?.files ?? 0, projectId, project: title, dest: projectId ? `${NEW_ROOT}/${safeName(`${title} (${projectId})`)}` : null, reason });
    }
  }
  const moving = plan.filter((p) => p.dest);
  const staying = plan.filter((p) => !p.dest);
  console.log(`${plan.length} client folders in ${gcs.length} designer / GC folders: ${moving.length} to move, ${staying.length} stay.`);

  const log: Move[] = [];
  const failed: string[] = [];
  if (apply) {
    const { data: prev } = await db.from("app_integrations").select("data").eq("key", LOG_KEY).maybeSingle();
    log.push(...(((prev as { data: { moves?: Move[] } } | null)?.data?.moves ?? []) as Move[]));
    for (const [i, p] of moving.entries()) {
      const from = `${OLD_ROOT}/${p.gc}/${p.folder}`;
      try {
        const moved = await moveIntoFolder(p.itemId, p.dest!, p.folder);
        const name = moved?.name ?? (await settle(p.itemId, p.dest!));
        const to = `${p.dest}/${name}`;
        await rewritePaths(db, from, to);
        log.push({ itemId: p.itemId, from, to, name, movedAt: new Date().toISOString() });
        await db.from("app_integrations").upsert({ key: LOG_KEY, data: { moves: log }, updated_at: new Date().toISOString() });
        console.log(`${i + 1}/${moving.length} moved: ${from} → ${to}`);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        failed.push(`${from}: ${msg}`);
        console.error(`${i + 1}/${moving.length} FAILED: ${from}: ${msg}`);
      }
    }
  }

  await writeSheet(plan, log, failed);
  console.log(apply ? `Moved ${log.length} (this run and before), ${failed.length} failed. ` : "Dry run; nothing moved. ", "Sheet: docs/projects-ts-move.xlsx");
}

/** A big folder moves asynchronously: wait until OneDrive shows it under the new parent. */
async function settle(itemId: string, dest: string): Promise<string> {
  for (let i = 0; i < 30; i++) {
    const item = await getItem(itemId);
    const path = decodeURIComponent(item.parentReference?.path ?? "").replace(/^\/drive\/root:\//, "");
    if (path === dest) return item.name;
    await new Promise((r) => setTimeout(r, 2000));
  }
  throw new Error("the move did not finish in time");
}

/** The paths the CRM keeps for this folder's files follow the folder. */
async function rewritePaths(db: ReturnType<typeof adminDb>, from: string, to: string) {
  for (const [table, col] of [["attachments", "provider_folder"], ["record_pdfs", "folder"]] as const) {
    const { data } = await db.from(table).select(`id, ${col}`).like(col, `${from}%`);
    for (const r of (data ?? []) as unknown as ({ id: string | number } & Record<string, string>)[]) {
      if (r[col] === from || r[col].startsWith(`${from}/`)) await db.from(table).update({ [col]: to + r[col].slice(from.length) }).eq("id", r.id);
    }
  }
  await db.from("onedrive_folders").delete().like("path", `${from}%`);
}

async function writeSheet(plan: Plan[], log: Move[], failed: string[]) {
  const wb = new ExcelJS.Workbook();
  const moved = new Set(log.map((m) => m.itemId));
  const sheet = (name: string, rows: Plan[]) => {
    const ws = wb.addWorksheet(name);
    ws.columns = [
      { header: "Designer / GC folder", key: "gc", width: 34 },
      { header: "Client folder", key: "folder", width: 48 },
      { header: "Report files", key: "files", width: 12 },
      { header: "Project", key: "project", width: 48 },
      { header: "Project #", key: "projectId", width: 10 },
      { header: "Destination", key: "dest", width: 70 },
      { header: "Why", key: "reason", width: 70 },
      { header: "Status", key: "status", width: 14 },
    ];
    ws.getRow(1).font = { bold: true };
    for (const p of rows) ws.addRow({ ...p, status: moved.has(p.itemId) ? "moved" : failed.some((f) => f.startsWith(`${OLD_ROOT}/${p.gc}/${p.folder}:`)) ? "failed" : p.dest ? "to move" : "stays" });
  };
  sheet("To move", plan.filter((p) => p.dest));
  sheet("Stays (move by hand)", plan.filter((p) => !p.dest));
  await wb.xlsx.writeFile("docs/projects-ts-move.xlsx");
  writeFileSync("docs/projects-ts-move.json", JSON.stringify({ plan, moved: log, failed }, null, 1));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
