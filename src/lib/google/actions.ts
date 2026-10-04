"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { requireUser } from "@/lib/auth/session";
import { recordsDb } from "@/lib/records/data";
import { buildTitle } from "@/lib/records/title";
import { adminDb } from "@/lib/supabase/admin";
import { getTable } from "@/registry";
import { canDo } from "@/registry/permissions";
import { disconnect, listCalendars, loadSettings, patchSettings, type GCalendar, type ImportState } from "./client";
import { importBusy, runImport, startCreating, startReading, syncNow, type SyncSummary } from "./sync";

// Server actions for Admin › Google Calendar and for Schedule › Needs a project (F15).

type Result<T = object> = ({ ok: true } & T) | { ok: false; message: string };

async function admin(): Promise<Result<{ id: string }>> {
  const me = await requireUser();
  if (!me.isSysadmin) return { ok: false, message: "Only an administrator can change the Google Calendar connection." };
  return { ok: true, id: me.id };
}

const refresh = () => {
  revalidatePath("/admin/google-calendar");
  revalidatePath("/schedule", "layout");
};

export async function disconnectGoogleAction(): Promise<Result> {
  const a = await admin();
  if (!a.ok) return a;
  await disconnect();
  refresh();
  return { ok: true };
}

export async function listCalendarsAction(): Promise<Result<{ calendars: GCalendar[] }>> {
  const a = await admin();
  if (!a.ok) return a;
  try {
    return { ok: true, calendars: await listCalendars() };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  }
}

export async function chooseCalendarAction(id: string, name: string): Promise<Result> {
  const a = await admin();
  if (!a.ok) return a;
  const s = await loadSettings();
  if (!s) return { ok: false, message: "Google Calendar is not connected." };
  // Another calendar means another history: the sync token and import progress start over.
  const same = s.calendar_id === id;
  await patchSettings({ calendar_id: id, calendar_name: name, ...(same ? {} : { sync_token: null, import: null }) }, a.id);
  // Events read from the old calendar that never became visits would otherwise be turned into visits later.
  if (!same) await adminDb().from("calendar_events").delete().neq("calendar_id", id).is("visit_id", null);
  refresh();
  return { ok: true };
}

export async function saveColorMapAction(map: Record<string, number>): Promise<Result> {
  const a = await admin();
  if (!a.ok) return a;
  const clean: Record<string, number> = {};
  for (const [k, v] of Object.entries(map)) if (/^\d{1,2}$/.test(k) && Number.isInteger(v) && v > 0) clean[k] = v;
  await patchSettings({ color_map: clean }, a.id);
  refresh();
  return { ok: true };
}

/** Names at the start of the calendar titles → employees. */
export async function saveNameMapAction(map: Record<string, number>): Promise<Result> {
  const a = await admin();
  if (!a.ok) return a;
  const clean: Record<string, number> = {};
  for (const [k, v] of Object.entries(map)) if (k.trim() && Number.isInteger(v) && v > 0) clean[k.trim().toLowerCase()] = v;
  await patchSettings({ name_map: clean }, a.id);
  refresh();
  return { ok: true };
}

export async function setAiMatchAction(on: boolean): Promise<Result> {
  const a = await admin();
  if (!a.ok) return a;
  await patchSettings({ ai_match: on }, a.id);
  refresh();
  return { ok: true };
}

/** Step 1: read the calendar from a date on. Runs in the background; the page polls importStatusAction. */
export async function startReadingAction(from: string): Promise<Result> {
  const a = await admin();
  if (!a.ok) return a;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from)) return { ok: false, message: "Pick a start date." };
  const s = await loadSettings();
  if (!s?.calendar_id) return { ok: false, message: "Choose the calendar first." };
  if (importBusy(s.import)) return { ok: false, message: "The import is already running." };
  await startReading(from);
  after(runImport);
  return { ok: true };
}

/** Step 2: turn the events read into visits. */
export async function startCreatingAction(): Promise<Result> {
  const a = await admin();
  if (!a.ok) return a;
  const s = await loadSettings();
  if (!s?.import || (s.import.phase !== "read" && s.import.phase !== "error" && s.import.phase !== "done")) return { ok: false, message: "Read the calendar first." };
  if (importBusy(s.import)) return { ok: false, message: "The import is already running." };
  await startCreating();
  after(runImport);
  return { ok: true };
}

/** Events that found no project go back in the queue (after new projects, names or colours were added). */
export async function rematchAction(): Promise<Result<{ queued: number }>> {
  const a = await admin();
  if (!a.ok) return a;
  const s = await loadSettings();
  if (!s?.calendar_id) return { ok: false, message: "Choose the calendar first." };
  if (importBusy(s.import)) return { ok: false, message: "The import is already running." };
  const { data, error } = await adminDb().from("calendar_events").update({ match_status: "new", updated_at: new Date().toISOString() }).eq("calendar_id", s.calendar_id).eq("match_status", "unmatched").is("visit_id", null).select("id");
  if (error) return { ok: false, message: error.message };
  const queued = data?.length ?? 0;
  if (queued) {
    await startCreating();
    after(runImport);
  }
  return { ok: true, queued };
}

export type ImportStatus = {
  import: ImportState | null;
  busy: boolean;
  events: { total: number; matched: number; unmatched: number; skipped: number; waiting: number };
  needsProject: number;
  lastSyncAt: string | null;
  lastSyncError: string | null;
};

/** Progress for the admin page (polled while a step runs). Restarts a chunk whose heartbeat went stale. */
export async function importStatusAction(): Promise<Result<{ status: ImportStatus }>> {
  const a = await admin();
  if (!a.ok) return a;
  const s = await loadSettings();
  if (!s) return { ok: false, message: "Google Calendar is not connected." };
  const db = adminDb();
  const count = async (status?: string) => {
    let q = db.from("calendar_events").select("id", { count: "exact", head: true });
    if (status) q = q.eq("match_status", status);
    return (await q).count ?? 0;
  };
  const [total, matched, unmatched, skipped, waiting, np] = await Promise.all([
    count(),
    count("matched"),
    count("unmatched"),
    count("skipped"),
    count("new"),
    db.from("visits").select("id", { count: "exact", head: true }).is("project_id", null).is("deleted_at", null).then((r) => r.count ?? 0),
  ]);
  const st = s.import;
  const busy = importBusy(st);
  if (st && (st.phase === "reading" || st.phase === "creating") && !busy) after(runImport);
  return { ok: true, status: { import: st, busy, events: { total, matched, unmatched, skipped, waiting }, needsProject: np, lastSyncAt: s.last_sync_at, lastSyncError: s.last_sync_error } };
}

export async function syncNowAction(): Promise<Result<{ summary: SyncSummary }>> {
  const a = await admin();
  if (!a.ok) return a;
  try {
    const summary = await syncNow();
    refresh();
    return { ok: true, summary };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  }
}

// ---------------------------------------------------------------- Schedule › Needs a project

export type ProjectHit = { id: number; title: string; address: string | null };

/** Projects matching a few typed letters, with the person's own permissions. */
export async function searchProjectsAction(q: string): Promise<ProjectHit[]> {
  await requireUser();
  const text = q.trim();
  if (text.length < 2) return [];
  const db = await recordsDb();
  const { data } = await db.from("projects").select("id, title, job_address").is("deleted_at", null).ilike("title", `%${text.replace(/[%_]/g, "")}%`).order("title").limit(8);
  return ((data ?? []) as { id: number; title: string | null; job_address: { street?: string; city?: string } | null }[]).map((p) => ({
    id: p.id,
    title: p.title ?? `Project #${p.id}`,
    address: [p.job_address?.street, p.job_address?.city].filter(Boolean).join(", ") || null,
  }));
}

/** Give an imported visit its project (just that field; the rest of the form can wait). */
export async function assignProjectAction(visitId: number, projectId: number): Promise<Result> {
  const me = await requireUser();
  const t = getTable("visits");
  if (!canDo(me.permissions, t, "modify", getTable)) return { ok: false, message: "You don't have permission to change visits." };
  const db = await recordsDb();
  const { data: v } = await db.from("visits").select("id, starts_at").eq("id", visitId).maybeSingle();
  if (!v) return { ok: false, message: "This visit no longer exists or you can't see it." };
  const title = await buildTitle(t, { project_id: projectId, starts_at: (v as { starts_at: string | null }).starts_at }, visitId, db);
  const { error } = await db.from("visits").update({ project_id: projectId, title }).eq("id", visitId);
  if (error) return { ok: false, message: error.message };
  await adminDb().from("calendar_events").update({ match_status: "matched", matched_at: new Date().toISOString() }).eq("visit_id", visitId);
  revalidatePath("/schedule", "layout");
  return { ok: true };
}

/** Not a job after all: delete the imported visit (soft) and remember the event as ignored. */
export async function ignoreVisitAction(visitId: number): Promise<Result> {
  const me = await requireUser();
  const t = getTable("visits");
  if (!canDo(me.permissions, t, "delete", getTable)) return { ok: false, message: "You don't have permission to delete visits." };
  const db = await recordsDb();
  const { error } = await db.from("visits").update({ deleted_at: new Date().toISOString() }).eq("id", visitId);
  if (error) return { ok: false, message: error.message };
  // Clean, so the push leaves the Google event alone: ignoring here never deletes anything in Google.
  await adminDb().rpc("google_mark_synced", { p_ids: [visitId] });
  await adminDb().from("calendar_events").update({ match_status: "ignored" }).eq("visit_id", visitId);
  revalidatePath("/schedule", "layout");
  return { ok: true };
}
