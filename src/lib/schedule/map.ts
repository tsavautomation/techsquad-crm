import { initialsOf } from "./initials";
import { PIN_DONE, PIN_ON_SITE, PIN_PLANNED } from "./pins";
import "server-only";
import { fromDateTimeLocalET, todayET, toDateTimeLocalET } from "@/lib/dates";
import { mapAddress } from "@/lib/field-day/load";
import { loadFieldDay } from "@/lib/field-day/return-card";
import { recordsDb } from "@/lib/records/data";
import type { Address } from "@/lib/records/values";
import { geocode } from "@/lib/time-clock/geocode";
import { getTable } from "@/registry";
import { addDays } from "./dates";

// One day of the calendar on a map (F8, SPEC §9.1 F8-a): the visits of that Eastern day with their job
// address turned into a position (same geocodes cache as the time clock), the technician going and
// the people also going. Row-level security decides which visits the person sees.

export type MapStop = {
  id: number;
  href: string;
  project: string;
  projectId: number | null;
  address: string | null;
  lat: number | null;
  lng: number | null;
  /** Eastern wall-clock start, "YYYY-MM-DDTHH:mm". */
  start: string;
  duration: number;
  techId: number | null;
  techName: string | null;
  team: { id: number; name: string }[];
  /** Fleet title of the van going (F10-a). */
  vehicle: string | null;
  status: string;
  color: string;
  service: string | null;
  /** 1, 2, 3… in the technician's day (by start time). */
  order: number;
  /** "CG" for Carlos Gurgel: what the pin shows, so the office sees who is where (Fred 2026-10-04). Null without a technician. */
  initials: string | null;
};
export type MapPerson = { id: number; name: string };
export type MapOffice = { lat: number; lng: number; address: string };

type Row = {
  id: number;
  starts_at: string;
  duration: string | null;
  status: string | null;
  checked_in_at: string | null;
  checked_out_at: string | null;
  service_type: string | null;
  technician_id: number | null;
  project_id: number | null;
  visits_team: { target_id: number }[];
  vehicles: { title: string | null } | null;
  projects: { title: string | null; job_address: Address | null } | null;
};

export async function loadMapDay(date: string | undefined): Promise<{ date: string; stops: MapStop[]; people: MapPerson[]; office: MapOffice | null }> {
  const day = date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : todayET();
  const from = fromDateTimeLocalET(`${day}T00:00`);
  const to = fromDateTimeLocalET(`${addDays(day, 1)}T00:00`);
  const db = await recordsDb();
  const [{ data }, { data: emp }, settings] = await Promise.all([
    db
      .from("visits")
      .select("id, starts_at, duration, status, service_type, technician_id, project_id, checked_in_at, checked_out_at, visits_team(target_id), vehicles(title), projects(title, job_address)")
      .gte("starts_at", from)
      .lt("starts_at", to)
      .is("deleted_at", null)
      .is("archived_at", null)
      .neq("status", "Cancelled")
      .order("starts_at"),
    db.from("employees").select("id, title").is("deleted_at", null),
    loadFieldDay(db),
  ]);
  const names = new Map(((emp ?? []) as { id: number; title: string | null }[]).map((e) => [e.id, e.title ?? `#${e.id}`]));
  const rows = (data ?? []) as unknown as Row[];

  // Positions: one lookup per distinct address (cached in geocodes after the first time).
  const addresses = [...new Set(rows.map((r) => mapAddress(r.projects?.job_address ?? null)).filter((a): a is string => Boolean(a)))];
  const positions = new Map(await Promise.all(addresses.map(async (a) => [a, await geocode(db, a)] as const)));

  const statusField = getTable("visits").fields.find((f) => f.name === "status")!;
  const perTech = new Map<number | null, number>();
  const stops: MapStop[] = rows.map((r) => {
    const address = mapAddress(r.projects?.job_address ?? null);
    const pos = address ? positions.get(address) : null;
    const order = (perTech.get(r.technician_id) ?? 0) + 1;
    perTech.set(r.technician_id, order);
    return {
      id: r.id,
      href: `/schedule/visits/${r.id}`,
      project: r.projects?.title ?? (r.project_id ? `Project #${r.project_id}` : "No project"),
      projectId: r.project_id,
      address,
      lat: pos?.lat ?? null,
      lng: pos?.lng ?? null,
      start: toDateTimeLocalET(r.starts_at),
      duration: Number(r.duration ?? 60),
      techId: r.technician_id,
      techName: r.technician_id ? (names.get(r.technician_id) ?? null) : null,
      team: r.visits_team.map((t) => ({ id: t.target_id, name: names.get(t.target_id) ?? `#${t.target_id}` })),
      vehicle: r.vehicles?.title ?? null,
      status: r.status ?? "Scheduled",
      // Pin colour by the day's progress (Fred 2026-10-04): blue until the check-in, green on site, red after the check-out; a cancelled visit keeps its status colour.
      color: r.status === "Cancelled" ? (statusField.options?.find((o) => o.value === r.status)?.color ?? "#9ca3af") : r.checked_out_at ? PIN_DONE : r.checked_in_at ? PIN_ON_SITE : PIN_PLANNED,
      service: r.service_type,
      order,
      initials: r.technician_id ? initialsOf(names.get(r.technician_id) ?? null) : null,
    };
  });
  const booked = [...new Set(stops.flatMap((s) => [s.techId, ...s.team.map((t) => t.id)]).filter((id): id is number => id !== null))];
  const people = booked.map((id) => ({ id, name: names.get(id) ?? `#${id}` })).sort((a, b) => a.name.localeCompare(b.name));
  const tc = settings.time_clock;
  const office = tc.office_lat !== null && tc.office_lng !== null ? { lat: tc.office_lat, lng: tc.office_lng, address: tc.office_address } : null;
  return { date: day, stops, people, office };
}
