"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { requireUser } from "@/lib/auth/session";
import { oneDriveReady } from "@/lib/files/onedrive";
import { busy, defaultCutoff, loadState, runArchive, startImport, startScan, summary, type ArchiveState, type ArchiveSummary } from "./sync";

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

export type ArchiveStatus = { state: ArchiveState | null; busy: boolean; summary: ArchiveSummary; defaultCutoff: string };

/** Progress for the page (polled while a step runs); restarts a run whose heartbeat went stale. */
export async function archiveStatusAction(): Promise<Result<{ status: ArchiveStatus }>> {
  const a = await admin();
  if (!a.ok) return a;
  const state = await loadState();
  const b = busy(state);
  if (state && (state.phase === "scanning" || state.phase === "importing") && !b) after(runArchive);
  return { ok: true, status: { state, busy: b, summary: await summary(), defaultCutoff: await defaultCutoff() } };
}
