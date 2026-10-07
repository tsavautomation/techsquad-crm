import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { CurrentUser } from "@/lib/auth/session";
import { fromDateTimeLocalET, todayET } from "@/lib/dates";
import { pathOf } from "@/lib/files/paths";
import { fileUrls } from "@/lib/files/store";
import { adminDb } from "@/lib/supabase/admin";
import { recordsDb } from "@/lib/records/data";
import type { Address } from "@/lib/records/values";
import { addDays } from "@/lib/schedule/dates";
import { openPendingByProject } from "./pending";
import { loadFieldDay } from "./return-card";

// F2 Field day: what the Today screen and the visit page show. Reads through the signed-in
// user's session, so row-level security applies.

/** Address for maps and directions: street, city, state zip. */
export const mapAddress = (a: Address | null) => (a ? [a.street, a.city, [a.state, a.zip].filter(Boolean).join(" ")].filter(Boolean).join(", ") : "") || null;

export type MyVisit = {
  id: number;
  starts_at: string;
  duration: number;
  arrival_window: number;
  status: string;
  project: string;
  projectId: number | null;
  address: string | null;
  service: string | null;
  /** The van going (F10-a). */
  vehicle: string | null;
  instructions: string | null;
  access: string | null;
  tools: string[];
  on_way_at: string | null;
  checked_in_at: string | null;
  checked_out_at: string | null;
  reportId: number | null;
  /** F17-d: return cards still open on the project. */
  pending: number;
  /** F21-i: client, phone, gate code, unit and COI for the technician. */
  site: SiteCard | null;
};

type VisitRow = {
  id: number;
  starts_at: string;
  duration: string | null;
  arrival_window: string | null;
  status: string | null;
  project_id: number | null;
  service_type: string | null;
  instructions: string | null;
  access_notes: string | null;
  on_way_at: string | null;
  checked_in_at: string | null;
  checked_out_at: string | null;
  address: Address | null;
  vehicles: { title: string | null } | null;
  projects: { title: string | null; job_address: Address | null } | null;
};
const COLS = "id, starts_at, duration, arrival_window, status, project_id, service_type, instructions, access_notes, on_way_at, checked_in_at, checked_out_at, address, vehicles(title), projects(title, job_address)";

/** F21-i: what a technician needs about the site before ringing the bell (client, phone, gate code, unit, COI). */
export type SiteCard = { client: string | null; phone: string | null; gate: string | null; unit: string | null; coi: { name: string; url: string }[] };

/**
 * The client's basics for the technician's visit card (Fred 2026-10-07). Read with the service role,
 * scoped to one project the person is already visiting: technicians have no Contacts permission, but
 * must know who they are meeting.
 */
export async function loadSiteCards(projectIds: number[]): Promise<Map<number, SiteCard>> {
  const out = new Map<number, SiteCard>();
  const ids = [...new Set(projectIds)];
  if (!ids.length) return out;
  const db = adminDb();
  const { data } = await db.from("projects").select("id, job_owner_id, owner_contact, owner_contact_intl, door_gate_code, apartment_or_unit, building_id").in("id", ids);
  const rows = (data ?? []) as { id: number; job_owner_id: number | null; owner_contact: string | null; owner_contact_intl: string | null; door_gate_code: string | null; apartment_or_unit: string | null; building_id: number | null }[];
  const ownerIds = [...new Set(rows.map((r) => r.job_owner_id).filter((x): x is number => x !== null))];
  const buildingIds = [...new Set(rows.map((r) => r.building_id).filter((x): x is number => x !== null))];
  const [{ data: owners }, { data: files }] = await Promise.all([
    ownerIds.length ? db.from("contacts").select("id, title, main_phone, alternate_phone").in("id", ownerIds) : Promise.resolve({ data: [] }),
    db
      .from("attachments")
      .select("table_name, record_id, field, provider, provider_path, file_name, mime_type, size_bytes")
      .is("deleted_at", null)
      .or([`and(table_name.eq.projects,field.eq.job_coi,record_id.in.(${ids.join(",")}))`, buildingIds.length ? `and(table_name.eq.buildings,field.eq.upload_coi,record_id.in.(${buildingIds.join(",")}))` : null].filter(Boolean).join(",")),
  ]);
  const ownerOf = new Map(((owners ?? []) as { id: number; title: string | null; main_phone: string | null; alternate_phone: string | null }[]).map((c) => [c.id, c]));
  type Att = { table_name: string; record_id: number; field: string; provider: string; provider_path: string; file_name: string };
  const atts = (files ?? []) as Att[];
  const urls = atts.length ? await fileUrls(db, atts.map((a) => pathOf(a))) : new Map<string, string>();
  for (const r of rows) {
    const owner = r.job_owner_id ? ownerOf.get(r.job_owner_id) : null;
    const coi = atts
      .filter((a) => (a.table_name === "projects" && a.record_id === r.id) || (a.table_name === "buildings" && a.record_id === r.building_id))
      .map((a) => ({ name: a.file_name, url: urls.get(pathOf(a)) ?? "" }))
      .filter((a) => a.url);
    out.set(r.id, {
      client: owner?.title ?? null,
      phone: r.owner_contact || r.owner_contact_intl || owner?.main_phone || owner?.alternate_phone || null,
      gate: r.door_gate_code || null,
      unit: r.apartment_or_unit || null,
      coi,
    });
  }
  return out;
}

/** The signed-in person's employee records (matched by email, as for "my tasks"). */
export async function myEmployeeIds(db: SupabaseClient, user: CurrentUser): Promise<number[]> {
  const { data } = await db.from("employee_names").select("id").ilike("email", user.email).is("deleted_at", null);
  return ((data ?? []) as { id: number }[]).map((e) => e.id);
}

/** Visits where one of `people` is the technician or "also going", starting in [from, to). */
async function visitsFor(db: SupabaseClient, people: number[], from: string, to: string): Promise<VisitRow[]> {
  if (!people.length) return [];
  const { data: team } = await db.from("visits_team").select("record_id").in("target_id", people);
  const teamIds = [...new Set(((team ?? []) as { record_id: number }[]).map((x) => x.record_id))];
  const or = [`technician_id.in.(${people.join(",")})`, teamIds.length ? `id.in.(${teamIds.join(",")})` : null].filter(Boolean).join(",");
  const { data } = await db.from("visits").select(COLS).or(or).gte("starts_at", from).lt("starts_at", to).neq("status", "Cancelled").is("deleted_at", null).is("archived_at", null).order("starts_at");
  return (data ?? []) as unknown as VisitRow[];
}

export type MyDay = { visits: MyVisit[]; reportsDue: { id: number; project: string; projectId: number | null; checked_out_at: string }[] };

/** Today's visits for the signed-in person, and their checked-out visits (last 14 days) still without a report. */
export async function loadMyDay(user: CurrentUser): Promise<MyDay | null> {
  const db = await recordsDb();
  const people = await myEmployeeIds(db, user);
  if (!people.length) return null;
  const today = todayET();
  const [rows, past, settings] = await Promise.all([
    visitsFor(db, people, fromDateTimeLocalET(`${today}T00:00`), fromDateTimeLocalET(`${addDays(today, 1)}T00:00`)),
    visitsFor(db, people, fromDateTimeLocalET(`${addDays(today, -14)}T00:00`), fromDateTimeLocalET(`${addDays(today, 1)}T00:00`)),
    loadFieldDay(db),
  ]);
  const ids = [...new Set([...rows, ...past].map((v) => v.id))];
  const [{ data: reports }, pending, sites] = await Promise.all([
    ids.length ? db.from("job_reports").select("id, visit_id").in("visit_id", ids).is("deleted_at", null) : Promise.resolve({ data: [] }),
    openPendingByProject(db, rows.map((v) => v.project_id).filter((x): x is number => x !== null)),
    loadSiteCards(rows.map((v) => v.project_id).filter((x): x is number => x !== null)),
  ]);
  const reportOf = new Map(((reports ?? []) as { id: number; visit_id: number }[]).map((r) => [r.visit_id, r.id]));

  const visits = rows.map((v) => ({
    id: v.id,
    starts_at: v.starts_at,
    duration: Number(v.duration ?? 60),
    arrival_window: Number(v.arrival_window ?? 0),
    status: v.status ?? "Scheduled",
    project: v.projects?.title ?? (v.project_id ? `Project #${v.project_id}` : "No project"),
    projectId: v.project_id,
    // F21-b: the visit's own address when it has one (a survey at a new client), else the project's.
    address: mapAddress(v.address?.street || v.address?.city ? v.address : (v.projects?.job_address ?? null)),
    service: v.service_type,
    vehicle: v.vehicles?.title ?? null,
    instructions: v.instructions,
    access: v.access_notes,
    tools: (v.service_type && settings.service_lists[v.service_type]?.tools) || [],
    on_way_at: v.on_way_at,
    checked_in_at: v.checked_in_at,
    checked_out_at: v.checked_out_at,
    reportId: reportOf.get(v.id) ?? null,
    pending: v.project_id ? (pending.get(v.project_id)?.length ?? 0) : 0,
    site: v.project_id ? (sites.get(v.project_id) ?? null) : null,
  }));
  const reportsDue = past
    .filter((v) => v.checked_out_at && !reportOf.has(v.id))
    .map((v) => ({ id: v.id, project: v.projects?.title ?? `Visit #${v.id}`, projectId: v.project_id, checked_out_at: v.checked_out_at! }));
  return { visits, reportsDue };
}

export type Briefing = {
  reportId: number;
  title: string | null;
  date: string | null;
  result: string | null;
  reason: string | null;
  waitingOn: string | null;
  done: string | null;
  missing: string | null;
  bring: string | null;
  access: string | null;
  photos: { name: string; url: string }[];
};

/** The project's last Job Report before this visit: what the next tech needs to know (§D briefing). */
export async function loadBriefing(db: SupabaseClient, projectId: number, before: string, visitId: number): Promise<Briefing | null> {
  const { data } = await db
    .from("job_reports")
    .select("id, title, date, result, partial_reason, waiting_on, report, missing_items, bring_next, access_info, visit_id")
    .eq("project_id", projectId)
    .lte("date", before.slice(0, 10))
    .is("deleted_at", null)
    .order("date", { ascending: false })
    .order("id", { ascending: false })
    .limit(3);
  const r = ((data ?? []) as { id: number; title: string | null; date: string | null; result: string | null; partial_reason: string | null; waiting_on: string | null; report: string | null; missing_items: string | null; bring_next: string | null; access_info: string | null; visit_id: number | null }[]).find(
    (x) => x.visit_id !== visitId,
  );
  if (!r) return null;
  const { data: files } = await db.from("attachments").select("provider_path, file_name, mime_type").eq("table_name", "job_reports").eq("record_id", r.id).is("deleted_at", null).like("mime_type", "image/%").order("sort_order").limit(6);
  const list = (files ?? []) as { provider_path: string; file_name: string }[];
  const urls = list.length ? await fileUrls(db, list.map((f) => f.provider_path)) : new Map<string, string>();
  return {
    reportId: r.id,
    title: r.title,
    date: r.date,
    result: r.result,
    reason: r.partial_reason,
    waitingOn: r.waiting_on,
    done: r.report,
    missing: r.missing_items,
    bring: r.bring_next,
    access: r.access_info,
    photos: list.flatMap((f) => (urls.get(f.provider_path) ? [{ name: f.file_name, url: urls.get(f.provider_path)! }] : [])),
  };
}
