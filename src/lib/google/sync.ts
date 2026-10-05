import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { formatDateTime } from "@/lib/dates";
import type { Address } from "@/lib/records/values";
import { adminDb } from "@/lib/supabase/admin";
import { aiAvailable, aiMatch, type AiEvent } from "./ai";
import { deleteEvent, GoogleApiError, insertEvent, listEvents, loadSettings, patchEvent, saveSettings, siteUrl, type GoogleSettings, type ImportState } from "./client";
import { eventTimes, eventToVisit, leadTechnician, matchEvent, nameStats, notAJobReason, snapDuration, suggestColorMap, suggestNameMap, visitToEvent, type Catalog, type GEvent, type Match } from "./match";

// F15 Google Calendar: reading the calendar into visits and keeping both sides in step.
//
//   Import (Admin › Google Calendar, chunked so a serverless call never runs out of time):
//     1. "Read the calendar": every event since the chosen date → calendar_events (as Google sent it).
//        At the end Google hands out a sync token and the colour → technician map is suggested.
//     2. "Create visits": each unprocessed event is matched (match.ts, then Claude for the unclear
//        ones when AI is on) and becomes a visit; events that aren't jobs are skipped.
//   Sync (hourly tick and "Sync now"):
//     pull: changes since the sync token → visits (new events become visits; moved events move the
//           visit; cancelled events cancel it). The CRM wins when both sides changed.
//     push: visits changed since they last agreed with Google → events (insert / patch / delete).
//
// Every write to visits goes through the service role; the before_write trigger stamps and audits it,
// and google_mark_synced() leaves the row "clean" (updated_at = google_synced_at).

const PAGE = 250;
const CHUNK = 200;
const AI_BATCH = 40;
export const BUDGET_MS = 200_000;
const STALE_MS = 90_000;
/** Repeating entries run for decades; visits are only created this far ahead. */
const HORIZON_DAYS = 365;
export const DEFAULT_FROM = "2015-01-01";

const now = () => new Date().toISOString();
/** A heartbeat nobody is keeping: the next runner may start at once. */
const STALE = new Date(0).toISOString();

export const blankImport = (from: string): ImportState => ({ phase: "reading", from, read: 0, created: 0, matched: 0, unmatched: 0, skipped: 0, heartbeat: STALE, startedAt: now() });

/** Is a reading / creating chunk running right now (heartbeat fresh)? */
export const importBusy = (st: ImportState | null | undefined) => Boolean(st && (st.phase === "reading" || st.phase === "creating") && Date.now() - Date.parse(st.heartbeat) < STALE_MS);

async function setImport(patch: Partial<ImportState>) {
  const s = await loadSettings();
  if (!s) return;
  await saveSettings({ ...s, import: { ...(s.import ?? blankImport(DEFAULT_FROM)), ...patch } });
}

// ---------------------------------------------------------------- catalogue

const oneLine = (a: Address | null) => (a ? [a.street, a.address_2, a.city, [a.state, a.zip].filter(Boolean).join(" ")].filter(Boolean).join(", ") : "") || null;

export async function loadCatalog(db: SupabaseClient, colorMap: Record<string, number>, nameMap: Record<string, number> = {}): Promise<Catalog> {
  const [{ data: pr }, { data: emp }, { data: veh }] = await Promise.all([
    db.from("projects").select("id, title, job_address, apartment_or_unit, created_at, job_owner_id").is("deleted_at", null),
    db.from("employees").select("id, title").is("deleted_at", null),
    db.from("vehicles").select("id, tag_number").is("deleted_at", null),
  ]);
  type P = { id: number; title: string | null; job_address: Address | null; apartment_or_unit: string | null; created_at: string | null; job_owner_id: number | null };
  const projects = (pr ?? []) as P[];
  const ownerIds = [...new Set(projects.map((p) => p.job_owner_id).filter((x): x is number => x !== null))];
  const { data: owners } = ownerIds.length ? await db.from("contacts").select("id, title").in("id", ownerIds) : { data: [] };
  const ownerName = new Map(((owners ?? []) as { id: number; title: string | null }[]).map((c) => [c.id, c.title]));
  return {
    projects: projects
      .filter((p) => p.title)
      .map((p) => ({
        id: p.id,
        title: p.title!,
        street: p.job_address?.street ?? null,
        city: p.job_address?.city ?? null,
        zip: p.job_address?.zip ?? null,
        unit: p.apartment_or_unit?.trim() || null,
        owner: (p.job_owner_id && ownerName.get(p.job_owner_id)) || null,
        createdAt: p.created_at,
      })),
    employees: ((emp ?? []) as { id: number; title: string | null }[]).filter((e) => e.title).map((e) => ({ id: e.id, name: e.title! })),
    vehicles: ((veh ?? []) as { id: number; tag_number: string | null }[]).map((v) => ({ id: v.id, tag: v.tag_number })),
    colorMap,
    nameMap,
  };
}

// ---------------------------------------------------------------- calendar_events

type EventRow = {
  id: string;
  calendar_id: string;
  status: string | null;
  summary: string | null;
  color_id: string | null;
  starts_at: string | null;
  match_status: "new" | "matched" | "unmatched" | "skipped" | "ignored";
  visit_id: number | null;
  raw: GEvent;
};

/** Keep events as Google sent them. Existing rows keep their match status (a re-read never duplicates visits). */
async function upsertEvents(db: SupabaseClient, calendarId: string, items: GEvent[]) {
  const rows = items
    .filter((e) => e.status !== "cancelled")
    .map((e) => {
      const t = eventTimes(e);
      return {
        id: e.id,
        calendar_id: calendarId,
        status: e.status ?? null,
        summary: e.summary ?? null,
        description: e.description ?? null,
        location: e.location ?? null,
        color_id: e.colorId ?? null,
        starts_at: t?.startIso ?? null,
        ends_at: t?.endIso ?? null,
        all_day: t?.allDay ?? false,
        google_updated: e.updated ?? null,
        etag: e.etag ?? null,
        recurring_event_id: e.recurringEventId ?? null,
        raw: e,
        updated_at: now(),
      };
    });
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await db.from("calendar_events").upsert(rows.slice(i, i + 500), { onConflict: "id" });
    if (error) throw new Error(`Could not keep the calendar events: ${error.message}`);
  }
}

/** Every title of the chosen calendar (for the name and colour suggestions). */
async function allTitles(db: SupabaseClient, calendarId: string) {
  const out: { summary: string | null; color_id: string | null }[] = [];
  for (let from = 0; ; from += 1000) {
    const { data } = await db.from("calendar_events").select("summary, color_id").eq("calendar_id", calendarId).range(from, from + 999);
    const rows = (data ?? []) as typeof out;
    out.push(...rows);
    if (rows.length < 1000 || out.length >= 60_000) break;
  }
  return out;
}

/** After reading: which names open the titles, who they are, and which colour stands for whom. */
async function suggestPeople(db: SupabaseClient, calendarId: string, cat: Catalog, s: GoogleSettings) {
  const titles = await allTitles(db, calendarId);
  const name_stats = nameStats(titles.map((t) => t.summary));
  const name_map = suggestNameMap(name_stats, cat.employees, s.name_map);
  const pairs: { colorId: string; technicianId: number }[] = [];
  for (const t of titles) {
    if (!t.color_id) continue;
    const who = leadTechnician(t.summary, cat.employees, name_map);
    if (who) pairs.push({ colorId: t.color_id, technicianId: who });
  }
  return { name_stats, name_map, color_map: suggestColorMap(pairs, s.color_map) };
}

// ---------------------------------------------------------------- step 1: read

/** Read pages until the deadline. True when the whole calendar has been read. */
async function readChunk(db: SupabaseClient, deadline: number): Promise<boolean> {
  const s = await loadSettings();
  if (!s?.calendar_id || !s.import) return true;
  let st = s.import;
  while (Date.now() < deadline) {
    const page = await listEvents(s.calendar_id, { timeMin: `${st.from}T00:00:00Z`, pageToken: st.pageToken, maxResults: PAGE });
    await upsertEvents(db, s.calendar_id, page.items);
    st = { ...st, read: st.read + page.items.length, pageToken: page.nextPageToken, heartbeat: now() };
    if (!page.nextPageToken) {
      const fresh = (await loadSettings())!;
      const cat = await loadCatalog(db, fresh.color_map, fresh.name_map);
      const people = await suggestPeople(db, s.calendar_id, cat, fresh);
      await saveSettings({ ...fresh, sync_token: page.nextSyncToken ?? fresh.sync_token, ...people, import: { ...st, phase: "read", pageToken: undefined } });
      return true;
    }
    await setImport(st);
  }
  return false;
}

// ---------------------------------------------------------------- step 2: create visits

type Counts = { created: number; matched: number; unmatched: number; skipped: number };

/** Turn unprocessed calendar_events rows into visits. */
async function processNew(db: SupabaseClient, s: GoogleSettings, cat: Catalog, rows: EventRow[], nowMs = Date.now()): Promise<Counts> {
  const counts: Counts = { created: 0, matched: 0, unmatched: 0, skipped: 0 };
  if (!rows.length) return counts;
  const horizon = nowMs + HORIZON_DAYS * 86_400_000;
  const decided = rows.map((r) => {
    // Rules first: warehouse days, days off, birthdays and far-future repeats never become visits.
    const reason = notAJobReason(r.raw.summary) ?? (r.starts_at && Date.parse(r.starts_at) > horizon ? "more than a year ahead" : null);
    return { row: r, e: r.raw, match: matchEvent(r.raw, cat), ai: null as null | { projectId: number | null; skip: boolean }, reason };
  });

  // Claude for the unclear ones (and to spot entries that aren't jobs).
  if (s.ai_match && aiAvailable()) {
    const unclear = decided.filter((d) => !d.match.projectId && !d.reason);
    for (let i = 0; i < unclear.length; i += AI_BATCH) {
      const batch = unclear.slice(i, i + AI_BATCH);
      const events: AiEvent[] = batch.map((d) => ({
        key: d.row.id,
        date: (d.row.starts_at ?? "").slice(0, 10),
        summary: d.e.summary ?? "",
        location: d.e.location ?? "",
        description: (d.e.description ?? "").replace(/<[^>]+>/g, " "),
        candidates: d.match.candidates.map((c) => c.id),
      }));
      try {
        const res = await aiMatch(events, cat.projects);
        for (const d of batch) {
          const a = res.get(d.row.id);
          if (!a) continue;
          d.ai = a;
          if (a.projectId) {
            d.match = { ...d.match, projectId: a.projectId, confidence: "high", how: [...d.match.how, "project chosen by AI"] };
          }
        }
      } catch (e) {
        console.error("google ai match:", e);
      }
    }
  }

  // Visits that already exist for these events (a re-run): just link them.
  const ids = rows.map((r) => r.id);
  const { data: existing } = await db.from("visits").select("id, google_event_id, project_id").in("google_event_id", ids);
  const have = new Map(((existing ?? []) as { id: number; google_event_id: string; project_id: number | null }[]).map((v) => [v.google_event_id, v]));
  const projectTitle = new Map(cat.projects.map((p) => [p.id, p.title]));

  const updates: Record<string, unknown>[] = [];
  const inserts: { row: EventRow; values: Record<string, unknown>; match: Match }[] = [];
  const detail = (d: (typeof decided)[number]) => ({ how: d.match.how, confidence: d.match.confidence, candidates: d.match.candidates, technicianId: d.match.technicianId, teamIds: d.match.teamIds, vehicleId: d.match.vehicleId, ai: d.ai });

  for (const d of decided) {
    const base = { id: d.row.id, calendar_id: d.row.calendar_id, matched_at: now(), match_detail: detail(d), updated_at: now() };
    const prior = have.get(d.row.id);
    if (prior) {
      updates.push({ ...base, visit_id: prior.id, match_status: prior.project_id ? "matched" : "unmatched" });
      continue;
    }
    if (d.reason || d.ai?.skip) {
      updates.push({ ...base, match_status: "skipped", match_detail: { ...detail(d), how: [...d.match.how, d.reason ? `not a job: ${d.reason}` : "not a job (AI)"] } });
      counts.skipped++;
      continue;
    }
    const v = eventToVisit(d.e, d.match, nowMs);
    if (!v) {
      updates.push({ ...base, match_status: "skipped", match_detail: { ...detail(d), how: [...d.match.how, "no date or time"] } });
      counts.skipped++;
      continue;
    }
    // Only what matches a project is worth a visit (Fred 2026-10-04: "import only what I can").
    // The event stays "unmatched" so "Match again" can pick it up once the project exists.
    if (!v.project_id) {
      updates.push({ ...base, match_status: "unmatched" });
      counts.unmatched++;
      continue;
    }
    const title = v.project_id ? `${projectTitle.get(v.project_id) ?? `Project #${v.project_id}`} – ${formatDateTime(v.starts_at)}` : v.title;
    inserts.push({ row: d.row, match: d.match, values: { ...v, title } });
  }

  for (let i = 0; i < inserts.length; i += 200) {
    const slice = inserts.slice(i, i + 200);
    const { data, error } = await db
      .from("visits")
      .insert(slice.map((x) => x.values))
      .select("id, google_event_id");
    if (error) throw new Error(`Could not create the visits: ${error.message}`);
    const made = new Map(((data ?? []) as { id: number; google_event_id: string }[]).map((r) => [r.google_event_id, r.id]));
    const team: { record_id: number; target_id: number }[] = [];
    const madeIds: number[] = [];
    for (const x of slice) {
      const visitId = made.get(x.row.id);
      if (!visitId) continue;
      madeIds.push(visitId);
      for (const t of x.match.teamIds) if (t !== x.match.technicianId) team.push({ record_id: visitId, target_id: t });
      const matched = Boolean(x.values.project_id);
      updates.push({ id: x.row.id, calendar_id: x.row.calendar_id, visit_id: visitId, match_status: matched ? "matched" : "unmatched", matched_at: now(), match_detail: { how: x.match.how, confidence: x.match.confidence, candidates: x.match.candidates, technicianId: x.match.technicianId, teamIds: x.match.teamIds, vehicleId: x.match.vehicleId }, updated_at: now() });
      counts.created++;
      if (matched) counts.matched++;
      else counts.unmatched++;
    }
    if (team.length) await db.from("visits_team").upsert(team, { onConflict: "record_id,target_id", ignoreDuplicates: true });
    if (madeIds.length) {
      const { error: me } = await db.rpc("google_mark_synced", { p_ids: madeIds });
      if (me) throw new Error(`Could not mark the visits as synced: ${me.message}`);
    }
  }
  for (let i = 0; i < updates.length; i += 500) {
    const { error } = await db.from("calendar_events").upsert(updates.slice(i, i + 500), { onConflict: "id" });
    if (error) throw new Error(`Could not record the matches: ${error.message}`);
  }
  return counts;
}

/** Create visits until the deadline. True when every event has been processed. */
async function createChunk(db: SupabaseClient, deadline: number): Promise<boolean> {
  const s = await loadSettings();
  if (!s?.import) return true;
  const cat = await loadCatalog(db, s.color_map, s.name_map);
  let st = s.import;
  while (Date.now() < deadline) {
    const { data, error } = await db.from("calendar_events").select("id, calendar_id, status, summary, color_id, starts_at, match_status, visit_id, raw").eq("calendar_id", s.calendar_id!).eq("match_status", "new").order("starts_at").limit(CHUNK);
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as EventRow[];
    if (!rows.length) {
      await setImport({ ...st, phase: "done", finishedAt: now(), heartbeat: now() });
      return true;
    }
    const c = await processNew(db, s, cat, rows);
    st = { ...st, created: st.created + c.created, matched: st.matched + c.matched, unmatched: st.unmatched + c.unmatched, skipped: st.skipped + c.skipped, heartbeat: now() };
    await setImport(st);
  }
  return false;
}

// ---------------------------------------------------------------- the import runner

/**
 * Run the current import step for up to budgetMs. Called in the background (after()) by the admin
 * page and by the hourly tick; a stale heartbeat lets a new chunk take over from one that died.
 */
export async function runImport(budgetMs = BUDGET_MS): Promise<"busy" | "nothing" | "paused" | "done" | "error"> {
  const s = await loadSettings();
  const st = s?.import;
  if (!s || !st || !s.calendar_id) return "nothing";
  if (st.phase !== "reading" && st.phase !== "creating") return "nothing";
  if (importBusy(st)) return "busy";
  const db = adminDb();
  const deadline = Date.now() + budgetMs;
  await setImport({ heartbeat: now(), error: undefined });
  try {
    const done = st.phase === "reading" ? await readChunk(db, deadline) : await createChunk(db, deadline);
    return done ? "done" : "paused";
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("google import:", message);
    await setImport({ phase: "error", error: message, heartbeat: now() });
    return "error";
  }
}

/** Admin pressed "Read the calendar" (or "Try again" after an error while reading). */
export async function startReading(from: string) {
  const s = await loadSettings();
  if (!s) throw new Error("Google Calendar is not connected.");
  const prev = s.import;
  const resume = prev && prev.phase === "error" && prev.pageToken && prev.from === from;
  await saveSettings({ ...s, import: resume ? { ...prev, phase: "reading", error: undefined, heartbeat: STALE } : blankImport(from) });
}

/** Admin pressed "Create visits". */
export async function startCreating() {
  const s = await loadSettings();
  if (!s?.import) throw new Error("Read the calendar first.");
  await saveSettings({ ...s, import: { ...s.import, phase: "creating", error: undefined, heartbeat: STALE } });
}

// ---------------------------------------------------------------- pull: Google → CRM

export type PullResult = { changed: number; created: number; moved: number; cancelled: number; resync: boolean };

async function markSynced(db: SupabaseClient, ids: number[], eventIds?: (string | null)[], etags?: (string | null)[]) {
  if (!ids.length) return;
  const { error } = await db.rpc("google_mark_synced", { p_ids: ids, p_event_ids: eventIds ?? null, p_etags: etags ?? null });
  if (error) throw new Error(`Could not mark the visits as synced: ${error.message}`);
}

type VisitRow = {
  id: number;
  starts_at: string | null;
  duration: string | null;
  status: string | null;
  updated_at: string;
  google_synced_at: string | null;
  deleted_at: string | null;
};

/** A changed Google event for a visit we already have: move or cancel the visit, unless the CRM changed it since. */
async function applyToVisit(db: SupabaseClient, visitId: number, e: GEvent): Promise<"moved" | "cancelled" | "kept"> {
  const { data } = await db.from("visits").select("id, starts_at, duration, status, updated_at, google_synced_at, deleted_at").eq("id", visitId).maybeSingle();
  const v = data as VisitRow | null;
  if (!v || v.deleted_at) return "kept";
  const dirty = !v.google_synced_at || Date.parse(v.updated_at) > Date.parse(v.google_synced_at);
  const googleNewer = !e.updated || Date.parse(e.updated) >= Date.parse(v.updated_at);
  if (e.status === "cancelled") {
    if (v.status === "Cancelled") return "kept";
    await db.from("visits").update({ status: "Cancelled" }).eq("id", v.id);
    await markSynced(db, [v.id]);
    return "cancelled";
  }
  const t = eventTimes(e);
  if (!t) return "kept";
  const patch: Record<string, unknown> = {};
  if (!v.starts_at || Date.parse(v.starts_at) !== Date.parse(t.startIso)) patch.starts_at = t.startIso;
  if (snapDuration(t.minutes) !== (v.duration ?? "")) patch.duration = snapDuration(t.minutes);
  if (!Object.keys(patch).length) {
    if (!dirty) await markSynced(db, [v.id], [e.id], [e.etag ?? null]);
    return "kept";
  }
  if (dirty && !googleNewer) return "kept"; // the CRM changed it later; the push will put Google right
  await db.from("visits").update(patch).eq("id", v.id);
  await markSynced(db, [v.id], [e.id], [e.etag ?? null]);
  return "moved";
}

/** Changes in Google since the last sync. */
export async function pull(): Promise<PullResult | { skipped: string }> {
  const s = await loadSettings();
  if (!s?.calendar_id) return { skipped: "no calendar chosen" };
  if (!s.sync_token) return { skipped: "the calendar hasn't been read yet" };
  const db = adminDb();
  const items: GEvent[] = [];
  let pageToken: string | undefined;
  let syncToken: string | undefined;
  try {
    do {
      const page = await listEvents(s.calendar_id, { syncToken: s.sync_token, pageToken, maxResults: PAGE });
      items.push(...page.items);
      pageToken = page.nextPageToken;
      syncToken = page.nextSyncToken ?? syncToken;
    } while (pageToken);
  } catch (e) {
    if (e instanceof GoogleApiError && e.status === 410) {
      // The token expired: Google wants a full read again. Existing events keep their visits.
      await saveSettings({ ...s, sync_token: null, import: blankImport(s.import?.from ?? DEFAULT_FROM) });
      return { changed: 0, created: 0, moved: 0, cancelled: 0, resync: true };
    }
    throw e;
  }
  const r: PullResult = { changed: items.length, created: 0, moved: 0, cancelled: 0, resync: false };
  const live = items.filter((e) => e.status !== "cancelled");
  await upsertEvents(db, s.calendar_id, live);
  const { data } = items.length ? await db.from("calendar_events").select("id, calendar_id, status, summary, color_id, starts_at, match_status, visit_id, raw").in("id", items.map((e) => e.id)) : { data: [] };
  const rows = new Map(((data ?? []) as EventRow[]).map((r) => [r.id, r]));
  const fresh: EventRow[] = [];
  for (const e of items) {
    const row = rows.get(e.id);
    if (e.status === "cancelled") {
      if (row) {
        await db.from("calendar_events").update({ status: "cancelled", updated_at: now() }).eq("id", e.id);
        if (row.visit_id && (await applyToVisit(db, row.visit_id, e)) === "cancelled") r.cancelled++;
      }
      continue;
    }
    if (!row) continue;
    if (row.visit_id) {
      if ((await applyToVisit(db, row.visit_id, e)) === "moved") r.moved++;
    } else if (row.match_status === "new") fresh.push(row);
  }
  if (fresh.length) {
    const cat = await loadCatalog(db, s.color_map, s.name_map);
    const c = await processNew(db, s, cat, fresh);
    r.created = c.created;
  }
  const latest = (await loadSettings())!;
  await saveSettings({ ...latest, sync_token: syncToken ?? latest.sync_token, last_sync_at: now(), last_sync_error: null });
  return r;
}

// ---------------------------------------------------------------- push: CRM → Google

type DirtyVisit = {
  id: number;
  starts_at: string | null;
  duration: string | null;
  arrival_window: string | null;
  status: string | null;
  service_type: string | null;
  instructions: string | null;
  access_notes: string | null;
  technician_id: number | null;
  vehicle_id: number | null;
  google_event_id: string | null;
  deleted_at: string | null;
  archived_at: string | null;
  projects: { title: string | null; job_address: Address | null } | null;
  visits_team: { target_id: number }[];
};

export type PushResult = { pushed: number; inserted: number; updated: number; removed: number; failed: number };

/** Visits changed since they last agreed with Google. */
export async function push(limit = 300): Promise<PushResult | { skipped: string }> {
  const s = await loadSettings();
  if (!s?.calendar_id) return { skipped: "no calendar chosen" };
  if (!s.sync_token) return { skipped: "the calendar hasn't been read yet" };
  const db = adminDb();
  const { data: dirtyIds, error } = await db.rpc("google_dirty_visits", { p_limit: limit });
  if (error) throw new Error(error.message);
  const ids = (dirtyIds ?? []) as number[];
  const r: PushResult = { pushed: 0, inserted: 0, updated: 0, removed: 0, failed: 0 };
  if (!ids.length) return r;
  const { data } = await db
    .from("visits")
    .select("id, starts_at, duration, arrival_window, status, service_type, instructions, access_notes, technician_id, vehicle_id, google_event_id, deleted_at, archived_at, projects(title, job_address), visits_team(target_id)")
    .in("id", ids);
  const visits = (data ?? []) as unknown as DirtyVisit[];
  const people = [...new Set(visits.flatMap((v) => [v.technician_id, ...v.visits_team.map((t) => t.target_id)]).filter((x): x is number => x !== null))];
  const vans = [...new Set(visits.map((v) => v.vehicle_id).filter((x): x is number => x !== null))];
  const [{ data: emp }, { data: veh }] = await Promise.all([
    people.length ? db.from("employees").select("id, title").in("id", people) : Promise.resolve({ data: [] }),
    vans.length ? db.from("vehicles").select("id, tag_number").in("id", vans) : Promise.resolve({ data: [] }),
  ]);
  const name = new Map(((emp ?? []) as { id: number; title: string | null }[]).map((e) => [e.id, e.title ?? `#${e.id}`]));
  const tag = new Map(((veh ?? []) as { id: number; tag_number: string | null }[]).map((v) => [v.id, v.tag_number]));
  const site = siteUrl();

  for (const v of visits) {
    try {
      const gone = Boolean(v.deleted_at || v.archived_at) || v.status === "Cancelled";
      if (gone) {
        if (v.google_event_id) await deleteEvent(s.calendar_id, v.google_event_id);
        await markSynced(db, [v.id]);
        r.removed += v.google_event_id ? 1 : 0;
        r.pushed++;
        continue;
      }
      if (!v.starts_at) continue;
      // F19-a: a visit Claude proposed is not on the calendar until a PM approves it.
      if (v.status === "Proposed") {
        await markSynced(db, [v.id]);
        continue;
      }
      const body = visitToEvent(
        {
          id: v.id,
          projectTitle: v.projects?.title ?? null,
          address: oneLine(v.projects?.job_address ?? null),
          startsAt: v.starts_at,
          duration: Number(v.duration ?? 60),
          arrivalWindow: Number(v.arrival_window ?? 0),
          technicianName: v.technician_id ? name.get(v.technician_id) ?? null : null,
          technicianId: v.technician_id,
          teamNames: v.visits_team.map((t) => name.get(t.target_id)).filter((x): x is string => Boolean(x)),
          vehicleTag: v.vehicle_id ? tag.get(v.vehicle_id) ?? null : null,
          serviceType: v.service_type,
          instructions: v.instructions,
          accessNotes: v.access_notes,
          status: v.status,
          link: `${site}/schedule/visits/${v.id}`,
        },
        s.color_map,
      );
      let saved: GEvent | null = null;
      if (v.google_event_id) {
        try {
          saved = await patchEvent(s.calendar_id, v.google_event_id, body);
          r.updated++;
        } catch (e) {
          if (!(e instanceof GoogleApiError && (e.status === 404 || e.status === 410))) throw e;
        }
      }
      if (!saved) {
        saved = await insertEvent(s.calendar_id, body);
        r.inserted++;
      }
      await markSynced(db, [v.id], [saved.id], [saved.etag ?? null]);
      // The event is ours now: keep a copy so a later pull recognises it.
      await upsertEvents(db, s.calendar_id, [saved]);
      await db.from("calendar_events").update({ visit_id: v.id, match_status: v.projects ? "matched" : "unmatched", matched_at: now() }).eq("id", saved.id);
      r.pushed++;
    } catch (e) {
      r.failed++;
      console.error(`google push visit ${v.id}:`, e instanceof Error ? e.message : e);
    }
  }
  const latest = await loadSettings();
  if (latest) await saveSettings({ ...latest, last_push: { pushed: r.pushed, at: now() } });
  return r;
}

// ---------------------------------------------------------------- entry points

export type SyncSummary = { pull: PullResult | { skipped: string }; push: PushResult | { skipped: string } };

/** "Sync now" and the hourly tick: pull first (so Google's moves land), then push. */
export async function syncNow(): Promise<SyncSummary> {
  try {
    const p = await pull();
    const q = "resync" in p && p.resync ? { skipped: "reading the calendar again" } : await push();
    return { pull: p, push: q };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    const s = await loadSettings();
    if (s) await saveSettings({ ...s, last_sync_error: message, last_sync_at: now() });
    throw e;
  }
}

/** The hourly tick's step: finish an import that is under way, otherwise sync. Never throws. */
export async function googleHourly(): Promise<Record<string, unknown>> {
  try {
    const s = await loadSettings();
    if (!s?.calendar_id) return { skipped: "not connected" };
    const ph = s.import?.phase;
    if (ph === "reading" || ph === "creating") return { import: await runImport() };
    if (ph === "read") return { skipped: "waiting for Create visits" };
    return await syncNow();
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}
