import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { projectHours, type HoursVisit } from "@/lib/hours/engine";
import { getTable } from "@/registry";
import { recordHref } from "@/registry/routes";
import { matchProjects, pairKey, projectKey, proposedTitle, type Addr, type ContactLike, type ProjectLike } from "./dedupe";
import { EXCLUDED_PROJECT_IDS } from "./excluded";

// PJ-b item 2 (Possible duplicates) and item 5 (standard names): what the two screens read. Everything goes
// through the viewer's own client (RLS): only what they may see is compared.

export type ProjectSummary = {
  id: number;
  title: string;
  href: string;
  job_status: string | null;
  type: string | null;
  owner: string | null;
  ownerId: number | null;
  address: string;
  unit: string | null;
  building: string | null;
  created: string;
  reports: number;
  visits: number;
  hours: number;
  transactions: number;
  transactionsTotal: number;
  checkouts: number;
  files: number;
  firstVisit: string | null;
  lastVisit: string | null;
};
export type DuplicatePair = { key: string; a: ProjectSummary; b: ProjectSummary; why: string };
export type MergeRow = { id: number; from: ProjectSummary | null; into: ProjectSummary | null; reason: string | null; merged_at: string; merged_by: string | null; undone_at: string | null };

type Row = ProjectLike & { type: string | null; job_status: string | null; building_id: number | null; created_at: string; merged_into_id: number | null; contacts: (ContactLike & { organizations: { title: string | null } | null }) | null };

const all = async <T,>(q: PromiseLike<{ data: unknown; error: { message: string } | null }>): Promise<T[]> => {
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []) as T[];
};
const addrText = (a: Addr) => (a ? [a.street, a.address_2, a.city, a.state, a.zip].filter(Boolean).join(", ") : "");

async function loadRows(db: SupabaseClient) {
  const [projects, buildings] = await Promise.all([
    all<Row>(db.from("projects").select("id, title, type, job_status, job_owner_id, job_address, apartment_or_unit, building_id, created_at, merged_into_id, contacts:job_owner_id(id, title, first_name, last_name, type, organizations:organization_id(title))").is("deleted_at", null).is("archived_at", null).is("merged_into_id", null).order("title").limit(5000)),
    all<{ id: number; title: string | null }>(db.from("buildings").select("id, title").is("deleted_at", null).limit(2000)),
  ]);
  const buildingTitle = new Map(buildings.map((b) => [b.id, b.title]));
  return { projects: projects.filter((p) => !EXCLUDED_PROJECT_IDS.includes(p.id)), buildingTitle };
}

/** What each project holds, for the side-by-side cards. */
async function summaries(db: SupabaseClient, rows: Row[], buildingTitle: Map<number, string | null>, ids: number[]): Promise<Map<number, ProjectSummary>> {
  const t = getTable("projects");
  const out = new Map<number, ProjectSummary>();
  if (!ids.length) return out;
  const [reports, visits, team, tx, checkouts, files, attachments] = await Promise.all([
    all<{ id: number; project_id: number }>(db.from("job_reports").select("id, project_id").is("deleted_at", null).in("project_id", ids).limit(20000)),
    all<HoursVisit & { project_id: number }>(db.from("visits").select("id, project_id, starts_at, status, duration, technician_id, checked_in_at, checked_out_at").is("deleted_at", null).in("project_id", ids).limit(20000)),
    all<{ record_id: number; target_id: number }>(db.from("visits_team").select("record_id, target_id").limit(50000)),
    all<{ id: number; project_id: number; amount: number | null }>(db.from("transactions").select("id, project_id, amount").is("deleted_at", null).in("project_id", ids).limit(20000)),
    all<{ id: number; project_id: number }>(db.from("inventory_checkouts").select("id, project_id").is("deleted_at", null).in("project_id", ids).limit(20000)),
    all<{ id: number; project_id: number }>(db.from("report_files").select("id, project_id").in("project_id", ids).limit(20000)),
    all<{ id: number; record_id: number }>(db.from("attachments").select("id, record_id").eq("table_name", "projects").is("deleted_at", null).in("record_id", ids).limit(20000)),
  ]);
  const teamOf = Map.groupBy(team, (x) => x.record_id);
  for (const v of visits) v.team_ids = (teamOf.get(v.id) ?? []).map((x) => x.target_id);
  const count = <T extends { project_id: number }>(xs: T[]) => Map.groupBy(xs, (x) => x.project_id);
  const byReports = count(reports), byVisits = count(visits), byTx = count(tx), byCheckouts = count(checkouts), byFiles = count(files);
  const byAttachments = Map.groupBy(attachments, (a) => a.record_id);
  for (const p of rows) {
    if (!ids.includes(p.id)) continue;
    const vs = (byVisits.get(p.id) ?? []).filter((v) => v.status !== "Cancelled");
    const dates = vs.map((v) => v.starts_at.slice(0, 10)).sort();
    const c = p.contacts;
    out.set(p.id, {
      id: p.id,
      title: p.title ?? `#${p.id}`,
      href: recordHref(t, p.id),
      job_status: p.job_status,
      type: p.type,
      owner: c?.title ?? null,
      ownerId: p.job_owner_id,
      address: addrText(p.job_address),
      unit: p.apartment_or_unit,
      building: p.building_id ? (buildingTitle.get(p.building_id) ?? null) : null,
      created: p.created_at.slice(0, 10),
      reports: byReports.get(p.id)?.length ?? 0,
      visits: vs.length,
      hours: Math.round((projectHours(vs).onSiteMin / 60) * 10) / 10,
      transactions: byTx.get(p.id)?.length ?? 0,
      transactionsTotal: (byTx.get(p.id) ?? []).reduce((n, x) => n + Number(x.amount ?? 0), 0),
      checkouts: byCheckouts.get(p.id)?.length ?? 0,
      files: (byFiles.get(p.id)?.length ?? 0) + (byAttachments.get(p.id)?.length ?? 0),
      firstVisit: dates[0] ?? null,
      lastVisit: dates[dates.length - 1] ?? null,
    });
  }
  return out;
}

/** Every strong pair among the live projects, minus the pairs the office declared different. */
export async function loadDuplicatePairs(db: SupabaseClient): Promise<{ pairs: DuplicatePair[]; merges: MergeRow[] }> {
  const { projects, buildingTitle } = await loadRows(db);
  const ignored = new Set((await all<{ a: number; b: number }>(db.from("project_not_duplicates").select("a, b").limit(20000))).map((p) => `${p.a}:${p.b}`));
  const keys = projects.map((p) => projectKey(p, p.contacts, p.building_id ? buildingTitle.get(p.building_id) : null));
  const found: { a: number; b: number; why: string }[] = [];
  for (let i = 0; i < keys.length; i++)
    for (let j = i + 1; j < keys.length; j++) {
      const m = matchProjects(keys[i], keys[j]);
      if (!m?.strong) continue;
      const [a, b] = pairKey(keys[i].id, keys[j].id);
      if (!ignored.has(`${a}:${b}`)) found.push({ a, b, why: m.why });
    }
  const ids = [...new Set(found.flatMap((p) => [p.a, p.b]))];
  const merges = await all<{ id: number; from_id: number; into_id: number; reason: string | null; merged_at: string; undone_at: string | null; merged_by: string | null }>(db.from("project_merges").select("id, from_id, into_id, reason, merged_at, undone_at, merged_by").order("merged_at", { ascending: false }).limit(50));
  const mergeIds = [...new Set(merges.flatMap((m) => [m.from_id, m.into_id]))];
  // Merged projects are archived, so they are not in `projects`: read them on their own for the history list.
  const extra = mergeIds.filter((x) => !projects.some((p) => p.id === x));
  const extraRows = extra.length ? await all<Row>(db.from("projects").select("id, title, type, job_status, job_owner_id, job_address, apartment_or_unit, building_id, created_at, merged_into_id, contacts:job_owner_id(id, title, first_name, last_name, type, organizations:organization_id(title))").in("id", extra)) : [];
  const sums = await summaries(db, [...projects, ...extraRows], buildingTitle, [...new Set([...ids, ...mergeIds])]);
  const names = merges.some((m) => m.merged_by) ? await all<{ id: string; first_name: string | null; last_name: string | null }>(db.from("profiles").select("id, first_name, last_name").in("id", [...new Set(merges.map((m) => m.merged_by).filter(Boolean))])) : [];
  const nameOf = new Map(names.map((n) => [n.id, [n.first_name, n.last_name].filter(Boolean).join(" ")]));
  const pairs = found
    .map((p) => ({ key: `${p.a}:${p.b}`, a: sums.get(p.a)!, b: sums.get(p.b)!, why: p.why }))
    .filter((p) => p.a && p.b)
    .sort((x, y) => x.a.title.localeCompare(y.a.title));
  return { pairs, merges: merges.map((m) => ({ id: m.id, from: sums.get(m.from_id) ?? null, into: sums.get(m.into_id) ?? null, reason: m.reason, merged_at: m.merged_at, merged_by: m.merged_by ? (nameOf.get(m.merged_by) ?? null) : null, undone_at: m.undone_at })) };
}

export type RenameRow = { id: number; href: string; current: string; proposed: string; owner: string | null };

/** Item 5: every live project whose name is not in the "Name Surname - Place #Unit" form, with the proposal. */
export async function loadRenamePreview(db: SupabaseClient): Promise<RenameRow[]> {
  const { projects, buildingTitle } = await loadRows(db);
  const t = getTable("projects");
  const out: RenameRow[] = [];
  for (const p of projects) {
    const proposed = proposedTitle({ owner: p.contacts, organization: p.contacts?.organizations ?? null, building: p.building_id ? buildingTitle.get(p.building_id) : null, address: p.job_address, unit: p.apartment_or_unit, title: p.title });
    if (!proposed || proposed === (p.title ?? "").trim()) continue;
    out.push({ id: p.id, href: recordHref(t, p.id), current: p.title ?? `#${p.id}`, proposed, owner: p.contacts?.title ?? null });
  }
  return out.sort((a, b) => a.current.localeCompare(b.current));
}

/** Item 3: the projects a contact already owns (shown on the new-project form once the Job Owner is picked). */
export async function loadOwnerProjects(db: SupabaseClient, contactId: number): Promise<{ id: number; title: string; href: string; address: string; job_status: string | null }[]> {
  const t = getTable("projects");
  const rows = await all<{ id: number; title: string | null; job_address: Addr; apartment_or_unit: string | null; job_status: string | null }>(db.from("projects").select("id, title, job_address, apartment_or_unit, job_status").eq("job_owner_id", contactId).is("deleted_at", null).is("merged_into_id", null).order("title").limit(50));
  return rows.map((r) => ({ id: r.id, title: r.title ?? `#${r.id}`, href: recordHref(t, r.id), address: [addrText(r.job_address), r.apartment_or_unit ? `#${r.apartment_or_unit}` : ""].filter(Boolean).join(" "), job_status: r.job_status }));
}
