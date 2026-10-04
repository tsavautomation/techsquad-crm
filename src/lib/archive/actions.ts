"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { requireUser } from "@/lib/auth/session";
import { oneDriveReady } from "@/lib/files/onedrive";
import { adminDb } from "@/lib/supabase/admin";
import { folderKey } from "./match";
import { busy, defaultCutoff, loadDecisions, loadState, runArchive, saveDecisions, startImport, startScan, summary, type ArchiveState, type ArchiveSummary, type FolderDecision } from "./sync";

// Server actions for Admin › Report archive (F16). Administrators only.

type Result<T = object> = ({ ok: true } & T) | { ok: false; message: string };

async function admin(): Promise<Result> {
  const me = await requireUser();
  if (!me.isSysadmin) return { ok: false, message: "Only an administrator can run the report archive import." };
  return { ok: true };
}

export async function scanArchiveAction(cutoff: string): Promise<Result> {
  const a = await admin();
  if (!a.ok) return a;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(cutoff)) return { ok: false, message: "Pick the cutoff date." };
  if (!(await oneDriveReady())) return { ok: false, message: "Connect OneDrive first." };
  if (busy(await loadState())) return { ok: false, message: "The archive is already being worked on." };
  await startScan(cutoff);
  after(runArchive);
  revalidatePath("/admin/report-archive");
  return { ok: true };
}

export async function importArchiveAction(dryRun: boolean): Promise<Result> {
  const a = await admin();
  if (!a.ok) return a;
  const s = await loadState();
  if (!s || s.phase === "idle" || s.phase === "scanning") return { ok: false, message: "Scan the folders first." };
  if (busy(s)) return { ok: false, message: "The archive is already being worked on." };
  await startImport(dryRun);
  after(runArchive);
  revalidatePath("/admin/report-archive");
  return { ok: true };
}

/** A folder decided by hand: this project (checked to exist), or none. Replaces an earlier decision on the same folder. */
export async function decideFolderAction(folder: string, projectId: number | null): Promise<Result> {
  const a = await admin();
  if (!a.ok) return a;
  const f = folder.trim().replace(/\s+/g, " ");
  if (!f) return { ok: false, message: "Pick a folder from the list." };
  if (projectId !== null) {
    const { data } = await adminDb().from("projects").select("id").eq("id", projectId).is("deleted_at", null).maybeSingle();
    if (!data) return { ok: false, message: "Pick a project from the list." };
  }
  const rest = (await loadDecisions()).filter((d) => folderKey(d.folder) !== folderKey(f));
  await saveDecisions([...rest, { folder: f, projectId }].sort((x, y) => x.folder.localeCompare(y.folder)));
  revalidatePath("/admin/report-archive");
  return { ok: true };
}

export async function undecideFolderAction(folder: string): Promise<Result> {
  const a = await admin();
  if (!a.ok) return a;
  await saveDecisions((await loadDecisions()).filter((d) => folderKey(d.folder) !== folderKey(folder)));
  revalidatePath("/admin/report-archive");
  return { ok: true };
}

export type ArchiveStatus = { state: ArchiveState | null; busy: boolean; summary: ArchiveSummary; defaultCutoff: string; decisions: FolderDecision[] };

/** Progress for the page (polled while a step runs); restarts a run whose heartbeat went stale. */
export async function archiveStatusAction(): Promise<Result<{ status: ArchiveStatus }>> {
  const a = await admin();
  if (!a.ok) return a;
  const state = await loadState();
  const b = busy(state);
  if (state && (state.phase === "scanning" || state.phase === "importing") && !b) after(runArchive);
  const [sum, cutoff, decisions] = await Promise.all([summary(), defaultCutoff(), loadDecisions()]);
  return { ok: true, status: { state, busy: b, summary: sum, defaultCutoff: cutoff, decisions } };
}
