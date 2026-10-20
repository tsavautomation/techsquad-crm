/**
 * Fill the Report archive decisions sheet (F16-d) for the folders still without a project, using
 * what the CRM already knows: the projects (deep name match, as scripts/move-projects-ts.ts),
 * the folders already decided on Admin › Report archive, the PROJECTS TS → project moves (OD-f/g),
 * and the Google Calendar events synced into calendar_events (title "Tech - Client - Place" + location).
 *
 *   npx tsx --env-file=.env.local scripts/fill-archive-folders.ts [--sheet <Fred's answers.xlsx>]
 *
 * Writes docs/report-archive-folders-filled.xlsx: Fred's own answers are kept; the rest get a
 * proposed decision (Project 1 / Project 2 / Other + name / New) with the evidence beside it.
 * Nothing is written to the database.
 */
import ExcelJS from "exceljs";
import { createClient } from "@supabase/supabase-js";

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false } });
const args = process.argv.slice(2);
const SHEET_IN = args.includes("--sheet") ? args[args.indexOf("--sheet") + 1] : null;
const OUT = "docs/report-archive-folders-filled.xlsx";

type Pageable = { range(from: number, to: number): PromiseLike<{ data: unknown; error: { message: string } | null }> };
async function all<T>(q: () => Pageable): Promise<T[]> {
  const out: T[] = [];
  for (let f = 0; ; f += 1000) {
    const { data, error } = await q().range(f, f + 999);
    if (error) throw new Error(error.message);
    out.push(...((data ?? []) as T[]));
    if ((data as unknown[]).length < 1000) return out;
  }
}
const norm = (s: unknown) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const key = (s: string) => s.trim().toUpperCase().replace(/\s+/g, " ");
const STOP = new Set("the and of e y de da do dos das mr mrs ms dr res residence residencia project proj house home apt apartment unit suite ste ph old new fl florida usa ave av st street dr drive rd road blvd ct ln way n s w ne nw se sw tower towers condo condominium bldg building office inc llc".split(" "));
const GEO = new Set("beach miami north south east west bay island islands isle isles key keys park lake ocean grove point harbour harbor palm coral gables boca raton aventura hollywood brickell pinecrest surfside shores springs sunny delray pompano weston parkland jupiter york nassau estates estate club tower towers village city county river creek".split(" "));
const words = (s: unknown) => norm(s).split(" ").filter((w) => w && !STOP.has(w));
const nameWords = (s: unknown) => words(s).filter((w) => !GEO.has(w) && !/^\d+$/.test(w));
function distance(a: string, b: string): number {
  const d: number[][] = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array<number>(b.length).fill(0)]);
  for (let j = 0; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}
// One typo allowed only in longer names ("maria" is not "marina").
const same = (a: string, b: string) => a === b || (Math.min(a.length, b.length) >= 6 && distance(a, b) <= 1);
const anyMatch = (xs: string[], ys: string[], exact = false) => xs.some((x) => ys.some((y) => (exact ? x === y : same(x, y))));

type Project = { id: number; title: string; titleTokens: string[]; ownerFirst: string[]; ownerLast: string[]; addrTokens: string[]; unit: string | null };
const unitOf = (s: unknown) => (s ? norm(s).replace(/\b(apt|unit|suite|ste|ph)\b/g, " ").replace(/\s+/g, "").toUpperCase() || null : null);

function parseFolder(name: string) {
  const raw = name.replace(/\s[-–]\s*\d{4,6}$/, "").replace(/\([^)]*\)/g, " ").trim();
  const parts = raw.split(/\s[-–]\s/).map((s) => s.trim()).filter(Boolean);
  const head = parts[0] ?? raw;
  const comma = head.match(/^([^,]+),\s*(.+)$/);
  const surnames = nameWords(comma ? comma[1] : head);
  const firsts = comma ? nameWords(comma[2]) : [];
  const placeText = parts.slice(1).join(" ");
  const places = words(placeText).filter((w) => !/^\d+$/.test(w));
  const unit = unitOf((placeText + " " + head).match(/#\s*([0-9]{1,5}\s?[A-Za-z]?)\b/)?.[1]);
  return { surnames, firsts, places, unit, head, placeText };
}

function crmMatch(folder: string, projects: Project[], cities: Set<string>) {
  const f = parseFolder(folder);
  if (!f.surnames.length) return { sure: null as Project | null, why: "", candidates: [] as { p: Project; score: number }[] };
  const cityOnly = f.places.length > 0 && f.places.every((w) => cities.has(w)) && !f.unit;
  const scored = projects
    .map((p) => {
      const surname = anyMatch(f.surnames, [...p.ownerLast, ...p.titleTokens]);
      if (!surname) return null;
      const first = f.firsts.length > 0 && anyMatch(f.firsts, [...p.ownerFirst, ...p.titleTokens.filter((t) => !GEO.has(t))]);
      const place = f.places.length > 0 && anyMatch(f.places, [...p.titleTokens, ...p.addrTokens]);
      const unitSame = Boolean(f.unit && p.unit && f.unit === p.unit);
      const unitConflict = Boolean(f.unit && p.unit && f.unit !== p.unit);
      let score = 50 + (first ? 30 : 0) + (place ? 15 : 0) + (unitSame ? 15 : 0) - (unitConflict ? 60 : 0);
      if (!first && !place && !unitSame) score -= 25;
      if (score < 50) return null;
      const house = !f.firsts.length && anyMatch(f.surnames, [...p.ownerLast, ...p.titleTokens], true) && (place || unitSame);
      return { p, score, person: surname && first, house, placed: place || unitSame, unitConflict };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null)
    .sort((a, b) => b.score - a.score);
  const persons = scored.filter((s) => s.person);
  if (f.firsts.length && persons.length === 1 && !persons[0].unitConflict && (!f.places.length || persons[0].placed || cityOnly)) return { sure: persons[0].p, why: "same person, only project", candidates: scored.slice(0, 2) };
  const houses = scored.filter((s) => s.house);
  if (!f.firsts.length && houses.length === 1 && !houses[0].unitConflict) return { sure: houses[0].p, why: "same name and place, only project", candidates: scored.slice(0, 2) };
  return { sure: null, why: "", candidates: scored.slice(0, 2) };
}

type Ev = { summary: string; location: string | null; starts_at: string };
function calendarMatch(folder: string, events: Ev[]) {
  const f = parseFolder(folder);
  const hits = events.filter((e) => {
    // "Tech - Client - Place": the client is what sits after the technician.
    const parts = e.summary.split(/\s[-–]\s/);
    const text = parts.length > 1 ? parts.slice(1).join(" ") : e.summary;
    if (/^time |schedule/i.test(e.summary)) return false; // "Time Miami - Schedule - …" placeholders
    const t = words(text);
    if (!anyMatch(f.surnames, t)) return false;
    if (f.firsts.length && !anyMatch(f.firsts, t)) return false;
    return true;
  });
  // When the folder names a place or unit, the events that name it too decide the address.
  const placed = hits.filter((e) => (f.places.length && anyMatch(f.places, words(e.summary + " " + (e.location ?? "")))) || (f.unit && (e.summary + " " + (e.location ?? "")).replace(/[^A-Za-z0-9]/g, "").toUpperCase().includes(f.unit)));
  const pool = placed.length ? placed : hits;
  const locs = new Map<string, number>();
  const techs = new Map<string, number>();
  for (const e of pool) {
    if (e.location) locs.set(e.location.trim(), (locs.get(e.location.trim()) ?? 0) + 1);
    const tech = e.summary.split(/\s[-–]\s/)[0]?.trim();
    if (tech && tech.length < 25) techs.set(tech, (techs.get(tech) ?? 0) + 1);
  }
  const dates = hits.map((e) => e.starts_at.slice(0, 10)).sort();
  return { events: hits.length, address: [...locs.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null, addresses: locs.size, first: dates[0] ?? null, last: dates.at(-1) ?? null, techs: [...techs.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([t]) => t).join(", "), sample: hits.slice(0, 2).map((e) => e.summary).join(" | ") };
}

async function main() {
  // Fred's answers so far.
  const answers = new Map<string, { decision: string; other: string }>();
  if (SHEET_IN) {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(SHEET_IN);
    wb.worksheets[0].eachRow((r, i) => {
      if (i <= 2) return;
      const v = (n: number) => { const x = r.getCell(n).value as unknown; return x == null ? "" : typeof x === "object" ? String((x as { result?: unknown; text?: unknown }).result ?? (x as { text?: unknown }).text ?? "") : String(x); };
      if (v(10).trim() && !/^your decision$/i.test(v(10))) answers.set(key(v(1)), { decision: v(10).trim(), other: v(11).trim() });
    });
  }
  // Open folders = unmatched files minus the page's decisions minus the OneDrive move.
  type RF = { gc_folder: string; client_folder: string; candidates: { id: number; title: string; score: number }[] | null; parsed: { name: { date: string | null; technicians: string[]; job: string | null } } };
  const files = await all<RF>(() => db.from("report_files").select("gc_folder, client_folder, candidates, parsed").eq("status", "unmatched").order("id"));
  type Folder = { folder: string; gc: string; files: number; first: string; last: string; techs: Map<string, number>; cands: { id: number; title: string; score: number }[] };
  const folders = new Map<string, Folder>();
  for (const r of files) {
    const f = folders.get(r.client_folder) ?? { folder: r.client_folder, gc: r.gc_folder, files: 0, first: "9999", last: "0000", techs: new Map(), cands: [] };
    f.files++;
    const d = r.parsed?.name?.date;
    if (d) { if (d < f.first) f.first = d; if (d > f.last) f.last = d; }
    for (const t of r.parsed?.name?.technicians ?? []) f.techs.set(t, (f.techs.get(t) ?? 0) + 1);
    if ((r.candidates?.[0]?.score ?? 0) > (f.cands[0]?.score ?? 0)) f.cands = r.candidates ?? [];
    folders.set(r.client_folder, f);
  }
  const { data: dec } = await db.from("app_integrations").select("data").eq("key", "report_archive_folders").maybeSingle();
  const decided = new Set(((dec as { data: { folders: { folder: string }[] } } | null)?.data?.folders ?? []).map((x) => key(x.folder)));
  const { data: mv } = await db.from("app_integrations").select("data").eq("key", "projects_ts_moves").maybeSingle();
  const moved = new Map<string, number>();
  for (const m of ((mv as { data: { moves: { from: string; to: string }[] } } | null)?.data?.moves ?? [])) {
    const id = m.to.match(/\((\d+)\)\//)?.[1];
    if (id) moved.set(key(m.from.split("/").pop()!), Number(id));
  }
  // Projects, for the deep match.
  type P = { id: number; title: string | null; job_address: { street?: string; city?: string } | null; apartment_or_unit: string | null; job_owner_id: number | null };
  const pr = (await all<P>(() => db.from("projects").select("id, title, job_address, apartment_or_unit, job_owner_id").is("deleted_at", null))).filter((p) => p.title);
  const owners = new Map<number, { first: string | null; last: string | null }>();
  const ids = [...new Set(pr.map((p) => p.job_owner_id).filter((x): x is number => x !== null))];
  for (let i = 0; i < ids.length; i += 500) {
    const { data } = await db.from("contacts").select("id, first_name, last_name").in("id", ids.slice(i, i + 500));
    for (const c of (data ?? []) as { id: number; first_name: string | null; last_name: string | null }[]) owners.set(c.id, { first: c.first_name, last: c.last_name });
  }
  const cities = new Set(pr.flatMap((p) => words(p.job_address?.city)));
  const projects: Project[] = pr.map((p) => {
    const o = p.job_owner_id ? owners.get(p.job_owner_id) : null;
    return { id: p.id, title: p.title!, titleTokens: words(p.title), ownerFirst: nameWords(o?.first), ownerLast: nameWords(o?.last), addrTokens: [...new Set([...words(p.job_address?.street), ...words(p.job_address?.city)])], unit: unitOf(p.apartment_or_unit) ?? unitOf(p.title!.match(/#\s*([0-9]{1,5}\s?[A-Za-z]?)\b/)?.[1]) };
  });
  const byId = new Map(projects.map((p) => [p.id, p]));
  // Calendar events (the company calendar, synced).
  const events = (await all<Ev>(() => db.from("calendar_events").select("summary, location, starts_at").not("summary", "is", null).order("starts_at"))).filter((e) => e.summary);
  console.log(`${folders.size} folders with unmatched files, ${decided.size} decided on the page, ${moved.size} folders moved in OneDrive, ${projects.length} projects, ${events.length} calendar events, ${answers.size} answers from Fred's sheet.`);

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Folders");
  ws.columns = [
    { header: "Folder in OneDrive", key: "folder", width: 44 },
    { header: "Designer / GC folder", key: "gc", width: 28 },
    { header: "Files", key: "files", width: 7 },
    { header: "From", key: "first", width: 11 },
    { header: "To", key: "last", width: 11 },
    { header: "Technicians (files)", key: "techs", width: 26 },
    { header: "Likeliest project 1 (score)", key: "c1", width: 40 },
    { header: "Likeliest project 2 (score)", key: "c2", width: 40 },
    { header: "YOUR DECISION", key: "decision", width: 14 },
    { header: "Project name, if Other", key: "other", width: 44 },
    { header: "Proposed by", key: "why", width: 34 },
    { header: "Calendar events", key: "events", width: 9 },
    { header: "Calendar address (most used)", key: "address", width: 46 },
    { header: "Calendar first", key: "cfirst", width: 11 },
    { header: "Calendar last", key: "clast", width: 11 },
    { header: "Calendar technicians", key: "ctechs", width: 26 },
    { header: "Calendar example", key: "sample", width: 50 },
  ];
  ws.getRow(1).font = { bold: true };
  const counts: Record<string, number> = {};
  for (const f of [...folders.values()].sort((a, b) => b.files - a.files)) {
    const k = key(f.folder);
    if (decided.has(k)) continue;
    const row: Record<string, unknown> = { folder: f.folder, gc: f.gc, files: f.files, first: f.first === "9999" ? "" : f.first, last: f.last === "0000" ? "" : f.last, techs: [...f.techs.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([t]) => t).join(", "), c1: f.cands[0] ? `${f.cands[0].title} (${f.cands[0].score})` : "", c2: f.cands[1] ? `${f.cands[1].title} (${f.cands[1].score})` : "" };
    const cal = calendarMatch(f.folder, events);
    Object.assign(row, { events: cal.events || "", address: cal.address ?? "", cfirst: cal.first ?? "", clast: cal.last ?? "", ctechs: cal.techs, sample: cal.sample });
    const fred = answers.get(k);
    if (fred) Object.assign(row, { decision: fred.decision, other: fred.other, why: "your answer (sheet)" });
    else if (moved.has(k) && byId.has(moved.get(k)!)) Object.assign(row, { decision: "Other", other: byId.get(moved.get(k)!)!.title, why: "folder already moved into this project in OneDrive" });
    else {
      const m = crmMatch(f.folder, projects, cities);
      if (m.sure) {
        const n = f.cands.findIndex((c) => c.id === m.sure!.id);
        Object.assign(row, { decision: n === 0 ? "Project 1" : n === 1 ? "Project 2" : "Other", other: n >= 0 ? "" : m.sure.title, why: `CRM: ${m.why}` });
      } else if (cal.events) Object.assign(row, { decision: "New", why: cal.address ? (cal.addresses > 1 ? "calendar: address found (" + cal.addresses + " different addresses, check)" : "calendar: address found") : "calendar: events, no address" });
      else Object.assign(row, { decision: "", why: m.candidates.length ? `maybe: ${m.candidates.map((c) => c.p.title).join(" | ")}` : "nothing found" });
    }
    counts[String(row.why).split(":")[0]] = (counts[String(row.why).split(":")[0]] ?? 0) + 1;
    const r = ws.addRow(row);
    r.getCell("decision").fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFF2B3" } };
  }
  await wb.xlsx.writeFile(OUT);
  console.log(`-> ${OUT}: ${ws.rowCount - 1} rows`, counts);
}
main().catch((e) => { console.error(e); process.exit(1); });
