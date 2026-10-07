/**
 * Move the old "PROJECTS TS / <designer or GC> / <client folder>" folders in OneDrive into the CRM's
 * project folders, "TechSquad CRM / Projects / <project> (<id>)", so everything about a project sits in
 * one place (Fred 2026-10-06, SPEC §9.1 OD-f). A folder moves on its own when its project is certain:
 *   1. a folder decided by hand on Admin › Report archive (F16-d), or one whose report files were ALL
 *      imported into the same project by the archive import (F16), at least 3, none unmatched; or
 *   2. (OD-g) the person in the folder name ("EISE, RICHARD - AVENTURA") is the owner or the title of
 *      exactly one project ("Eisen, Richard 2320 Bayview"; a typo of one letter is allowed), and the
 *      units, when both have one, agree. A house or business name ("SCHWARTZ RESIDENCE - BELLINI #2003")
 *      needs the name and the place to match one project.
 * A folder that looks like a project but not surely enough goes to the "Review" sheet with the two
 * likeliest projects; Fred answers in the YOUR DECISION column (1, 2, a project number, or Skip) and
 * the answers are applied with --from-sheet. Everything else stays, with the reason.
 *
 *   npx tsx --conditions=react-server --env-file=.env.local scripts/move-projects-ts.ts               # dry run → docs/projects-ts-move.xlsx
 *   npx tsx --conditions=react-server --env-file=.env.local scripts/move-projects-ts.ts --apply       # move the certain ones
 *   npx tsx --conditions=react-server --env-file=.env.local scripts/move-projects-ts.ts --from-sheet  # move what Fred decided in the sheet
 *
 * A move keeps the OneDrive item ids, so the archive Job Reports' file links keep working. The folder
 * paths the CRM stores (attachments.provider_folder, record_pdfs.folder, the onedrive_folders cache)
 * are rewritten after each move, and every move is logged in app_integrations key "projects_ts_moves"
 * (item id, from, to) so it can be undone.
 */
import ExcelJS from "exceljs";
import { folderKey } from "@/lib/archive/match";
import { parseClientFolder } from "@/lib/archive/parse";
import { loadDecisions } from "@/lib/archive/sync";
import { getItem, listChildren, moveIntoFolder } from "@/lib/files/onedrive";
import { safeName } from "@/lib/files/paths";
import { norm } from "@/lib/google/match";
import { adminDb } from "@/lib/supabase/admin";

const OLD_ROOT = "PROJECTS TS";
const NEW_ROOT = "TechSquad CRM/Projects";
const LOG_KEY = "projects_ts_moves";
const SHEET = "docs/projects-ts-move.xlsx";
/** A folder matched only by its imported files needs at least this many of them to count as certain. */
const MIN_FILES = 3;
const apply = process.argv.includes("--apply");
const fromSheet = process.argv.includes("--from-sheet");

type Candidate = { id: number; title: string; score: number; why: string };
type Plan = {
  gc: string;
  folder: string;
  itemId: string;
  files: number;
  projectId: number | null;
  project: string | null;
  dest: string | null;
  reason: string;
  /** OD-g: the likeliest projects when the folder is not certain. */
  candidates: Candidate[];
};
type Move = { itemId: string; from: string; to: string; name: string; movedAt: string };
type Db = ReturnType<typeof adminDb>;

async function main() {
  const db = adminDb();
  const projects = await loadProjects(db);
  const byId = new Map(projects.map((p) => [p.id, p]));
  const destOf = (p: ProjectInfo) => `${NEW_ROOT}/${safeName(`${p.title} (${p.id})`)}`;

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

  // Fred's answers in the sheet (--from-sheet).
  const answers = fromSheet ? await readAnswers() : new Map<string, number | "skip">();

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
      let candidates: Candidate[] = [];
      const answer = answers.get(c.id);
      if (answer !== undefined) {
        projectId = answer === "skip" ? null : answer;
        reason = answer === "skip" ? "Fred: skip" : "Fred's answer in the sheet";
      } else if (decisions.has(key)) {
        projectId = decisions.get(key) ?? null;
        reason = projectId ? "decided by hand on Admin › Report archive" : "decided by hand: no project";
      } else if (stats && stats.projects.size === 1 && stats.unmatched === 0 && stats.files >= MIN_FILES) {
        projectId = [...stats.projects][0];
        reason = `all ${stats.files} report files were imported into this project`;
      } else {
        // OD-g: the name on the folder against the owner and title of every project.
        const m = deepMatch(c.name, projects);
        candidates = m.candidates;
        if (m.sure) {
          projectId = m.sure.id;
          reason = m.sure.why;
        } else if (m.candidates.length) {
          reason = `not sure: ${m.candidates[0].why}`;
        } else if (!stats) reason = "no project with this name, and no report files tie it to one";
        else if (stats.projects.size === 0) reason = `no project with this name; none of its ${stats.files} report files found a project`;
        else if (stats.projects.size > 1) reason = `its report files point to ${stats.projects.size} different projects`;
        else if (stats.unmatched) reason = `${stats.unmatched} of its ${stats.files} report files found no project`;
        else reason = `only ${stats.files} report file${stats.files === 1 ? "" : "s"} tie it to a project (fewer than ${MIN_FILES}): not sure enough`;
      }
      if (projectId && !byId.has(projectId)) {
        reason = `project #${projectId} no longer exists`;
        projectId = null;
      }
      const p = projectId ? byId.get(projectId)! : null;
      plan.push({ gc: gc.name, folder: c.name, itemId: c.id, files: stats?.files ?? 0, projectId, project: p?.title ?? null, dest: p ? destOf(p) : null, reason, candidates });
    }
  }
  const moving = plan.filter((p) => p.dest);
  const review = plan.filter((p) => !p.dest && p.candidates.length);
  const staying = plan.filter((p) => !p.dest && !p.candidates.length);
  console.log(`${plan.length} client folders in ${gcs.length} designer / GC folders: ${moving.length} to move, ${review.length} to review, ${staying.length} stay.`);

  const log: Move[] = [];
  const failed: string[] = [];
  const { data: prev } = await db.from("app_integrations").select("data").eq("key", LOG_KEY).maybeSingle();
  log.push(...(((prev as { data: { moves?: Move[] } } | null)?.data?.moves ?? []) as Move[]));
  if (apply || fromSheet) {
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
  console.log(apply || fromSheet ? `Moved ${log.length} in all (this run and before), ${failed.length} failed. ` : "Dry run; nothing moved. ", `Sheet: ${SHEET}`);
}

// ---------------------------------------------------------------- OD-g deep match

type ProjectInfo = { id: number; title: string; titleTokens: string[]; ownerFirst: string[]; ownerLast: string[]; addrTokens: string[]; numbers: string[]; unit: string | null };

/** Words that say nothing about who or where. */
const STOP = new Set("the and of e y de da do dos das mr mrs ms dr res residence residencia project proj house home apt apartment unit suite ste ph old new fl florida usa ave av st street dr drive rd road blvd ct ln way n s w ne nw se sw tower towers condo condominium bldg building office inc llc".split(" "));
/** Place words that are never a person's name. */
const GEO = new Set("beach miami north south east west bay island islands isle isles key keys park lake ocean grove point harbour harbor palm coral gables boca raton aventura hollywood brickell pinecrest surfside shores springs sunny delray pompano weston parkland plantation jupiter york nassau estates estate club tower towers village city county river creek".split(" "));
const words = (s: string | null | undefined) => norm(s).split(" ").filter((w) => w && !STOP.has(w));
const nameWords = (s: string | null | undefined) => words(s).filter((w) => !GEO.has(w) && !/^\d+$/.test(w));
const unitOf = (s: string | null | undefined) => (s ? norm(s).replace(/\b(apt|unit|suite|ste|ph|tower|south|north|east|west)\b/g, " ").replace(/\s+/g, "").toUpperCase() || null : null);
/** Cities the projects are in: a folder that names only a city says nothing against the project's address. */
let CITIES = new Set<string>();
/** Folders Fred has said are not the project they look like (2026-10-04: "Vale Coral Gables stay apart"). */
const NEVER_SURE = new Set(["VALE, OSWALDO - CORAL GABLES"].map(folderKey));

async function loadProjects(db: Db): Promise<ProjectInfo[]> {
  type Addr = { street?: string; city?: string } | null;
  const { data: pr } = await db.from("projects").select("id, title, job_address, apartment_or_unit, job_owner_id").is("deleted_at", null);
  const list = ((pr ?? []) as { id: number; title: string | null; job_address: Addr; apartment_or_unit: string | null; job_owner_id: number | null }[]).filter((p) => p.title);
  const ownerIds = [...new Set(list.map((p) => p.job_owner_id).filter((x): x is number => x !== null))];
  const owners = new Map<number, { first: string | null; last: string | null }>();
  for (let i = 0; i < ownerIds.length; i += 500) {
    const { data } = await db.from("contacts").select("id, first_name, last_name").in("id", ownerIds.slice(i, i + 500));
    for (const c of (data ?? []) as { id: number; first_name: string | null; last_name: string | null }[]) owners.set(c.id, { first: c.first_name, last: c.last_name });
  }
  CITIES = new Set(list.flatMap((p) => words(p.job_address?.city)));
  return list.map((p) => {
    const owner = p.job_owner_id ? owners.get(p.job_owner_id) : null;
    const street = p.job_address?.street ?? null;
    return {
      id: p.id,
      title: p.title!,
      titleTokens: words(p.title),
      ownerFirst: nameWords(owner?.first),
      ownerLast: nameWords(owner?.last),
      addrTokens: [...new Set([...words(street), ...words(p.job_address?.city)])],
      numbers: [...new Set([...(norm(p.title).match(/\b\d{2,6}\b/g) ?? []), ...(norm(street).match(/^\d{2,6}\b/g) ?? [])])],
      unit: unitOf(p.apartment_or_unit) ?? unitOf(p.title!.match(/#\s*([0-9]{1,5}\s?[A-Za-z]?)\b/)?.[1]),
    };
  });
}

/** Damerau-Levenshtein distance, enough for one typo. */
function distance(a: string, b: string): number {
  const d: number[][] = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array<number>(b.length).fill(0)]);
  for (let j = 0; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
  return d[a.length][b.length];
}

/** Same word, allowing one typo once the words are long enough ("eise" ~ "eisen", "gretta" ~ "greta"; never "pine" ~ "fine"). */
const same = (a: string, b: string) => a === b || (Math.min(a.length, b.length) >= 4 && Math.max(a.length, b.length) >= 5 && distance(a, b) <= 1);
const anyMatch = (xs: string[], ys: string[], exact = false) => xs.some((x) => ys.some((y) => (exact ? x === y : same(x, y))));

type Deep = { sure: Candidate | null; candidates: Candidate[] };

export function deepMatch(folderName: string, projects: ProjectInfo[]): Deep {
  const raw = folderName.replace(/\s[-–]\s*\d{4,6}$/, "").replace(/\([^)]*\)/g, " ").trim();
  const parts = raw.split(/\s[-–]\s/).map((s) => s.trim()).filter(Boolean);
  const head = parts[0] ?? raw;
  const comma = head.match(/^([^,]+),\s*(.+)$/);
  const surnames = nameWords(comma ? comma[1] : head);
  const firsts = comma ? nameWords(comma[2]) : [];
  const placeText = parts.slice(1).join(" ");
  const places = words(placeText).filter((w) => !/^\d+$/.test(w));
  const unit = unitOf(parseClientFolder(folderName).unit);
  const numbers = (norm(placeText).match(/\b\d{2,6}\b/g) ?? []).filter((n) => n !== unit?.replace(/\D/g, ""));
  if (!surnames.length) return { sure: null, candidates: [] };
  // "AVENTURA", "MIAMI BEACH": a city only, which says nothing against a project's street address.
  const cityOnly = places.length > 0 && places.every((w) => CITIES.has(w)) && !unit && !numbers.length;
  const specific = Boolean(unit || numbers.length || (places.length && !cityOnly));

  type Scored = Candidate & { person: boolean; house: boolean; placed: boolean; unitConflict: boolean };
  const scored: Scored[] = [];
  for (const p of projects) {
    const surname = anyMatch(surnames, [...p.ownerLast, ...p.titleTokens]);
    if (!surname) continue;
    const first = firsts.length > 0 && anyMatch(firsts, [...p.ownerFirst, ...p.titleTokens.filter((t) => !GEO.has(t))]);
    const place = places.length > 0 && anyMatch(places, [...p.titleTokens, ...p.addrTokens]);
    const number = numbers.some((n) => p.numbers.includes(n));
    const unitSame = Boolean(unit && p.unit && unit === p.unit);
    const unitConflict = Boolean(unit && p.unit && unit !== p.unit);
    let score = 50 + (first ? 30 : 0) + (place ? 15 : 0) + (number ? 15 : 0) + (unitSame ? 15 : 0) - (unitConflict ? 60 : 0);
    // A surname alone, with nothing else in common, is not a lead ("Cohen").
    if (!first && !place && !number && !unitSame) score -= 25;
    if (score < 50) continue;
    const why = [`surname ${surnames.join(" ")}`, first ? `first name ${firsts.join(" ")}` : null, place ? "place" : null, number ? "street number" : null, unitSame ? `unit ${unit}` : null, unitConflict ? `but unit ${unit} ≠ ${p.unit}` : null].filter(Boolean).join(", ");
    // A house or business name must match the title or the owner's surname exactly, and the place too.
    const house = !firsts.length && anyMatch(surnames, [...p.ownerLast, ...p.titleTokens], true) && (place || number || unitSame);
    scored.push({ id: p.id, title: p.title, score, why, person: surname && first, house, placed: place || number || unitSame, unitConflict });
  }
  scored.sort((a, b) => b.score - a.score);
  const candidates = scored.slice(0, 2).map(({ id, title, score, why }) => ({ id, title, score, why }));
  if (NEVER_SURE.has(folderKey(folderName))) return { sure: null, candidates };
  // Sure: this person is exactly one project, no unit says otherwise, and the folder's place does not
  // point elsewhere (it matches the project, or it is only a city, or there is none).
  const persons = scored.filter((s) => s.person);
  if (firsts.length && persons.length === 1 && !persons[0].unitConflict && (!specific || persons[0].placed || cityOnly)) {
    return { sure: { ...persons[0], why: `the only project of this person (${persons[0].why})` }, candidates };
  }
  // Sure: a house or business name plus its place is exactly one project.
  const houses = scored.filter((s) => s.house);
  if (!firsts.length && houses.length === 1 && !houses[0].unitConflict) return { sure: { ...houses[0], why: `the only project with this name and place (${houses[0].why})` }, candidates };
  return { sure: null, candidates };
}

// ---------------------------------------------------------------- moving

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
async function rewritePaths(db: Db, from: string, to: string) {
  for (const [table, col] of [["attachments", "provider_folder"], ["record_pdfs", "folder"]] as const) {
    const { data } = await db.from(table).select(`id, ${col}`).like(col, `${from}%`);
    for (const r of (data ?? []) as unknown as ({ id: string | number } & Record<string, string>)[]) {
      if (r[col] === from || r[col].startsWith(`${from}/`)) await db.from(table).update({ [col]: to + r[col].slice(from.length) }).eq("id", r.id);
    }
  }
  await db.from("onedrive_folders").delete().like("path", `${from}%`);
}

// ---------------------------------------------------------------- the sheet

const COLS = [
  { header: "Designer / GC folder", key: "gc", width: 34 },
  { header: "Client folder", key: "folder", width: 48 },
  { header: "Report files", key: "files", width: 12 },
  { header: "Project", key: "project", width: 48 },
  { header: "Project #", key: "projectId", width: 10 },
  { header: "Destination", key: "dest", width: 70 },
  { header: "Why", key: "reason", width: 80 },
  { header: "Status", key: "status", width: 14 },
];

async function writeSheet(plan: Plan[], log: Move[], failed: string[]) {
  const wb = new ExcelJS.Workbook();
  const moved = new Set(log.map((m) => m.itemId));
  const status = (p: Plan) => (moved.has(p.itemId) ? "moved" : failed.some((f) => f.startsWith(`${OLD_ROOT}/${p.gc}/${p.folder}:`)) ? "failed" : p.dest ? "to move" : "stays");
  const sheet = (name: string, rows: Plan[]) => {
    const ws = wb.addWorksheet(name);
    ws.columns = COLS;
    ws.getRow(1).font = { bold: true };
    for (const p of rows) ws.addRow({ ...p, status: status(p) });
  };
  sheet("Moved", plan.filter((p) => p.dest));

  const ws = wb.addWorksheet("Review");
  ws.columns = [
    { header: "Designer / GC folder", key: "gc", width: 34 },
    { header: "Client folder", key: "folder", width: 48 },
    { header: "Report files", key: "files", width: 12 },
    { header: "Likeliest project 1", key: "c1", width: 48 },
    { header: "#1", key: "id1", width: 8 },
    { header: "Why 1", key: "why1", width: 50 },
    { header: "Likeliest project 2", key: "c2", width: 48 },
    { header: "#2", key: "id2", width: 8 },
    { header: "Why 2", key: "why2", width: 50 },
    { header: "YOUR DECISION (1, 2, a project #, or Skip)", key: "decision", width: 40 },
    { header: "Folder id (leave)", key: "itemId", width: 44 },
  ];
  ws.getRow(1).font = { bold: true };
  for (const p of plan.filter((p) => !p.dest && p.candidates.length)) {
    const [a, b] = p.candidates;
    ws.addRow({ gc: p.gc, folder: p.folder, files: p.files, c1: a?.title ?? "", id1: a?.id ?? "", why1: a?.why ?? "", c2: b?.title ?? "", id2: b?.id ?? "", why2: b?.why ?? "", decision: "", itemId: p.itemId });
  }
  sheet("Stays (move by hand)", plan.filter((p) => !p.dest && !p.candidates.length));
  await wb.xlsx.writeFile(SHEET);
}

/** Fred's answers in the Review sheet: folder id → project id or "skip". */
async function readAnswers(): Promise<Map<string, number | "skip">> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(SHEET);
  const ws = wb.getWorksheet("Review");
  const out = new Map<string, number | "skip">();
  if (!ws) return out;
  const cell = (row: ExcelJS.Row, n: number) => String(row.getCell(n).value ?? "").trim();
  ws.eachRow((row, i) => {
    if (i === 1) return;
    const decision = cell(row, 10).toLowerCase();
    const itemId = cell(row, 11);
    if (!decision || !itemId) return;
    if (decision === "skip" || decision === "no" || decision === "n") out.set(itemId, "skip");
    else if (decision === "1" && cell(row, 5)) out.set(itemId, Number(cell(row, 5)));
    else if (decision === "2" && cell(row, 8)) out.set(itemId, Number(cell(row, 8)));
    else if (/^\d+$/.test(decision)) out.set(itemId, Number(decision));
  });
  console.log(`${out.size} answers read from the sheet.`);
  return out;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
