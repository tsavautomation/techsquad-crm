/**
 * Apply the Report archive decisions sheet (F16-d): every row whose YOUR DECISION is "New" or "Other".
 *   Other  → the folder is decided to the named existing project.
 *   New    → a project named after the folder ("Belkin, Edward - Oceana #2302N"), owned by the Portal
 *            client (found by e-mail or name, else created as an End Customer with e-mail and phone),
 *            at the sheet's address (column M); then the folder is decided to it. Folders that differ
 *            only by the trailing "- 00214" number share one project.
 * Decisions go to app_integrations key "report_archive_folders", like Admin › Report archive. With
 * --import the archive import then re-runs so the folders' reports land in their projects.
 *
 *   npx tsx --conditions=react-server --env-file=.env.local scripts/apply-archive-folders.ts            # dry run
 *   npx tsx --conditions=react-server --env-file=.env.local scripts/apply-archive-folders.ts --apply [--import]
 */
import ExcelJS from "exceljs";
import { folderKey } from "@/lib/archive/match";
import { parseClientFolder } from "@/lib/archive/parse";
import { loadDecisions, loadState, runArchive, saveDecisions, startImport, type FolderDecision } from "@/lib/archive/sync";
import { adminDb } from "@/lib/supabase/admin";

const SHEET = process.argv.find((a) => a.endsWith(".xlsx")) ?? "docs/report-archive-folders-filled.xlsx";
const APPLY = process.argv.includes("--apply");
const IMPORT = process.argv.includes("--import");

type Row = { folder: string; decision: string; other: string; why: string; name: string; email: string; phone: string; address: string };
const cell = (r: ExcelJS.Row, n: number) => { const x = r.getCell(n).value as unknown; return (x == null ? "" : typeof x === "object" ? String((x as { result?: unknown; text?: unknown }).result ?? (x as { text?: unknown }).text ?? "") : String(x)).trim(); };
const titleCase = (s: string) => s.toLowerCase().replace(/(^|[\s,/(#-]|\d)([a-z])/g, (m, a: string, b: string) => a + b.toUpperCase());
const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/** "xxxxxALMEIDA, DAVID - … -" → "ALMEIDA, DAVID - …": crossed-out prefixes and a dangling dash dropped. */
const cleanFolder = (folder: string) => folder.replace(/\s+/g, " ").trim().replace(/^x{2,}(?=[A-Z])/i, "").replace(/\s[-–]\s*$/, "").replace(/\s[-–]\s*(\d{4,6})\s[-–]\s*$/, " - $1").trim();
/** Project title the way Admin › Report archive names it: folder head (without "- 00214") + place; unit letters stay capitals. */
function projectTitle(folder: string) {
  const f = cleanFolder(folder);
  const p = parseClientFolder(f);
  const head = titleCase(f.replace(/\s[-–]\s*\d{4,6}$/, "").split(/\s[-–]\s/)[0] ?? f);
  return (p.place ? `${head} - ${p.place}` : head).replace(/(\d)([a-z])\b/g, (m, a: string, c: string) => a + c.toUpperCase());
}

/** "17901 Collins Ave #1502N, Sunny Isles Beach, FL 33160, USA" → street / city / zip / unit (several towers stay in the street). */
function parseAddress(s: string) {
  let a = s.trim();
  let unit: string | null = null;
  const u = a.match(/\s#\s*([0-9]{1,5}\s?[A-Za-z]?)\s*$/) ?? a.match(/#\s*([0-9]{1,5}\s?[A-Za-z]?)\b/);
  if (u) { unit = u[1].replace(/\s+/g, "").toUpperCase(); a = a.replace(u[0], " ").replace(/\s+/g, " ").trim(); }
  a = a.replace(/,?\s*(USA|United States)\s*,?\s*$/i, "").replace(/,\s*,/g, ",").trim();
  let parts = a.split(",").map((x) => x.trim()).filter(Boolean);
  // "Monad Terrace, 1300 Monad Terrace, Miami Beach": the building name before the street is dropped.
  if (parts.length > 1 && !/\d/.test(parts[0]) && /^\d/.test(parts[1])) parts = parts.slice(1);
  const street = parts[0] ?? "";
  const tail = parts.slice(1).join(", ");
  const zip = tail.match(/\b(\d{5})(?:-\d{4})?\b(?!.*\b\d{5}\b)/)?.[1] ?? "";
  const rest = parts.slice(1).map((p) => p.replace(/\b(FL|Florida)\b\.?/i, "").replace(/\b\d{5}(-\d{4})?\b/, "").trim()).filter(Boolean);
  // A bare number after the street is the unit (Portal: "16901 Collins Avenue, 2103, Sunny Isles Beach").
  const unitSeg = rest.find((p) => /^(apt|unit|suite|ste|ph)?\.?\s*#?\s*\d{1,5}\s?[A-Za-z]?$/i.test(p));
  if (unitSeg && !unit) unit = unitSeg.replace(/^(apt|unit|suite|ste|ph)?\.?\s*#?\s*/i, "").replace(/\s+/g, "").toUpperCase();
  const city = rest.filter((p) => p !== unitSeg).pop() ?? "";
  return { street, city, zip, unit };
}

function splitName(name: string) {
  const clean = name.replace(/\s+/g, " ").trim();
  if (clean.includes(",")) { const [l, f] = clean.split(",").map((x) => x.trim()); return { first: f || null, last: l || null }; }
  const w = clean.split(" ");
  return w.length > 1 ? { first: w.slice(0, -1).join(" "), last: w[w.length - 1] } : { first: clean, last: null };
}

async function main() {
  const db = adminDb();
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(SHEET);
  const rows: Row[] = [];
  wb.worksheets[0].eachRow((r, i) => {
    if (i === 1) return;
    rows.push({ folder: cell(r, 1), decision: cell(r, 7), other: cell(r, 8), why: cell(r, 9), name: cell(r, 10), email: cell(r, 11), phone: cell(r, 12), address: cell(r, 13) });
  });
  const news = rows.filter((r) => /^new$/i.test(r.decision));
  const others = rows.filter((r) => /^other$/i.test(r.decision));
  console.log(`${rows.length} rows: ${news.length} New, ${others.length} Other, ${rows.length - news.length - others.length} left blank.`);

  type P = { id: number; title: string | null };
  const projects: P[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db.from("projects").select("id, title").is("deleted_at", null).range(from, from + 999);
    if (error) throw new Error(error.message);
    projects.push(...(data as P[]));
    if (data.length < 1000) break;
  }
  const byTitle = new Map(projects.filter((p) => p.title).map((p) => [norm(p.title!), p]));
  const decisions = new Map<string, FolderDecision>((await loadDecisions()).map((d) => [folderKey(d.folder), d]));
  const decide = (folder: string, projectId: number) => decisions.set(folderKey(folder), { folder: folder.replace(/\s+/g, " ").trim(), projectId });

  // Other → existing project by title.
  let missing = 0;
  for (const r of others) {
    const p = byTitle.get(norm(r.other));
    if (!p) { console.log(`  ! Other "${r.folder}": no project titled "${r.other}"`); missing++; continue; }
    decide(r.folder, p.id);
    console.log(`  = ${r.folder} -> ${p.title} (#${p.id})`);
  }

  // New → one project per title.
  const groups = new Map<string, Row[]>();
  for (const r of news) { const t = projectTitle(r.folder); groups.set(t, [...(groups.get(t) ?? []), r]); }
  console.log(`${groups.size} projects to create or reuse for ${news.length} folders.`);
  let created = 0, reused = 0, contactsMade = 0;
  for (const [title, rs] of groups) {
    const r = rs.find((x) => x.address) ?? rs[0];
    const existing = byTitle.get(norm(title));
    const addr = r.address ? parseAddress(r.address) : null;
    const pf = parseClientFolder(cleanFolder(r.folder));
    const unit = pf.unit ?? addr?.unit ?? null;
    // The Portal customer is the owner only when it is the end client (shares a name with the folder);
    // a designer or GC billed for the job (Navicon for Eskenazi) becomes a note on the project instead.
    const surname = norm(pf.client).split(" ").filter((w) => w.length >= 3);
    const portalIsClient = Boolean(r.name) && surname.some((w) => norm(r.name).split(" ").includes(w));
    const who = portalIsClient ? r.name : pf.client;
    const note = !portalIsClient && r.name ? `Portal.io customer for this job: ${r.name}${r.email ? ", " + r.email : ""}${r.phone ? ", " + r.phone : ""}` : null;
    const { first, last } = splitName(who);
    const line = `${title}  | owner ${who}${portalIsClient && r.email ? " <" + r.email + ">" : ""}${portalIsClient && r.phone ? " " + r.phone : ""}${note ? " | NOTE " + note : ""} | ${addr ? `${addr.street}, ${addr.city} ${addr.zip}` : "(no address)"}${unit ? " #" + unit : ""} | ${rs.length} folder${rs.length > 1 ? "s" : ""}`;
    if (existing) { console.log(`  = reuse #${existing.id} ${line}`); reused++; for (const x of rs) decide(x.folder, existing.id); continue; }
    console.log(`  + ${line}`);
    if (!APPLY) continue;
    // Owner contact: by e-mail, then by name; else created.
    let ownerId: number | null = null;
    if (portalIsClient && r.email) {
      const { data } = await db.from("contacts").select("id").is("deleted_at", null).ilike("email", r.email).limit(1).maybeSingle();
      ownerId = (data as { id: number } | null)?.id ?? null;
    }
    if (!ownerId) {
      const { data } = await db.from("contacts").select("id").is("deleted_at", null).ilike("title", `${first ?? ""} ${last ?? ""}`.trim()).limit(1).maybeSingle();
      ownerId = (data as { id: number } | null)?.id ?? null;
    }
    if (!ownerId) {
      const { data, error } = await db.from("contacts").insert({ type: "End Customer", first_name: first, last_name: last, title: `${first ?? ""} ${last ?? ""}`.trim(), email: portalIsClient && r.email ? r.email : null, main_phone: portalIsClient && r.phone ? r.phone : null }).select("id").single();
      if (error) throw new Error(`contact ${who}: ${error.message}`);
      ownerId = (data as { id: number }).id;
      contactsMade++;
    }
    const { data, error } = await db.from("projects").insert({
      title, type: "Residential", category: "Low Voltage", job_owner_id: ownerId,
      job_address: { street: addr?.street ?? (pf.place ?? pf.client), address_2: "", city: addr?.city ?? "", state: "FL", zip: addr?.zip ?? "" },
      apartment_or_unit: unit,
    }).select("id, title").single();
    if (error) throw new Error(`project ${title}: ${error.message}`);
    const p = data as P;
    byTitle.set(norm(title), p);
    created++;
    if (note) { const { error: ne } = await db.from("record_notes").insert({ table_name: "projects", record_id: p.id, body: note }); if (ne) console.log(`  ! note on #${p.id}: ${ne.message}`); }
    for (const x of rs) decide(x.folder, p.id);
  }
  console.log(`\n${APPLY ? "Created" : "Would create"} ${APPLY ? created : groups.size - reused} projects (${contactsMade} new contacts), reused ${reused}; ${missing} Other rows without a project.`);
  if (!APPLY) { console.log("Dry run: nothing written. Add --apply."); return; }
  await saveDecisions([...decisions.values()].sort((x, y) => x.folder.localeCompare(y.folder)));
  console.log(`Saved ${decisions.size} folder decisions.`);
  if (!IMPORT) return;
  const s = await loadState();
  if (!s || s.phase === "idle" || s.phase === "scanning") { console.log("No scan to import from; run the scan on Admin › Report archive first."); return; }
  await startImport(false);
  for (;;) {
    const out = await runArchive(50_000);
    const st = await loadState();
    console.log(`import: ${out}  imported ${st?.counts.imported} skipped ${st?.counts.skipped} unmatched ${st?.counts.unmatched} errors ${st?.counts.errors}`);
    if (out !== "paused" && out !== "busy") break;
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
