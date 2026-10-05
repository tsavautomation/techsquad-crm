"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { requireUser } from "@/lib/auth/session";
import { oneDriveReady } from "@/lib/files/onedrive";
import { saveRecord } from "@/lib/records/save";
import { adminDb } from "@/lib/supabase/admin";
import { folderKey } from "./match";
import { parseClientFolder } from "./parse";
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

/** "BELKIN, EDWARD - OCEANA #2302N" → "Belkin, Edward - Oceana #2302N" (a letter after a digit stays a capital: unit letters). */
const titleCase = (s: string) => s.toLowerCase().replace(/(^|[\s,/(#-]|\d)([a-z])/g, (m, a: string, b: string) => a + b.toUpperCase());

/**
 * "New project from this folder" (SPEC §9.1 F16-d): a project named after the folder, owned by a contact
 * of that name (found, or created as an End Customer), through the ordinary write path, as the signed-in
 * administrator; then the folder is decided to it.
 */
export async function newProjectFromFolderAction(folder: string): Promise<Result<{ projectId: number }>> {
  const a = await admin();
  if (!a.ok) return a;
  const f = folder.trim().replace(/\s+/g, " ");
  if (!f) return { ok: false, message: "Pick a folder from the list." };
  const p = parseClientFolder(f);
  const db = adminDb();
  const words = p.client.split(" ");
  const last = words.length > 1 ? words[words.length - 1] : null;
  const first = last ? words.slice(0, -1).join(" ") : p.client;
  const { data: found } = await db.from("contacts").select("id").is("deleted_at", null).ilike("title", p.client).limit(1).maybeSingle();
  let ownerId = (found as { id: number } | null)?.id;
  if (!ownerId) {
    const c = await saveRecord("contacts", null, { type: "End Customer", first_name: first, last_name: last });
    if (!c.ok) return { ok: false, message: c.message ?? `Could not create the contact: ${Object.entries(c.errors).map(([k, v]) => `${k} ${v}`).join(", ")}` };
    ownerId = c.id;
  }
  const head = titleCase(f.replace(/\s[-–]\s*\d{4,6}$/, "").split(/\s[-–]\s/)[0] ?? f);
  const title = p.place ? `${head} - ${p.place}` : head;
  const r = await saveRecord("projects", null, {
    title,
    type: "Residential",
    category: "Low Voltage",
    job_owner_id: ownerId,
    job_address: { street: p.place ?? p.client, address_2: "", city: "", state: "FL", zip: "" },
    apartment_or_unit: p.unit,
  });
  if (!r.ok) return { ok: false, message: r.message ?? `Could not create the project: ${Object.entries(r.errors).map(([k, v]) => `${k} ${v}`).join(", ")}` };
  const rest = (await loadDecisions()).filter((d) => folderKey(d.folder) !== folderKey(f));
  await saveDecisions([...rest, { folder: f, projectId: r.id }].sort((x, y) => x.folder.localeCompare(y.folder)));
  revalidatePath("/admin/report-archive");
  return { ok: true, projectId: r.id };
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
