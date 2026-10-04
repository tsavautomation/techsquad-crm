import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { encrypt } from "@/lib/crypto";
import { formatDate, formatDateTime, fromDateTimeLocalET } from "@/lib/dates";
import { downloadItem, listChildren, oneDriveReady } from "@/lib/files/onedrive";
import { loadSettings as googleSettings } from "@/lib/google/client";
import { findPeople, norm, scoreProjects, snapDuration, type CatEmployee, type CatProject, type GEvent } from "@/lib/google/match";
import { adminDb } from "@/lib/supabase/admin";
import { aiReadReport, type AiReport } from "./ai";
import { anyDate, minutesBetween, NOT_NAMES, parse123Form, parseClientFolder, parseFileName, parseJotform, splitCredentials, type ParsedFolder, type ParsedName, type ParsedReport } from "./parse";
import { extractFileText } from "./read";

// F16 Report archive (SPEC §9.1 F16): the old field reports in OneDrive become Job Reports and Visits.
//
//   1. Scan: walk PROJECTS TS / <designer or GC> / <client> / "…Reports" and list every file in
//      report_files, with what its name and folder say. Resumable (folder indexes in the state).
//   2. Import: for each file, read the text (forms by their layout, the rest through Claude), find the
//      project (same scoring as the calendar import, plus the unit), name the technicians, then create
//      the Job Report, the day's Visit (check-in / check-out when the form has them) and a link to the
//      file in OneDrive. A dry run does everything but the creating, so the result can be reviewed.
//
// Everything is written with the service role: the before_write trigger stamps and audits, the audit
// rows are marked 'skipped' so no automation (e-mails!) fires for history, and the visits are marked
// in step with Google so they never get pushed to the calendar.

export const ROOT = "PROJECTS TS";
const KEY = "report_archive";
const BUDGET_MS = 200_000;
const STALE_MS = 90_000;
const STALE = new Date(0).toISOString();
const UNSUPPORTED = new Set(["xlsx", "xls", "mp4", "mov", "zip", "msg", "lnk", "mjs", "exe", ""]);
const now = () => new Date().toISOString();

export type ArchivePhase = "idle" | "scanning" | "scanned" | "importing" | "done" | "error";
export type ArchiveState = {
  phase: ArchivePhase;
  /** Files dated on or after this day are skipped (the WebAuthor period is already in the CRM). */
  cutoff: string;
  dryRun: boolean;
  scan: { gcIndex: number; clientIndex: number; files: number };
  counts: { imported: number; skipped: number; unmatched: number; errors: number; read: number };
  heartbeat: string;
  startedAt: string;
  finishedAt?: string;
  error?: string;
  /** Technicians named in the files who were added as inactive employees. */
  addedStaff: string[];
};

export const blankState = (cutoff: string): ArchiveState => ({ phase: "idle", cutoff, dryRun: true, scan: { gcIndex: 0, clientIndex: 0, files: 0 }, counts: { imported: 0, skipped: 0, unmatched: 0, errors: 0, read: 0 }, heartbeat: STALE, startedAt: now(), addedStaff: [] });

export async function loadState(): Promise<ArchiveState | null> {
  const { data } = await adminDb().from("app_integrations").select("data").eq("key", KEY).maybeSingle();
  return ((data as { data: ArchiveState } | null)?.data as ArchiveState | undefined) ?? null;
}

export async function saveState(s: ArchiveState) {
  const { error } = await adminDb().from("app_integrations").upsert({ key: KEY, data: s, updated_at: now() });
  if (error) throw new Error(`Could not save the archive state: ${error.message}`);
}

async function patchState(patch: Partial<ArchiveState>) {
  const s = (await loadState()) ?? blankState(await defaultCutoff());
  await saveState({ ...s, ...patch });
}

export const busy = (s: ArchiveState | null | undefined) => Boolean(s && (s.phase === "scanning" || s.phase === "importing") && Date.now() - Date.parse(s.heartbeat) < STALE_MS);

/** The first WebAuthor Job Report's date: everything from there on is already in the CRM. */
export async function defaultCutoff(): Promise<string> {
  const { data } = await adminDb().from("job_reports").select("date").gte("id", 1000).not("date", "is", null).order("date").limit(1).maybeSingle();
  return (data as { date: string } | null)?.date ?? "2025-08-01";
}

// ---------------------------------------------------------------- 1. scan

type FileRow = {
  id: string;
  gc_folder: string;
  client_folder: string;
  folder: string;
  name: string;
  ext: string | null;
  size: number | null;
  modified: string | null;
  parsed: { name: ParsedName; folder: ParsedFolder };
  status: string;
};

const byName = <T extends { name: string }>(a: T, b: T) => a.name.localeCompare(b.name, "en", { sensitivity: "base" });

/** Walk the tree from the saved position until the deadline. True when the whole tree has been listed. */
async function scanChunk(db: SupabaseClient, deadline: number): Promise<boolean> {
  let s = (await loadState())!;
  const gcs = (await listChildren(ROOT)).filter((c) => c.folder).sort(byName);
  for (let g = s.scan.gcIndex; g < gcs.length; g++) {
    const clients = (await listChildren(`${ROOT}/${gcs[g].name}`)).filter((c) => c.folder).sort(byName);
    for (let c = g === s.scan.gcIndex ? s.scan.clientIndex : 0; c < clients.length; c++) {
      if (Date.now() > deadline) {
        await patchState({ scan: { ...s.scan, gcIndex: g, clientIndex: c }, heartbeat: now() });
        return false;
      }
      const subs = (await listChildren(`${ROOT}/${gcs[g].name}/${clients[c].name}`)).filter((x) => x.folder && /report/i.test(x.name));
      const folder = parseClientFolder(clients[c].name);
      const rows: Omit<FileRow, "status">[] = [];
      for (const sub of subs) {
        for (const f of (await listChildren(`${ROOT}/${gcs[g].name}/${clients[c].name}/${sub.name}`)).filter((x) => x.file)) {
          const name = parseFileName(f.name);
          rows.push({ id: f.id, gc_folder: gcs[g].name, client_folder: clients[c].name, folder: sub.name, name: f.name, ext: name.ext || null, size: f.size ?? null, modified: f.lastModifiedDateTime ?? null, parsed: { name, folder } });
        }
      }
      if (rows.length) {
        const { error } = await db.from("report_files").upsert(rows.map((r) => ({ ...r, updated_at: now() })), { onConflict: "id" });
        if (error) throw new Error(`report_files: ${error.message}`);
      }
      // Saved per client folder: the page shows progress, and the heartbeat stays fresh in big folders.
      s = { ...s, scan: { gcIndex: g, clientIndex: c + 1, files: s.scan.files + rows.length }, heartbeat: now() };
      await saveState(s);
    }
    s = { ...s, scan: { ...s.scan, gcIndex: g + 1, clientIndex: 0 } };
    await saveState(s);
  }
  await ensureStaff(db);
  await patchState({ phase: "scanned", heartbeat: now(), scan: { ...s.scan, gcIndex: gcs.length, clientIndex: 0 } });
  return true;
}

// ---------------------------------------------------------------- people and projects

type Catalog = { projects: CatProject[]; employees: CatEmployee[]; nameMap: Record<string, number>; projectTitle: Map<number, string> };

async function loadCatalog(db: SupabaseClient): Promise<Catalog> {
  const [{ data: pr }, { data: emp }, g] = await Promise.all([
    db.from("projects").select("id, title, job_address, apartment_or_unit, created_at, job_owner_id").is("deleted_at", null),
    db.from("employees").select("id, title").is("deleted_at", null),
    googleSettings().catch(() => null),
  ]);
  type Addr = { street?: string; city?: string; zip?: string } | null;
  const projects = ((pr ?? []) as { id: number; title: string | null; job_address: Addr; apartment_or_unit: string | null; created_at: string | null; job_owner_id: number | null }[]).filter((p) => p.title);
  const ownerIds = [...new Set(projects.map((p) => p.job_owner_id).filter((x): x is number => x !== null))];
  const { data: owners } = ownerIds.length ? await db.from("contacts").select("id, title").in("id", ownerIds) : { data: [] };
  const ownerName = new Map(((owners ?? []) as { id: number; title: string | null }[]).map((c) => [c.id, c.title]));
  // The calendar's names map, plus the one name the files can't tell apart by colour (Fred 2026-10-04: Roberto = Pizini unless told otherwise).
  const nameMap: Record<string, number> = { roberto: 1011, ...(g?.name_map ?? {}) };
  return {
    projects: projects.map((p) => ({ id: p.id, title: p.title!, street: p.job_address?.street ?? null, city: p.job_address?.city ?? null, zip: p.job_address?.zip ?? null, unit: p.apartment_or_unit?.trim() || null, owner: (p.job_owner_id && ownerName.get(p.job_owner_id)) || null, createdAt: p.created_at })),
    employees: ((emp ?? []) as { id: number; title: string | null }[]).filter((e) => e.title).map((e) => ({ id: e.id, name: e.title! })),
    nameMap,
    projectTitle: new Map(projects.map((p) => [p.id, p.title!])),
  };
}

/** First names from the file names → employee ids, through the names map, then unique first names. */
function technicianIds(names: string[], cat: Catalog): number[] {
  const out: number[] = [];
  for (const n of names) {
    const key = norm(n);
    const id = cat.nameMap[key] ?? (findPeople(key, cat.employees).length === 1 ? findPeople(key, cat.employees)[0].id : null);
    if (id && !out.includes(id)) out.push(id);
  }
  return out;
}

/** Technicians named in at least five files with no employee to match: added as inactive employees (Fred 2026-10-04). */
async function ensureStaff(db: SupabaseClient) {
  const cat = await loadCatalog(db);
  const count = new Map<string, number>();
  for (let from = 0; ; from += 1000) {
    const { data } = await db.from("report_files").select("parsed").range(from, from + 999);
    const rows = (data ?? []) as { parsed: { name: ParsedName } }[];
    for (const r of rows) for (const n of r.parsed.name?.technicians ?? []) count.set(n, (count.get(n) ?? 0) + 1);
    if (rows.length < 1000) break;
  }
  const added: string[] = [];
  for (const [name, n] of count) {
    if (n < 5 || NOT_NAMES.has(name.toLowerCase()) || technicianIds([name], cat).length) continue;
    const { error } = await db.from("employees").insert({ first_name: name, last_name: null, title: name, status: "Inactive" });
    if (!error) added.push(name);
  }
  if (added.length) await patchState({ addedStaff: [...((await loadState())?.addedStaff ?? []), ...added] });
}

/** "Acta I" and "ACTA 1" are the same job: roman numerals become digits before scoring. */
const ROMAN: Record<string, string> = { i: "1", ii: "2", iii: "3", iv: "4", v: "5", vi: "6" };
const arabic = (s: string) => s.replace(/\b(i{1,3}|iv|vi?)\b/gi, (m) => ROMAN[m.toLowerCase()] ?? m);

/** The project a file belongs to, from the client folder, the place and the job in the file name. */
function matchProject(file: FileRow, cat: Catalog) {
  const f = file.parsed.folder;
  const n = file.parsed.name;
  const e: GEvent = { id: file.id, summary: arabic(`${f.client} – ${f.place ?? ""} – ${n.job ?? ""}`.replace(/\s+–\s+–/g, " –")), location: [f.place, f.unit ? `#${f.unit}` : null].filter(Boolean).join(" ") };
  const scores = scoreProjects(e, cat.projects.map((p) => ({ ...p, title: arabic(p.title) })), n.technicians);
  const best = scores[0];
  const second = scores[1];
  const matched = best && (best.score >= 85 || (best.score >= 60 && best.score - (second?.score ?? 0) >= 20));
  return { projectId: matched ? best.id : null, candidates: scores.slice(0, 5).map((s) => ({ id: s.id, title: cat.projectTitle.get(s.id), score: s.score })) };
}

// ---------------------------------------------------------------- 2. read one file

export type Extracted = {
  layout: string;
  date: string | null;
  checkIn: string | null;
  checkOut: string | null;
  technicians: string[];
  report: string;
  credentials: string | null;
  pending: string[];
  materials: string | null;
  problems: string | null;
  result: "Completed" | "Partial" | "Not done" | null;
  payments: string | null;
  notAReport: boolean;
};

async function readFile(file: FileRow): Promise<Extracted | { error: string }> {
  const got = await downloadItem(file.id);
  if (!got) return { error: "could not download" };
  const ext = file.ext ?? "";
  const hint = `${file.gc_folder} / ${file.client_folder} / ${file.name}`;
  const x = await extractFileText(got.bytes, ext);
  const fromForm = (p: ParsedReport): Extracted => {
    const { report, credentials } = splitCredentials(p.report);
    return { layout: p.layout, date: p.date, checkIn: p.checkIn, checkOut: p.checkOut, technicians: p.technicians, report, credentials, pending: [], materials: null, problems: null, result: null, payments: p.payments, notAReport: false };
  };
  if (x.text) {
    const form = parse123Form(x.text) ?? parseJotform(x.text);
    if (form && form.report) return fromForm(form);
    const ai = await aiReadReport({ text: x.text, hint });
    if ("error" in ai) return ai;
    return fromAi(ai, "free");
  }
  if (x.kind === "image") {
    const ai = await aiReadReport({ image: { bytes: got.bytes, mime: got.mime ?? `image/${ext === "jpg" ? "jpeg" : ext}` }, hint });
    return "error" in ai ? ai : fromAi(ai, "image");
  }
  if (x.kind === "pdf" && got.bytes.length <= 20 * 1024 * 1024) {
    const ai = await aiReadReport({ pdf: got.bytes, hint });
    return "error" in ai ? ai : fromAi(ai, "scan");
  }
  return { error: x.kind === "unsupported" ? `.${ext} files can't be read` : "no text could be read" };
}

function fromAi(ai: AiReport, layout: string): Extracted {
  const { report, credentials } = splitCredentials(ai.report);
  return { layout, date: ai.date, checkIn: ai.checkIn, checkOut: ai.checkOut, technicians: ai.technicians, report, credentials: [ai.credentials, credentials].filter(Boolean).join("\n") || null, pending: ai.pending, materials: ai.materials, problems: ai.problems, result: ai.result, payments: null, notAReport: ai.notAReport };
}

// ---------------------------------------------------------------- 3. create

async function markAuditSkipped(db: SupabaseClient, table: string, id: number) {
  await db.from("audit_log").update({ automation_status: "skipped" }).eq("table_name", table).eq("record_id", id).is("automation_status", null);
}

async function createRecords(db: SupabaseClient, file: FileRow, x: Extracted, date: string, projectId: number, team: number[], cat: Catalog) {
  const projectTitle = cat.projectTitle.get(projectId) ?? `Project #${projectId}`;
  const teamNames = team.map((id) => cat.employees.find((e) => e.id === id)?.name ?? "").filter(Boolean);
  const visitType = file.parsed.name.visitType;

  // The visit: the real check-in / check-out when the form has them, otherwise 9:00 for two hours.
  const minutes = minutesBetween(x.checkIn, x.checkOut);
  const startsAt = fromDateTimeLocalET(`${date}T${x.checkIn ?? "09:00"}`);
  const { data: v, error: ve } = await db
    .from("visits")
    .insert({
      title: `${projectTitle} – ${formatDateTime(startsAt)}`,
      project_id: projectId,
      starts_at: startsAt,
      duration: minutes ? snapDuration(minutes) : "120",
      arrival_window: "0",
      technician_id: team[0] ?? null,
      service_type: visitType,
      status: "Done",
      checked_in_at: x.checkIn ? startsAt : null,
      checked_out_at: x.checkIn && x.checkOut && minutes ? fromDateTimeLocalET(`${date}T${x.checkOut}`) : null,
    })
    .select("id")
    .single();
  if (ve || !v) throw new Error(`visit: ${ve?.message}`);
  const visitId = (v as { id: number }).id;
  if (team.length > 1) await db.from("visits_team").insert(team.slice(1).map((id) => ({ record_id: visitId, target_id: id })));
  await db.rpc("google_mark_synced", { p_ids: [visitId] }); // history: never pushed to Google Calendar

  const lines = [x.report, x.payments ? `Payment received: ${x.payments}` : null].filter(Boolean).join("\n\n");
  const pending = Object.fromEntries(x.pending.slice(0, 5).map((p, i) => [`pending_${i + 1}`, p]));
  const { data: r, error: re } = await db
    .from("job_reports")
    .insert({
      title: `${projectTitle} – ${teamNames.join(", ")} – ${formatDate(date)}`,
      project_id: projectId,
      visit_id: visitId,
      date,
      report: lines || null,
      materials_used: x.materials,
      problems: x.problems,
      result: x.result,
      logins_and_passwords: x.credentials ? encrypt(x.credentials) : null,
      maintenance_plan_service_call: /maintenance/i.test(visitType ?? ""),
      ...pending,
    })
    .select("id")
    .single();
  if (re || !r) throw new Error(`job report: ${re?.message}`);
  const reportId = (r as { id: number }).id;
  if (team.length) await db.from("job_reports_team").insert(team.map((id) => ({ record_id: reportId, target_id: id })));
  await attachFile(db, file, reportId);
  await markAuditSkipped(db, "visits", visitId);
  await markAuditSkipped(db, "job_reports", reportId);
  return { reportId, visitId };
}

/** The original file, as it sits in OneDrive, on the report's Files (nothing is copied). */
async function attachFile(db: SupabaseClient, file: FileRow, reportId: number) {
  await db.from("attachments").insert({
    table_name: "job_reports",
    record_id: reportId,
    field: "files",
    provider: "onedrive",
    provider_path: file.id,
    provider_folder: `${ROOT}/${file.gc_folder}/${file.client_folder}/${file.folder}`,
    file_name: file.name,
    mime_type: file.ext ? mimeOf(file.ext) : null,
    size_bytes: file.size,
  });
}

const mimeOf = (ext: string) => ({ pdf: "application/pdf", jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", txt: "text/plain", html: "text/html" })[ext] ?? null;

// ---------------------------------------------------------------- the import loop

async function processFile(db: SupabaseClient, file: FileRow, s: ArchiveState, cat: Catalog): Promise<"imported" | "skipped" | "unmatched" | "error" | "read"> {
  const set = async (patch: Record<string, unknown>) => {
    await db.from("report_files").update({ ...patch, updated_at: now() }).eq("id", file.id);
  };
  const n = file.parsed.name;
  if (UNSUPPORTED.has(file.ext ?? "")) {
    await set({ status: "skipped", reason: `.${file.ext} files are not reports` });
    return "skipped";
  }
  if (n.date && n.date >= s.cutoff) {
    await set({ status: "skipped", reason: `dated ${n.date}, on or after the WebAuthor cutoff` });
    return "skipped";
  }
  // Another file of the same visit (a "(1)" or "_a" copy already imported): link it to that report.
  if (n.date) {
    const { data: twin } = await db.from("report_files").select("job_report_id").eq("client_folder", file.client_folder).eq("status", "imported").contains("parsed", { name: { date: n.date } }).not("job_report_id", "is", null).limit(1).maybeSingle();
    const twinReport = (twin as { job_report_id: number } | null)?.job_report_id;
    if (twinReport && !s.dryRun) {
      await attachFile(db, file, twinReport);
      await set({ status: "skipped", reason: `another file of the same visit, added to report #${twinReport}`, job_report_id: twinReport });
      return "skipped";
    }
  }
  const x = file.status === "read" && (await readBack(db, file.id));
  const read = x || (await readFile(file));
  if ("error" in read) {
    await set({ status: "error", reason: read.error });
    return "error";
  }
  if (read.notAReport) {
    await set({ status: "skipped", reason: "not a visit report", layout: read.layout, extracted: read });
    return "skipped";
  }
  const date = n.date ?? read.date ?? anyDate(file.name) ?? (file.modified ? file.modified.slice(0, 10) : null);
  if (!date) {
    await set({ status: "error", reason: "no date in the name or the text", layout: read.layout, extracted: read });
    return "error";
  }
  if (date >= s.cutoff) {
    await set({ status: "skipped", reason: `dated ${date}, on or after the WebAuthor cutoff`, layout: read.layout, extracted: read });
    return "skipped";
  }
  const names = n.technicians.length ? n.technicians : read.technicians;
  const team = technicianIds(names, cat);
  const { projectId, candidates } = matchProject(file, cat);
  if (!projectId) {
    await set({ status: "unmatched", reason: "no project found for this folder", layout: read.layout, extracted: read, candidates });
    return "unmatched";
  }
  if (s.dryRun) {
    await set({ status: "read", reason: null, layout: read.layout, extracted: read, candidates, project_id: projectId });
    return "read";
  }
  const made = await createRecords(db, file, read, date, projectId, team, cat);
  await set({ status: "imported", reason: null, layout: read.layout, extracted: read, candidates, project_id: projectId, job_report_id: made.reportId, visit_id: made.visitId });
  return "imported";
}

/** What a dry run already read, so the real run doesn't read (or pay for) it again. */
async function readBack(db: SupabaseClient, id: string): Promise<Extracted | null> {
  const { data } = await db.from("report_files").select("extracted").eq("id", id).maybeSingle();
  return ((data as { extracted: Extracted | null } | null)?.extracted as Extracted | null) ?? null;
}

async function importChunk(db: SupabaseClient, deadline: number): Promise<boolean> {
  let s = (await loadState())!;
  const cat = await loadCatalog(db);
  while (Date.now() < deadline) {
    const { data, error } = await db
      .from("report_files")
      .select("id, gc_folder, client_folder, folder, name, ext, size, modified, parsed, status")
      .in("status", s.dryRun ? ["new"] : ["new", "read"])
      .order("client_folder")
      .order("name")
      .limit(10);
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as FileRow[];
    if (!rows.length) {
      await patchState({ phase: "done", finishedAt: now(), heartbeat: now() });
      return true;
    }
    for (const file of rows) {
      let outcome: Awaited<ReturnType<typeof processFile>>;
      try {
        outcome = await processFile(db, file, s, cat);
      } catch (e) {
        outcome = "error";
        await db.from("report_files").update({ status: "error", reason: e instanceof Error ? e.message.slice(0, 500) : String(e), updated_at: now() }).eq("id", file.id);
      }
      const c = { ...s.counts };
      if (outcome === "imported") c.imported++;
      else if (outcome === "skipped") c.skipped++;
      else if (outcome === "unmatched") c.unmatched++;
      else if (outcome === "error") c.errors++;
      else c.read++;
      s = { ...s, counts: c, heartbeat: now() };
    }
    await saveState(s);
  }
  return false;
}

/** Run the current step for up to budgetMs (background). A stale heartbeat lets a new run take over. */
export async function runArchive(budgetMs = BUDGET_MS): Promise<"busy" | "nothing" | "paused" | "done" | "error"> {
  const s = await loadState();
  if (!s || (s.phase !== "scanning" && s.phase !== "importing")) return "nothing";
  if (busy(s) || !(await oneDriveReady())) return "busy";
  const db = adminDb();
  await patchState({ heartbeat: now(), error: undefined });
  try {
    const done = s.phase === "scanning" ? await scanChunk(db, Date.now() + budgetMs) : await importChunk(db, Date.now() + budgetMs);
    return done ? "done" : "paused";
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("report archive:", message);
    await patchState({ phase: "error", error: message, heartbeat: now() });
    return "error";
  }
}

/** Admin: start (or resume) the scan. */
export async function startScan(cutoff: string) {
  const s = await loadState();
  const resume = s && s.phase === "error" && s.scan.files > 0;
  await saveState(resume ? { ...s, phase: "scanning", cutoff, error: undefined, heartbeat: STALE } : { ...blankState(cutoff), phase: "scanning" });
}

/** Admin: dry run or the real import over everything not yet decided. */
export async function startImport(dryRun: boolean) {
  const s = await loadState();
  if (!s) throw new Error("Scan the folders first.");
  const db = adminDb();
  // A real run after a dry run picks up the files the dry run read; a new dry run starts from scratch.
  if (dryRun) await db.from("report_files").update({ status: "new", updated_at: now() }).in("status", ["read", "unmatched", "error"]);
  else await db.from("report_files").update({ status: "new", updated_at: now() }).in("status", ["unmatched", "error"]);
  await saveState({ ...s, phase: "importing", dryRun, error: undefined, heartbeat: STALE, counts: { imported: 0, skipped: 0, unmatched: 0, errors: 0, read: 0 }, startedAt: now(), finishedAt: undefined });
}

export type ArchiveSummary = {
  byStatus: Record<string, number>;
  byLayout: Record<string, number>;
  unmatchedFolders: { folder: string; files: number; candidates: { title?: string; score: number }[] }[];
  errors: { name: string; reason: string }[];
  staff: string[];
};

/** For the Admin page: where things stand, and what needs a human. */
export async function summary(): Promise<ArchiveSummary> {
  const db = adminDb();
  const byStatus: Record<string, number> = {};
  const byLayout: Record<string, number> = {};
  const folders = new Map<string, { files: number; candidates: { title?: string; score: number }[] }>();
  const errors: { name: string; reason: string }[] = [];
  for (let from = 0; ; from += 1000) {
    const { data } = await db.from("report_files").select("client_folder, name, status, reason, layout, candidates").range(from, from + 999);
    const rows = (data ?? []) as { client_folder: string; name: string; status: string; reason: string | null; layout: string | null; candidates: { title?: string; score: number }[] | null }[];
    for (const r of rows) {
      byStatus[r.status] = (byStatus[r.status] ?? 0) + 1;
      if (r.layout) byLayout[r.layout] = (byLayout[r.layout] ?? 0) + 1;
      if (r.status === "unmatched") {
        const f = folders.get(r.client_folder) ?? { files: 0, candidates: r.candidates?.slice(0, 2) ?? [] };
        f.files++;
        folders.set(r.client_folder, f);
      }
      if (r.status === "error" && errors.length < 20) errors.push({ name: r.name, reason: r.reason ?? "" });
    }
    if (rows.length < 1000) break;
  }
  const s = await loadState();
  return {
    byStatus,
    byLayout,
    unmatchedFolders: [...folders].map(([folder, f]) => ({ folder, ...f })).sort((a, b) => b.files - a.files).slice(0, 60),
    errors,
    staff: s?.addedStaff ?? [],
  };
}
