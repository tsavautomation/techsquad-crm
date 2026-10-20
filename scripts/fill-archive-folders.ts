/**
 * Fill the Report archive decisions sheet (F16-d) for the folders still without a project, using
 * what the CRM already knows: the projects (deep name match, as scripts/move-projects-ts.ts),
 * the folders already decided on Admin › Report archive, the PROJECTS TS → project moves (OD-f/g),
 * the Portal.io people export (docs/portal-people.txt: the client's name, e-mail, phone and job
 * addresses, the source of truth for client data) and the Google Calendar events synced into
 * calendar_events (title "Tech - Client - Place" + location), used only as a second opinion.
 *
 *   npx tsx --env-file=.env.local scripts/fill-archive-folders.ts [--sheet <Fred's answers.xlsx>]
 *
 * Writes docs/report-archive-folders-filled.xlsx: Fred's own answers are kept; the rest get a
 * proposed decision (Other + project name / New) with the evidence beside it.
 * A "New" is proposed only when Portal.io has the person (surname and first name, or the only
 * person with that surname); the address, e-mail and phone come from Portal. Folders Portal does
 * not know are left blank with whatever the calendar says beside them. Nothing is written to the
 * database.
 */
import ExcelJS from "exceljs";
import { existsSync, readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false } });
const args = process.argv.slice(2);
const SHEET_IN = args.includes("--sheet") ? args[args.indexOf("--sheet") + 1] : null;
const PORTAL = "docs/portal-people.txt";
const PROPOSALS = "docs/portal-proposals.json";
const OLD = "docs/old-invoices.json";
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
const STOP = new Set("the and of e y de da do dos das mr mrs ms dr res residence residencia project proj house home apt apartment unit suite ste ph old new fl florida usa ave av st street dr drive rd road blvd ct ln way n s w ne nw se sw tower towers condo condominium bldg building office inc llc corp".split(" "));
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
  const raw = name.replace(/\s[-–]\s*\d{4,6}$/, "").replace(/^x+(?=[A-Z])/i, "").replace(/\([^)]*\)/g, " ").trim();
  const parts = raw.split(/\s[-–]\s/).map((s) => s.trim()).filter(Boolean);
  const head = parts[0] ?? raw;
  const comma = head.match(/^([^,]+),\s*(.+)$/);
  const surnames = nameWords(comma ? comma[1] : head);
  const firsts = comma ? nameWords(comma[2]) : [];
  const placeText = parts.slice(1).join(" ");
  const places = words(placeText).filter((w) => !/^\d+$/.test(w));
  // "#1405", or a bare number closing the place ("AQUALINA ESTATES 1405", "TRUMP II 4204").
  const unit = unitOf((placeText + " " + head).match(/#\s*([0-9]{1,5}\s?[A-Za-z]?)\b/)?.[1]) ?? (placeText && !/#/.test(placeText) ? unitOf(placeText.match(/\s(\d{3,5}[A-Za-z]?)\s*$/)?.[1]) : null);
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

// ---- Portal.io people (docs/portal-people.txt) ----
// One line per search term: "TERM : Name ; e-mail ; phone ; address / address || Name ; …".
// E-mails were saved with " at " instead of "@" (the browser output filter); undone here.
type Person = { name: string; email: string; phone: string; addresses: string[]; tokens: string[]; emailJoined: string };
function splitAddresses(s: string): string[] {
  const parts = s.split(" / ").map((x) => x.trim()).filter(Boolean);
  const out: string[] = [];
  for (const p of parts) {
    const prev = out.at(-1);
    // "3401 North Miami Avenue, 224 / 227, Miami, FL" is one address with two units.
    if (prev && /,\s*\d{1,5}[A-Za-z]?$/.test(prev) && /^\d{1,5}[A-Za-z]?,/.test(p)) out[out.length - 1] = prev + " / " + p;
    else out.push(p);
  }
  return out;
}
function loadPortal(): Person[] {
  const seen = new Map<string, Person>();
  for (const line of readFileSync(PORTAL, "utf8").split(/\r?\n/)) {
    const m = line.match(/^(.+?) : (.*)$/);
    if (!m || /^none$/i.test(m[2].trim())) continue;
    for (const chunk of m[2].split(" || ")) {
      const [name = "", em = "", phone = "", addr = ""] = chunk.split(" ; ").map((x) => x.trim());
      if (!name) continue;
      const email = em.replace(/ at /g, "@");
      const id = norm(name) + "|" + email.toLowerCase();
      if (seen.has(id)) continue;
      const emailJoined = norm(email.split("@")[0] + " " + (email.split("@")[1]?.split(".")[0] ?? "")).replace(/ /g, "");
      seen.set(id, { name, email, phone, addresses: splitAddresses(addr), tokens: words(name), emailJoined });
    }
  }
  return [...seen.values()];
}
type PortalHit = { person: Person; address: string | null; placed: boolean; first: boolean; exact: boolean; unitConflict: boolean; company: boolean };
// A folder place ("CORAL GABLES", "JADE SIGNATURE #903", "811 SOLAR ISLE") is in an address when the
// whole phrase is, or one of its own words (not a city word like "miami") is, or the unit is.
const GENERIC = new Set("beach miami north south east west bay island islands isle isles key keys park lake ocean grove point harbour harbor palm coral club estates estate tower towers village city county river creek shores springs sunny brickell collins biscayne pointe".split(" "));
function placeIn(address: string, places: string[], unit: string | null) {
  const a = norm(address);
  const aw = a.split(" ");
  const phrase = places.some((p) => p.length >= 4 && a.includes(p)) || places.some((p) => p.split(" ").some((w) => w.length >= 4 && !GENERIC.has(w) && !/^\d+$/.test(w) && aw.includes(w)));
  // "364 OCEAN DR" and "364 South Ocean Boulevard": same street number.
  const number = places.some((p) => { const n = p.match(/^(\d{2,6})\s/)?.[1]; return Boolean(n && aw[0] === n); });
  const units = unitsOf(address);
  const unitHit = Boolean(unit && (units.includes(unit) || units.some((u) => /^\d+$/.test(u) && u === unit.replace(/[A-Z]$/, ""))));
  // The folder names a unit and the address names a different one: not this address.
  if (unit && units.length && !unitHit) return false;
  return phrase || number || unitHit;
}
// True when the only thing in common is the unit number (the building words differ).
function unitOnly(address: string, places: string[], unit: string | null) {
  const specific = places.flatMap((p) => p.split(" ")).filter((w) => w.length >= 4 && !GENERIC.has(w) && !/^\d+$/.test(w));
  return Boolean(unit) && specific.length > 0 && !placeIn(address, places, null);
}
// Units in a Portal address: "…, 3401, …", "#2103", "Apt 4N" (never the street number or the zip).
function unitsOf(address: string) {
  const parts = address.split(",").map((x) => x.trim());
  const out: string[] = [];
  for (const [i, p] of parts.entries()) {
    const m = p.match(/^(?:#|apt|unit|suite|ste|ph)?\s*(\d{1,5}\s?[A-Za-z]?)$/i) ?? (i > 0 ? p.match(/(?:#|apt|unit|suite|ste|ph)\s*(\d{1,5}\s?[A-Za-z]?)\b/i) : null);
    if (m && !(i === parts.length - 1 && /^\d{5}$/.test(m[1]))) out.push(unitOf(m[1])!);
    else if (i === 0) { const h = p.match(/#\s*(\d{1,5}\s?[A-Za-z]?)\b/); if (h) out.push(unitOf(h[1])!); }
  }
  return out;
}
function portalMatch(folder: string, people: Person[]) {
  const f = parseFolder(folder);
  const empty = { sure: null as PortalHit | null, why: "", candidates: [] as PortalHit[] };
  if (!f.surnames.length) return empty;
  const placeParts = f.placeText.split(/\s[-–]\s/).map((p) => norm(p.replace(/#\s*[0-9]{1,5}\s?[A-Za-z]?\b/g, " "))).filter(Boolean);
  const joined = f.surnames.join("");
  const hits: PortalHit[] = [];
  for (const p of people) {
    // Every surname word must be in the person name (one typo allowed in long names); a company
    // folder ("THE WALL PAPER COMPANY") may also sit in the e-mail domain.
    const exact = f.surnames.every((s) => p.tokens.includes(s));
    const byName = exact || f.surnames.every((s) => p.tokens.some((t) => same(s, t)));
    const byEmail = !byName && f.surnames.length >= 2 && joined.length >= 6 && norm(p.email.split("@")[1] ?? "").replace(/ /g, "").includes(joined);
    if (!byName && !byEmail) continue;
    const first = f.firsts.length > 0 && anyMatch(f.firsts, p.tokens);
    // Same surname, different first name: not this person (a one-word company name may still be).
    if (f.firsts.length && !first && !byEmail && p.tokens.length > 1) continue;
    const placedAddr = p.addresses.find((a) => placeIn(a, placeParts, f.unit));
    const units = p.addresses.flatMap(unitsOf);
    const unitConflict = Boolean(f.unit && !placedAddr && units.length > 0 && !units.includes(f.unit));
    const company = !first && p.tokens.length >= 3;
    hits.push({ person: p, address: placedAddr ?? p.addresses[0] ?? null, placed: Boolean(placedAddr), first, exact: exact || byEmail, unitConflict, company });
  }
  if (!hits.length) return empty;
  // An exact surname beats a one-letter-off one ("Karina" is not "Marina").
  const exacts = hits.filter((h) => h.exact);
  if (exacts.length) hits.splice(0, hits.length, ...exacts);
  const strong = hits.filter((h) => !h.unitConflict && (f.firsts.length ? h.first : (h.exact || h.placed) && !h.company));
  const placed = strong.filter((h) => h.placed);
  const pick = (hs: PortalHit[], why: string) => ({ sure: hs[0], why, candidates: hits });
  const several = (h: PortalHit) => (h.person.addresses.length > 1 ? " (several addresses, check)" : h.person.addresses.length ? "" : " (no address in Portal)");
  if (placed.length === 1) return pick(placed, (f.firsts.length ? "Portal: same person, address with that place" : "Portal: same surname, address with that place") + (placed[0].address && unitOnly(placed[0].address, placeParts, f.unit) ? " (same unit, building words differ, check)" : ""));
  if (placed.length > 1 && new Set(placed.map((h) => h.address)).size === 1) return pick(placed, "Portal: same client, several records, address with that place");
  if (strong.length === 1 && f.firsts.length) return pick(strong, "Portal: same person" + (placeParts.length && strong[0].person.addresses.length ? " (Portal address does not name that place, check)" : several(strong[0])));
  if (strong.length === 1 && !placeParts.length) return pick(strong, "Portal: only person with that surname" + several(strong[0]));
  // Several records with the same e-mail are the same client.
  const emails = new Set(strong.map((h) => h.person.email.toLowerCase()).filter(Boolean));
  if (strong.length > 1 && emails.size === 1 && strong.every((h) => h.person.email) && !placeParts.length) return pick(strong, "Portal: same client, several records (check address)");
  const why = hits.every((h) => h.unitConflict) ? "Portal: has the name but the unit differs, check" : strong.length === 1 ? "Portal: surname only and the address does not name that place, check" : "Portal: several people, pick one";
  return { sure: null, why, candidates: hits };
}

// ---- Portal.io proposals (docs/portal-proposals.json, pulled from api.portal.io) ----
// The end client often only appears in the proposal name ("Guimar Urbina - Lazarus Residence"),
// with the designer as the customer; the proposal's location is the job address.
type Proposal = { id: number; n: string; name: string | null; st: string; cust: string; email: string; phone: string; addr: string; created: string | null; tokens: string[]; nameOnly: string };
function loadProposals(): Proposal[] {
  if (!existsSync(PROPOSALS)) return [];
  const raw = JSON.parse(readFileSync(PROPOSALS, "utf8")) as Omit<Proposal, "tokens" | "nameOnly">[];
  return raw.filter((p) => p.name || p.cust).map((p) => {
    const cust = words(p.cust);
    // The place is looked for in the proposal name without the customer's own words, so a
    // designer called "Avant" does not place every Avant proposal at the folder "… - AVANT".
    return { ...p, tokens: [...new Set([...words(p.name), ...cust])], nameOnly: words(p.name).filter((w) => !cust.includes(w)).join(" ") };
  });
}
type ProposalHit = { p: Proposal; placed: boolean; first: boolean; named: boolean; unitOnly: boolean };
function proposalMatch(folder: string, proposals: Proposal[]) {
  const f = parseFolder(folder);
  const none = { sure: null as Proposal | null, why: "", hits: [] as ProposalHit[] };
  if (!f.surnames.length) return none;
  const placeParts = f.placeText.split(/\s[-–]\s/).map((p) => norm(p.replace(/#\s*[0-9]{1,5}\s?[A-Za-z]?\b/g, " "))).filter(Boolean);
  const hits: ProposalHit[] = [];
  for (const p of proposals) {
    if (!f.surnames.every((s) => p.tokens.some((t) => same(s, t)))) continue;
    const first = f.firsts.length > 0 && anyMatch(f.firsts, p.tokens);
    if (f.firsts.length && !first) continue;
    // Only the job address can place a proposal; a place in the proposal's name alone is a hint
    // (the address is often the designer's office).
    const placed = p.addr !== "" && placeIn(p.addr, placeParts, f.unit);
    const named = !placed && placeParts.length > 0 && placeIn(p.nameOnly, placeParts, f.unit);
    hits.push({ p, placed, first, named, unitOnly: placed && unitOnly(p.addr, placeParts, f.unit) });
  }
  if (!hits.length) return none;
  const withAddr = hits.filter((h) => h.p.addr);
  const pool = (placeParts.length || f.unit) ? withAddr.filter((h) => h.placed) : withAddr;
  const addrs = new Map<string, ProposalHit[]>();
  for (const h of pool) addrs.set(h.p.addr, [...(addrs.get(h.p.addr) ?? []), h]);
  const label = (h: ProposalHit) => `Portal proposal #${h.p.n} "${h.p.name ?? h.p.cust}"`;
  if (addrs.size === 1) {
    const best = pool.sort((a, b) => (b.p.created ?? "").localeCompare(a.p.created ?? ""))[0];
    const note = placeParts.length || f.unit ? (best.unitOnly ? " (same unit, building words differ, check)" : "") : " (folder names no place, check)";
    return { sure: best.p, why: label(best) + (pool.length > 1 ? ` (+${pool.length - 1} more, same address)` : "") + note, hits };
  }
  if (addrs.size > 1) return { sure: null, why: `Portal proposals: ${addrs.size} different addresses, pick one`, hits };
  const named = hits.find((h) => h.named);
  if (named) return { sure: null, why: label(named) + " names that place, but its job address does not match, check", hits };
  return { sure: null, why: withAddr.length ? "Portal proposals: none names that place / unit, check" : "Portal proposals found, but without an address", hits };
}

// ---- Old invoices 2011–2016 (docs/old-invoices.json, from scripts/list-old-invoices.ts) ----
// One OneDrive folder per client under "DROPBOX OLD INVOICES / TECH SQUAD", with the QuickBooks
// estimates and invoices: client name, address and project read out of the PDFs.
type OldDoc = { name: string; client: string; clientAddress: string; project: string; addresses: string[]; emails: string[]; phones: string[] };
type OldClient = { folder: string; client: string; address: string; project: string; email: string; phone: string; tokens: string[] };
function loadOld(): OldClient[] {
  if (!existsSync(OLD)) return [];
  const raw = Object.values(JSON.parse(readFileSync(OLD, "utf8")) as Record<string, { folder: string; docs: OldDoc[] }>);
  return raw.map((f) => {
    const docs = f.docs.filter((d) => d.client || d.clientAddress || d.addresses.length);
    const fl = (s: string) => /\bFL\b|Florida/i.test(s);
    const best = docs.find((d) => fl(d.clientAddress)) ?? docs.find((d) => d.addresses.some(fl)) ?? docs[0];
    const address = best ? (fl(best.clientAddress) ? best.clientAddress : best.addresses.find(fl) ?? best.clientAddress) : "";
    const clients = [...new Set(docs.map((d) => d.client).filter(Boolean))];
    return { folder: f.folder, client: clients.join(" / "), address, project: [...new Set(docs.map((d) => d.project).filter(Boolean))].join(" / "), email: docs.flatMap((d) => d.emails)[0] ?? "", phone: docs.flatMap((d) => d.phones)[0] ?? "", tokens: [...new Set([...words(f.folder), ...clients.flatMap(words)])] };
  });
}
type OldHit = { c: OldClient; placed: boolean; named: boolean };
function oldMatch(folder: string, old: OldClient[]) {
  const f = parseFolder(folder);
  const none = { sure: null as OldClient | null, why: "", hits: [] as OldHit[] };
  if (!f.surnames.length) return none;
  const placeParts = f.placeText.split(/\s[-–]\s/).map((p) => norm(p.replace(/#\s*[0-9]{1,5}\s?[A-Za-z]?\b/g, " "))).filter(Boolean);
  const hits: OldHit[] = [];
  for (const c of old) {
    if (!f.surnames.every((s) => c.tokens.some((t) => same(s, t)))) continue;
    if (f.firsts.length && !anyMatch(f.firsts, c.tokens)) continue;
    // Only the address itself can place a client; the folder or project name alone is a hint.
    const placed = Boolean(c.address) && placeIn(c.address, placeParts, f.unit);
    const named = !placed && placeParts.length > 0 && (placeIn(c.project, placeParts, f.unit) || placeIn(c.folder, placeParts, f.unit));
    hits.push({ c, placed, named });
  }
  if (!hits.length) return none;
  const withAddr = hits.filter((h) => h.c.address);
  const pool = placeParts.length || f.unit ? withAddr.filter((h) => h.placed) : withAddr;
  const addrs = new Set(pool.map((h) => h.c.address));
  if (addrs.size === 1) return { sure: pool[0].c, why: `old invoices 2011–2016: folder "${pool[0].c.folder}"` + (placeParts.length || f.unit ? "" : " (folder names no place)") + " (check)", hits };
  if (addrs.size > 1) return { sure: null, why: `old invoices: ${addrs.size} different addresses, pick one`, hits };
  const named = hits.find((h) => h.named);
  if (named) return { sure: null, why: `old invoices: folder "${named.c.folder}" names that place, but its address does not match, check`, hits };
  return { sure: null, why: withAddr.length ? "old invoices: none names that place / unit, check" : "old invoices found, but without an address", hits };
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
  // Visits whose title names the folder's place or unit: their location is the job address.
  // "17901 Collins Ave" and "17901 Collins Ave, Sunny Isles Beach, FL 33160, USA" are one address:
  // group by the street line and keep the fullest spelling.
  const placedLocs = new Map<string, { n: number; best: string }>();
  for (const e of placed) {
    if (!e.location) continue;
    const loc = e.location.trim();
    const k = norm(loc.split(",")[0]).replace(/\b(ave|avenue|st|street|dr|drive|rd|road|blvd|boulevard|ct|court|ln|lane|ter|terrace|pl|place|hwy|highway)\b/g, "").replace(/\s+/g, " ").trim();
    const g = placedLocs.get(k) ?? { n: 0, best: loc };
    g.n++;
    if (loc.length > g.best.length) g.best = loc;
    placedLocs.set(k, g);
  }
  const placedAddress = [...placedLocs.values()].sort((a, b) => b.n - a.n)[0]?.best ?? null;
  return { events: hits.length, address: [...locs.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null, addresses: locs.size, placedCount: placed.length, placedAddresses: placedLocs.size, placedAddress: placedAddress && f.unit && !placedAddress.replace(/[^A-Za-z0-9]/g, "").toUpperCase().includes(f.unit) ? `${placedAddress} #${f.unit}` : placedAddress, first: dates[0] ?? null, last: dates.at(-1) ?? null, techs: [...techs.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([t]) => t).join(", "), sample: hits.slice(0, 2).map((e) => e.summary).join(" | ") };
}

async function main() {
  // Fred's answers so far.
  const answers = new Map<string, { decision: string; other: string }>();
  if (SHEET_IN) {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(SHEET_IN);
    wb.worksheets[0].eachRow((r, i) => {
      if (i <= 1) return;
      const v = (n: number) => { const x = r.getCell(n).value as unknown; return x == null ? "" : typeof x === "object" ? String((x as { result?: unknown; text?: unknown }).result ?? (x as { text?: unknown }).text ?? "") : String(x); };
      if (v(7).trim() && !/^your decision$/i.test(v(7))) answers.set(key(v(1)), { decision: v(7).trim(), other: v(8).trim() });
    });
  }
  // Open folders = unmatched files minus the page's decisions minus the OneDrive move.
  type RF = { gc_folder: string; client_folder: string; parsed: { name: { date: string | null; technicians: string[]; job: string | null } } };
  const files = await all<RF>(() => db.from("report_files").select("gc_folder, client_folder, parsed").eq("status", "unmatched").order("id"));
  type Folder = { folder: string; gc: string; files: number; first: string; last: string; techs: Map<string, number> };
  const folders = new Map<string, Folder>();
  for (const r of files) {
    const f = folders.get(r.client_folder) ?? { folder: r.client_folder, gc: r.gc_folder, files: 0, first: "9999", last: "0000", techs: new Map() };
    f.files++;
    const d = r.parsed?.name?.date;
    if (d) { if (d < f.first) f.first = d; if (d > f.last) f.last = d; }
    for (const t of r.parsed?.name?.technicians ?? []) f.techs.set(t, (f.techs.get(t) ?? 0) + 1);
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
  const people = loadPortal();
  const proposals = loadProposals();
  const old = loadOld();
  const showO = (h: OldHit) => `${h.c.folder} [${h.c.client}]${h.c.address ? ": " + h.c.address : ""}${h.c.project ? " (" + h.c.project.slice(0, 40) + ")" : ""}`;
  const showP = (h: ProposalHit) => `#${h.p.n} ${h.p.name ?? ""} [${h.p.cust}]${h.p.addr ? ": " + h.p.addr : ""}`;
  // Calendar events (the company calendar, synced).
  const events = (await all<Ev>(() => db.from("calendar_events").select("summary, location, starts_at").not("summary", "is", null).order("starts_at"))).filter((e) => e.summary);
  console.log(`${folders.size} folders with unmatched files, ${decided.size} decided on the page, ${moved.size} folders moved in OneDrive, ${projects.length} projects, ${people.length} Portal people, ${events.length} calendar events, ${answers.size} answers from Fred's sheet.`);

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Folders");
  ws.columns = [
    { header: "Folder in OneDrive", key: "folder", width: 44 },
    { header: "Designer / GC folder", key: "gc", width: 28 },
    { header: "Files", key: "files", width: 7 },
    { header: "From", key: "first", width: 11 },
    { header: "To", key: "last", width: 11 },
    { header: "Technicians (files)", key: "techs", width: 26 },
    { header: "YOUR DECISION", key: "decision", width: 14 },
    { header: "Project name, if Other", key: "other", width: 44 },
    { header: "Proposed by", key: "why", width: 40 },
    { header: "Portal: client", key: "pname", width: 28 },
    { header: "Portal: e-mail", key: "pemail", width: 30 },
    { header: "Portal: phone", key: "pphone", width: 15 },
    { header: "Portal: address (for the new project)", key: "paddr", width: 50 },
    { header: "Portal: other people found", key: "pothers", width: 50 },
    { header: "Portal: proposals found (#, name, address)", key: "props", width: 60 },
    { header: "Old invoices 2011-2016: folder / client / address", key: "old", width: 60 },
    { header: "Calendar events", key: "events", width: 9 },
    { header: "Calendar address (most used)", key: "address", width: 46 },
    { header: "Calendar first", key: "cfirst", width: 11 },
    { header: "Calendar last", key: "clast", width: 11 },
    { header: "Calendar technicians", key: "ctechs", width: 26 },
    { header: "Calendar example", key: "sample", width: 50 },
  ];
  ws.getRow(1).font = { bold: true };
  const counts: Record<string, number> = {};
  const show = (h: PortalHit) => `${h.person.name}${h.person.email ? " <" + h.person.email + ">" : ""}${h.person.addresses.length ? ": " + h.person.addresses.join(" / ") : ""}`;
  for (const f of [...folders.values()].sort((a, b) => b.files - a.files)) {
    const k = key(f.folder);
    if (decided.has(k)) continue;
    const row: Record<string, unknown> = { folder: f.folder, gc: f.gc, files: f.files, first: f.first === "9999" ? "" : f.first, last: f.last === "0000" ? "" : f.last, techs: [...f.techs.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([t]) => t).join(", ") };
    const cal = calendarMatch(f.folder, events);
    Object.assign(row, { events: cal.events || "", address: cal.address ?? "", cfirst: cal.first ?? "", clast: cal.last ?? "", ctechs: cal.techs, sample: cal.sample });
    const po = portalMatch(f.folder, people);
    const pp = proposalMatch(f.folder, proposals);
    if (po.sure) Object.assign(row, { pname: po.sure.person.name, pemail: po.sure.person.email, pphone: po.sure.person.phone, paddr: po.sure.address ?? "", pothers: po.candidates.filter((c) => c !== po.sure).map(show).join(" | ") });
    else if (po.candidates.length) Object.assign(row, { pothers: po.candidates.map(show).join(" | ") });
    // A proposal that names the folder's place or unit beats a person whose address does not.
    const useProposal = pp.sure && (!po.sure || !po.sure.placed);
    if (useProposal) Object.assign(row, { pname: pp.sure!.cust, pemail: pp.sure!.email, pphone: pp.sure!.phone, paddr: pp.sure!.addr });
    if (pp.hits.length) Object.assign(row, { props: pp.hits.slice(0, 6).map(showP).join(" | ") + (pp.hits.length > 6 ? ` | … ${pp.hits.length} proposals` : "") });
    const om = oldMatch(f.folder, old);
    if (om.hits.length) Object.assign(row, { old: om.hits.slice(0, 5).map(showO).join(" | ") });
    // Portal knows the client (person or proposals, even at the designer's office address) and the
    // calendar has visits whose title names the folder's place or unit: the visits' location is the
    // job address (Fred, Eskenazi - Acqualina 1405: Portal has 12 Navicon proposals, calendar 40 visits).
    const who = po.sure?.person ?? po.candidates[0]?.person ?? null;
    const prop = pp.sure ?? pp.hits.find((h) => h.p.cust)?.p ?? pp.hits[0]?.p ?? null;
    const fp = parseFolder(f.folder);
    const placedSure = Boolean(po.sure?.placed) || Boolean(useProposal && (fp.places.length || fp.unit));
    const useCalendar = !placedSure && cal.placedCount >= 1 && cal.placedAddresses === 1 && Boolean(cal.placedAddress) && Boolean(who || prop);
    if (useCalendar) Object.assign(row, { pname: who?.name ?? prop!.cust, pemail: who?.email ?? prop!.email, pphone: who?.phone ?? prop!.phone, paddr: cal.placedAddress });
    // The old invoices only speak when Portal has nothing.
    const useOld = Boolean(om.sure) && !po.sure && !pp.sure && !useCalendar;
    if (useOld) Object.assign(row, { pname: om.sure!.client, pemail: om.sure!.email, pphone: om.sure!.phone, paddr: om.sure!.address });
    // Calendar alone: at least 2 visits naming that place / unit, one location.
    const calendarOnly = !useCalendar && !po.sure && !pp.sure && !useOld && cal.placedCount >= 2 && cal.placedAddresses === 1 && cal.placedAddress;
    if (calendarOnly) Object.assign(row, { pname: "", paddr: cal.placedAddress });
    const fred = answers.get(k);
    if (fred) Object.assign(row, { decision: fred.decision, other: fred.other, why: "your answer (sheet)" });
    else if (moved.has(k) && byId.has(moved.get(k)!)) Object.assign(row, { decision: "Other", other: byId.get(moved.get(k)!)!.title, why: "folder already moved into this project in OneDrive" });
    else {
      const m = crmMatch(f.folder, projects, cities);
      if (m.sure) {
        Object.assign(row, { decision: "Other", other: m.sure.title, why: `CRM: ${m.why}` });
      } else if (useCalendar) Object.assign(row, { decision: "New", why: `Portal has the client (${po.sure || po.candidates.length ? "person" : "proposals"}); calendar: ${cal.placedCount} visit${cal.placedCount > 1 ? "s" : ""} at that place give the address` });
      else if (useProposal) Object.assign(row, { decision: "New", why: pp.why });
      else if (po.sure) Object.assign(row, { decision: "New", why: po.why });
      else if (useOld) Object.assign(row, { decision: "New", why: om.why });
      else if (calendarOnly) Object.assign(row, { decision: "New", why: `calendar only: ${cal.placedCount} visits at that place, one address (not in Portal, check)` });
      else if (po.candidates.length || pp.hits.length || om.hits.length) Object.assign(row, { decision: "", why: [po.candidates.length ? po.why : "", pp.hits.length ? pp.why : "", om.hits.length ? om.why : ""].filter(Boolean).join("; ") });
      else if (cal.events && parseFolder(f.folder).firsts.length && cal.addresses === 1) Object.assign(row, { decision: "", why: "not in Portal; calendar has the person (check address)" });
      else Object.assign(row, { decision: "", why: m.candidates.length ? `not in Portal; CRM maybe: ${m.candidates.map((c) => c.p.title).join(" | ")}` : "not in Portal" });
    }
    const bucket = String(row.why).split(/[:;(]/)[0].trim();
    counts[bucket] = (counts[bucket] ?? 0) + 1;
    const r = ws.addRow(row);
    r.getCell("decision").fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFF2B3" } };
  }
  await wb.xlsx.writeFile(OUT);
  console.log(`-> ${OUT}: ${ws.rowCount - 1} rows`, counts);
}
main().catch((e) => { console.error(e); process.exit(1); });
