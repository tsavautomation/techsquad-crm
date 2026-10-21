/**
 * Perfect-match pass for the PROJECTS TS folders still without a project (Fred 2026-10-20: "merge
 * all the ones you are sure about by a perfect match", after "2687 FLAMINGO DR" ↔ project
 * "2687 Flamingo (1047)"). These folders carry no client name, only an address or a building and
 * unit, so the name rules of scripts/move-projects-ts.ts never reach them. A folder is decided when
 * exactly one project matches:
 *   A. street number + street name of the folder ("2687 FLAMINGO DR") equal the project's job
 *      address or title ("2687 Flamingo", "2687 Flamingo Drive"), and the units agree when both have one;
 *   B. the folder names a known building and a unit ("ACQUALINA #1704") and the project's address is
 *      in that building (any of its towers) with the same unit.
 * Decisions go to Admin › Report archive (app_integrations "report_archive_folders"), then
 * scripts/move-projects-ts.ts --apply moves the folders. Nothing is written without --apply.
 *
 *   npx tsx --conditions=react-server --env-file=.env.local scripts/merge-projects-ts.ts [--apply]
 */
import { folderKey } from "@/lib/archive/match";
import { loadDecisions, saveDecisions } from "@/lib/archive/sync";
import { listChildren } from "@/lib/files/onedrive";
import { adminDb } from "@/lib/supabase/admin";
import { BUILDINGS } from "./lib/buildings";

const ROOT = "PROJECTS TS";
const APPLY = process.argv.includes("--apply");
const norm = (s: unknown) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const STREET_WORDS = new Set("ave avenue av st street dr drive rd road blvd boulevard ct court ln lane way ter terrace pl place cir circle hwy highway trail tr n s e w ne nw se sw north south east west".split(" "));
const unitOf = (s: string | null | undefined) => { const m = (s ?? "").match(/#\s*([0-9]{1,5}\s?[A-Za-z]?)\b/) ?? (s ?? "").match(/\b(?:apt|unit|ph|suite|ste)\.?\s*#?\s*([0-9]{1,5}[A-Za-z]?)\b/i) ?? (s ?? "").match(/^\s*([0-9]{1,5}[A-Za-z]?)\s*$/); return m ? m[1].replace(/\s+/g, "").toUpperCase() : null; };
const sameUnit = (a: string | null, b: string | null) => Boolean(a && b) && (a === b || (!(/[A-Z]$/.test(a!) && /[A-Z]$/.test(b!)) && a!.replace(/[A-Z]$/, "") === b!.replace(/[A-Z]$/, "")));

/** "2687 FLAMINGO DR" → { number: "2687", street: "flamingo" }: the number and the first word that is not a street-type word. */
function addressOf(text: string) {
  const w = norm(text.replace(/#\s*[0-9]{1,5}\s?[A-Za-z]?\b/g, " ")).split(" ").filter(Boolean);
  const i = w.findIndex((x, k) => /^\d{2,6}$/.test(x) && k + 1 < w.length && !/^\d+$/.test(w[k + 1]));
  if (i < 0) return null;
  const street = w.slice(i + 1).find((x) => !STREET_WORDS.has(x) && !/^\d+$/.test(x));
  const type = w.slice(i + 1).find((x) => TYPE_WORDS.has(x)) ?? null;
  return street ? { number: w[i], street, type: type ? (TYPE_ALIAS[type] ?? type) : null } : null;
}
const TYPE_ALIAS: Record<string, string> = { ave: "avenue", av: "avenue", st: "street", dr: "drive", rd: "road", blvd: "boulevard", ct: "court", ln: "lane", ter: "terrace", pl: "place", cir: "circle", hwy: "highway" };
const TYPE_WORDS = new Set([...Object.keys(TYPE_ALIAS), ...Object.values(TYPE_ALIAS), "way", "trail"]);
/** "Lake Dr" is not "Lake Ave": street types must agree when both are written. */
const sameType = (a: string | null, b: string | null) => !a || !b || a === b;
/** The person a folder or title names ("CUMMINGS, BOBBY - 811 SOLAR", "Wenzel, Todd - 811 Solar Isle"): the head's words when it holds no digits. */
const personWords = (text: string) => { const head = text.split(/\s[-–]\s/)[0] ?? ""; return /\d/.test(head) ? null : norm(head).split(" ").filter((x) => x.length >= 4 && !["residence", "project", "house", "group", "residencia"].includes(x)); };
const dist = (a: string, b: string) => { const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array<number>(b.length).fill(0)]); for (let j = 0; j <= b.length; j++) d[0][j] = j; for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); return d[a.length][b.length]; };
/** Two named heads must share a surname-length word, two typos allowed ("Mustafa, Faye" ≈ "Moustapha, Feye"; "Cummings" ≠ "Wenzel"). Address-only heads pass. */
const peopleAgree = (folder: string, title: string) => { const f = personWords(folder), t = personWords(title); if (!f || !t || !f.length || !t.length) return true; return f.some((x) => t.some((y) => x === y || (Math.min(x.length, y.length) >= 5 && dist(x, y) <= 2))); };
function buildingOf(text: string) {
  const t = norm(text);
  return BUILDINGS.find((b) => b.names.some((n) => new RegExp(`(^|\\s)${norm(n).replace(/\s+/g, "\\s+")}(\\s|$)`).test(t))) ?? null;
}

type P = { id: number; title: string; street: string; city: string; unit: string | null };

async function main() {
  const db = adminDb();
  type Row = { id: number; title: string | null; job_address: { street?: string; city?: string } | null; apartment_or_unit: string | null };
  const projects: P[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db.from("projects").select("id, title, job_address, apartment_or_unit").is("deleted_at", null).range(from, from + 999);
    if (error) throw new Error(error.message);
    for (const p of (data ?? []) as Row[]) if (p.title) projects.push({ id: p.id, title: p.title, street: p.job_address?.street ?? "", city: p.job_address?.city ?? "", unit: unitOf(p.apartment_or_unit) ?? unitOf(p.title) });
    if ((data ?? []).length < 1000) break;
  }
  const decided = new Set((await loadDecisions()).map((d) => folderKey(d.folder)));
  const gcs = (await listChildren(ROOT)).filter((c) => c.folder);
  const found: { gc: string; folder: string; project: P; why: string }[] = [];
  const maybe: string[] = [];
  let open = 0;
  for (const gc of gcs) {
    const clients = (await listChildren(`${ROOT}/${gc.name}`)).filter((c) => c.folder);
    for (const c of clients) {
      if (decided.has(folderKey(c.name))) continue;
      open++;
      const fUnit = unitOf(c.name);
      // A. street number + street name
      const addr = addressOf(c.name);
      let hits: { p: P; why: string }[] = [];
      if (addr) {
        hits = projects.filter((p) => {
          const pa = addressOf(p.street) ?? addressOf(p.title);
          return pa && pa.number === addr.number && pa.street === addr.street && sameType(pa.type, addr.type) && (!fUnit || !p.unit || sameUnit(fUnit, p.unit)) && peopleAgree(c.name, p.title);
        }).map((p) => ({ p, why: `address ${addr.number} ${addr.street}` }));
      }
      // B. known building + unit
      const b = buildingOf(c.name);
      if (!hits.length && b && fUnit) {
        const streets = b.streets.map((s) => norm(s).split(" ").slice(0, 2).join(" "));
        hits = projects.filter((p) => {
          const ps = norm(p.street).split(" ").slice(0, 2).join(" ");
          const inBuilding = streets.includes(ps) || b.names.some((n) => norm(p.title).includes(norm(n)));
          return inBuilding && sameUnit(fUnit, p.unit) && peopleAgree(c.name, p.title);
        }).map((p) => ({ p, why: `${b.names[0]} unit ${fUnit}` }));
      }
      const ids = new Set(hits.map((h) => h.p.id));
      if (ids.size === 1) found.push({ gc: gc.name, folder: c.name, project: hits[0].p, why: hits[0].why });
      else if (ids.size > 1) maybe.push(`${gc.name}/${c.name}: ${[...new Map(hits.map((h) => [h.p.id, h.p])).values()].map((p) => `${p.title} (#${p.id})`).join(" | ")}`);
    }
  }
  console.log(`${open} open folders; ${found.length} perfect matches; ${maybe.length} ambiguous (left alone).`);
  for (const f of found) console.log(`  ${f.gc}/${f.folder}  ->  ${f.project.title} (#${f.project.id})  [${f.why}]`);
  if (maybe.length) { console.log("ambiguous:"); for (const m of maybe) console.log("  ? " + m); }
  if (!APPLY) { console.log("\nDry run. Add --apply to save these decisions, then run move-projects-ts.ts --apply."); return; }
  const rest = (await loadDecisions()).filter((d) => !found.some((f) => folderKey(f.folder) === folderKey(d.folder)));
  await saveDecisions([...rest, ...found.map((f) => ({ folder: f.folder, projectId: f.project.id }))].sort((a, b) => a.folder.localeCompare(b.folder)));
  console.log(`Saved ${found.length} decisions.`);
}
main().catch((e) => { console.error(e); process.exit(1); });
