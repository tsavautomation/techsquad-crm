/**
 * PJ-b item 1 (Luana via Fred 2026-11-02): the projects without a Job Status, what each one holds (job reports,
 * visits, hours, inventory checkouts, transactions, files), the owner and the address, split into three groups:
 *   A. DUPLICATE of another project (same owner, or same building/street + unit, or same person + unit);
 *   B. OLD CLIENT with no other project (keep, check the contact and the project);
 *   C. CREATED ALONE: nothing inside, or the Job Owner is a contact named like the project / a company.
 * Plus the address flags (empty or incomplete) and the contacts named like a project or a company.
 * READ-ONLY: writes docs/projects-no-status.csv (and -contacts.csv) and prints a summary. Nothing in the database changes.
 *
 *   npx tsx --conditions=react-server --env-file=.env.local scripts/report-projects-no-status.ts
 */
import fs from "node:fs";
import { projectHours, type HoursVisit } from "@/lib/hours/engine";
import { adminDb } from "@/lib/supabase/admin";

type Addr = { street?: string; address_2?: string; city?: string; state?: string; zip?: string } | null;
type Project = { id: number; title: string | null; type: string | null; category: string | null; job_status: string | null; job_owner_id: number | null; job_address: Addr; apartment_or_unit: string | null; building_id: number | null; created_at: string; archived_at: string | null };
type Contact = { id: number; title: string | null; first_name: string | null; last_name: string | null; type: string | null; email: string | null; main_phone: string | null; organization_id: number | null; created_at: string };

// ---------------------------------------------------------------- normalisation (the same rules the duplicate screen will use)
const fold = (s: unknown) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const WORDS: Record<string, string> = { dr: "drive", ave: "avenue", av: "avenue", blvd: "boulevard", rd: "road", ln: "lane", ct: "court", pl: "place", ter: "terrace", hwy: "highway", pkwy: "parkway", cir: "circle", n: "north", s: "south", e: "east", w: "west", ne: "northeast", nw: "northwest", se: "southeast", sw: "southwest" };
/** "St. Regis" → "saintregis", "2687 Flamingo Dr" → "2687flamingodrive", "JadeSignature" = "Jade Signature". */
export function normPlace(s: unknown): string {
  const words = fold(s).replace(/[^a-z0-9]+/g, " ").trim().split(" ").filter(Boolean);
  return words.map((w, i) => (w === "st" ? (i === 0 ? "saint" : "street") : (WORDS[w] ?? w))).join("");
}
/** "#1402S", "# 1402 S", "Unit 1402", "1402" → "1402s" / "1402". */
export function normUnit(s: unknown): string {
  const m = /(\d{1,5})\s*-?\s*([a-z]{0,2})\b/.exec(fold(s).replace(/\b(unit|apt|apartment|ph|penthouse|suite|ste)\b/g, " ").replace(/[#.]/g, " "));
  return m ? `${m[1]}${m[2]}` : "";
}
/** "Abrahao, Marco" = "Marco Abrahao" → "abrahao marco" (sorted words). */
export function normName(s: unknown): string {
  return fold(s).replace(/[^a-z ]+/g, " ").split(" ").filter((w) => w.length > 1).sort().join(" ");
}
/** The title split as "<person or company> - <place> #<unit>". */
export function splitTitle(title: string | null): { who: string; place: string; unit: string } {
  const t = title ?? "";
  const [whoRaw, ...rest] = t.split(/\s[-–]\s/);
  const placeRaw = rest.join(" - ");
  const unitSrc = /#/.test(placeRaw) ? placeRaw.slice(placeRaw.indexOf("#")) : /#/.test(whoRaw) ? whoRaw.slice(whoRaw.indexOf("#")) : "";
  return { who: whoRaw.replace(/#.*$/, "").trim(), place: placeRaw.replace(/#.*$/, "").replace(/\(\d+\)/, "").trim(), unit: normUnit(unitSrc) };
}
const addrText = (a: Addr) => (a ? [a.street, a.address_2, a.city, a.state, a.zip].filter(Boolean).join(", ") : "");
const incompleteAddress = (a: Addr) => !a || !a.street || !a.city || !a.zip || /#\s*\d/.test(a.street ?? "") && !/\d+\s+\w/.test(a.street ?? "");

async function main() {
  const db = adminDb();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const all = async <T,>(table: string, select: string, filter?: (q: any) => any): Promise<T[]> => {
    const out: T[] = [];
    for (let from = 0; ; from += 1000) {
      let q = db.from(table).select(select).range(from, from + 999);
      if (filter) q = filter(q);
      const { data, error } = await q;
      if (error) throw new Error(`${table}: ${error.message}`);
      out.push(...((data ?? []) as T[]));
      if (!data || data.length < 1000) break;
    }
    return out;
  };
  const [projects, contacts, orgs, buildings, reports, visits, team, checkouts, transactions, attachments, reportFiles] = await Promise.all([
    all<Project>("projects", "id, title, type, category, job_status, job_owner_id, job_address, apartment_or_unit, building_id, created_at, archived_at", (q) => q.is("deleted_at", null)),
    all<Contact>("contacts", "id, title, first_name, last_name, type, email, main_phone, organization_id, created_at", (q) => q.is("deleted_at", null)),
    all<{ id: number; title: string | null }>("organizations", "id, title", (q) => q.is("deleted_at", null)),
    all<{ id: number; title: string | null }>("buildings", "id, title", (q) => q.is("deleted_at", null)),
    all<{ id: number; project_id: number | null }>("job_reports", "id, project_id", (q) => q.is("deleted_at", null).not("project_id", "is", null)),
    all<HoursVisit & { project_id: number | null }>("visits", "id, project_id, starts_at, status, duration, technician_id, checked_in_at, checked_out_at", (q) => q.is("deleted_at", null).not("project_id", "is", null)),
    all<{ record_id: number; target_id: number }>("visits_team", "record_id, target_id"),
    all<{ id: number; project_id: number | null }>("inventory_checkouts", "id, project_id", (q) => q.is("deleted_at", null).not("project_id", "is", null)),
    all<{ id: number; project_id: number | null; type: string | null; amount: number | null }>("transactions", "id, project_id, type, amount", (q) => q.is("deleted_at", null).not("project_id", "is", null)),
    all<{ id: number; record_id: number }>("attachments", "id, record_id", (q) => q.eq("table_name", "projects").is("deleted_at", null)),
    all<{ id: number; project_id: number | null }>("report_files", "id, project_id", (q) => q.not("project_id", "is", null)),
  ]);
  const teamOf = Map.groupBy(team, (t) => t.record_id);
  for (const v of visits) v.team_ids = (teamOf.get(v.id) ?? []).map((t) => t.target_id);
  const count = <T extends { project_id: number | null }>(rows: T[]) => {
    const m = new Map<number, number>();
    for (const r of rows) m.set(r.project_id!, (m.get(r.project_id!) ?? 0) + 1);
    return m;
  };
  const nReports = count(reports), nVisits = count(visits.filter((v) => v.status !== "Cancelled")), nCheckouts = count(checkouts), nTx = count(transactions), nFiles = count(reportFiles);
  for (const a of attachments) nFiles.set(a.record_id, (nFiles.get(a.record_id) ?? 0) + 1);
  const visitsOf = Map.groupBy(visits, (v) => v.project_id!);
  const hoursOf = (id: number) => Math.round((projectHours(visitsOf.get(id) ?? []).onSiteMin / 60) * 10) / 10;
  const contactById = new Map(contacts.map((c) => [c.id, c]));
  const buildingById = new Map(buildings.map((b) => [b.id, b.title ?? ""]));
  const projectsByContact = Map.groupBy(projects, (p) => p.job_owner_id ?? 0);
  const txAmount = new Map<number, number>();
  for (const t of transactions) txAmount.set(t.project_id!, (txAmount.get(t.project_id!) ?? 0) + Number(t.amount ?? 0));

  // Keys of every project, for the duplicate search. `places` holds every way the place is written (building,
  // street, the title's place), so "Fendi Chateau" (building) still meets "9349 Collins Avenue" (street) on the other side.
  type Key = { id: number; owner: number | null; person: string; surname: string; places: string[]; unit: string };
  const keyOf = (p: Project): Key => {
    const t = splitTitle(p.title);
    const c = p.job_owner_id ? contactById.get(p.job_owner_id) : null;
    const person = normName(c ? `${c.first_name ?? ""} ${c.last_name ?? ""}`.trim() || c.title : t.who);
    const surname = fold(c?.last_name ?? t.who.split(",")[0].split(" ").pop() ?? "").replace(/[^a-z]/g, "");
    const building = p.building_id ? buildingById.get(p.building_id) : "";
    const places = [...new Set([building, p.job_address?.street, t.place].map(normPlace).filter((x) => x.length > 2))];
    const unit = normUnit(p.apartment_or_unit) || normUnit(p.job_address?.address_2) || t.unit;
    return { id: p.id, owner: p.job_owner_id, person, surname, places, unit };
  };
  const keys = new Map(projects.map((p) => [p.id, keyOf(p)]));
  /** Strong = the duplicate screen would pair them; weak = listed for Luana to check only. */
  const same = (a: Key, b: Key): { strong: boolean; why: string } | null => {
    const unitOk = a.unit && b.unit ? a.unit.replace(/[a-z]$/, "") === b.unit.replace(/[a-z]$/, "") : !a.unit && !b.unit;
    const placeOk = a.places.some((x) => b.places.some((y) => x === y || (x.length > 5 && y.length > 5 && (x.includes(y) || y.includes(x)))));
    const personOk = Boolean(a.person && b.person) && a.person === b.person;
    const surnameOk = a.surname.length > 2 && a.surname === b.surname;
    if (a.owner && a.owner === b.owner && (unitOk || placeOk)) return { strong: true, why: "same owner + same place/unit" };
    if (placeOk && unitOk && a.unit) return { strong: true, why: personOk || surnameOk ? "same person + same building + same unit" : "same building + same unit, different owner (check)" };
    if (personOk && unitOk && a.unit) return { strong: true, why: "same person + same unit" };
    if (a.owner && a.owner === b.owner) return { strong: false, why: "same owner, another address (check)" };
    if (surnameOk && placeOk) return { strong: false, why: "same last name + same place, another unit/owner (check)" };
    return null;
  };

  const noStatus = projects.filter((p) => !p.job_status && !p.archived_at);
  const header = ["id", "group", "title", "type", "category", "created", "job_owner", "owner_type", "address", "unit", "building", "address_flag", "reports", "visits", "hours", "checkouts", "transactions", "transactions_total", "files", "duplicate_of", "why", "to_check", "owner_projects"];
  const csvRows: string[][] = [];
  const groups = { A: 0, B: 0, C: 0 };
  const COMPANY_WORDS = /\b(warehouse|company|co|corp|inc|llc|store|office|studio|design|designs|group|shop|gallery|hotel|restaurant|club|school|church|center|centre|plaza|market|bank|dental|clinic|law|realty|properties|development|developments|condo|condominium|association|residence|residences|holdings|partners|services|solutions|interiors|kaza)\b/;
  const orgNames = new Set(orgs.map((o) => normName(o.title)));
  const projectTitles = new Set(projects.map((p) => normName(p.title)));
  /** A contact that is really a company or a project name ("Tiffany Warehouse", "Studio Kaza", "The Wall Paper Company"). */
  const contactLooksLikeCompany = (c: Contact) => orgNames.has(normName(c.title)) || COMPANY_WORDS.test(fold(c.title)) || projectTitles.has(normName(c.title)) || (!c.last_name && !c.email && !c.main_phone);
  for (const p of noStatus) {
    const k = keys.get(p.id)!;
    const pairs: string[] = [];
    const checks: string[] = [];
    let why = "";
    for (const q of projects) {
      if (q.id === p.id) continue;
      const r = same(k, keys.get(q.id)!);
      if (!r) continue;
      const label = `#${q.id} ${q.title ?? ""}${q.job_status ? ` [${q.job_status}]` : " [no status]"}`;
      if (r.strong) {
        pairs.push(label);
        why ||= r.why;
      } else checks.push(`${label}: ${r.why}`);
    }
    const c = p.job_owner_id ? contactById.get(p.job_owner_id) : null;
    const inside = (nReports.get(p.id) ?? 0) + (nVisits.get(p.id) ?? 0) + (nCheckouts.get(p.id) ?? 0) + (nTx.get(p.id) ?? 0) + (nFiles.get(p.id) ?? 0);
    const contactLikeProject = c ? contactLooksLikeCompany(c) : false;
    const group = pairs.length ? "A duplicate" : inside === 0 || contactLikeProject || !c ? "C created alone" : "B old client";
    groups[group[0] as "A" | "B" | "C"]++;
    const a = p.job_address;
    const flag = !a || !a.street ? "no address" : incompleteAddress(a) ? "incomplete" : "";
    csvRows.push([
      String(p.id), group, p.title ?? "", p.type ?? "", p.category ?? "", p.created_at.slice(0, 10), c?.title ?? "", c ? (contactLikeProject ? `${c.type ?? ""} (named like a company/project)` : c.type ?? "") : "NO OWNER",
      addrText(a), p.apartment_or_unit ?? "", p.building_id ? buildingById.get(p.building_id) ?? "" : "", flag,
      String(nReports.get(p.id) ?? 0), String(nVisits.get(p.id) ?? 0), String(hoursOf(p.id)), String(nCheckouts.get(p.id) ?? 0), String(nTx.get(p.id) ?? 0), String(Math.round(txAmount.get(p.id) ?? 0)), String(nFiles.get(p.id) ?? 0),
      pairs.join(" | "), why, checks.join(" | "), String((projectsByContact.get(p.job_owner_id ?? 0) ?? []).length),
    ]);
  }
  csvRows.sort((x, y) => x[1].localeCompare(y[1]) || x[2].localeCompare(y[2]));
  const csv = (rows: string[][]) => "﻿" + rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\r\n") + "\r\n";
  fs.mkdirSync("docs", { recursive: true });
  fs.writeFileSync("docs/projects-no-status.csv", csv([header, ...csvRows]));

  // Contacts named like a project or a company (no first/last name, or title equal to a project's "who" / an organization).
  const projectWho = new Map<string, string[]>();
  for (const p of projects) {
    const w = normName(splitTitle(p.title).who);
    if (w) projectWho.set(w, [...(projectWho.get(w) ?? []), `#${p.id}`]);
  }
  const suspects = contacts
    .filter(contactLooksLikeCompany)
    .map((c) => [String(c.id), c.title ?? "", c.type ?? "", c.email ?? "", c.main_phone ?? "", c.created_at.slice(0, 10), String((projectsByContact.get(c.id) ?? []).length), (projectWho.get(normName(c.title)) ?? []).join(" "), orgNames.has(normName(c.title)) ? "same name as an organization" : projectTitles.has(normName(c.title)) ? "same name as a project" : COMPANY_WORDS.test(fold(c.title)) ? "company word in the name" : "no last name, email or phone"]);
  fs.writeFileSync("docs/projects-no-status-contacts.csv", csv([["contact_id", "title", "type", "email", "phone", "created", "projects", "projects_named_like_it", "why"], ...suspects]));

  console.log(`projects ${projects.length}, without Job Status ${noStatus.length}: A duplicate ${groups.A}, B old client ${groups.B}, C created alone ${groups.C}`);
  console.log(`address flags: no address ${csvRows.filter((r) => r[11] === "no address").length}, incomplete ${csvRows.filter((r) => r[11] === "incomplete").length}`);
  console.log(`contacts named like a project / company: ${suspects.length}`);
  const want = [[1061, 1372], [1128, 1370], [1188, 1317], [1084, 1507], [1077, 1320], [1097, 1439], [1097, 1448], [1026, 1360], [1361, 1415], [1289, 1290], [1293, 1294], [1461, 1529], [1411, 1359], [1460, 1319]];
  for (const [a, b] of want) {
    const m = keys.get(a) && keys.get(b) ? same(keys.get(a)!, keys.get(b)!) : null; const r = m ? `${m.strong ? "DUP" : "check"}: ${m.why}` : null;
    console.log(`pair #${a}/#${b}: ${r ?? "NOT matched"}`);
  }
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
