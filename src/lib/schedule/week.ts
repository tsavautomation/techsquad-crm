import "server-only";
import { fromDateTimeLocalET, todayET, toDateTimeLocalET } from "@/lib/dates";
import { recordsDb } from "@/lib/records/data";
import type { Address } from "@/lib/records/values";
import { getTable } from "@/registry";
import { technicianColors } from "./colors";
import { addDays, weekStartOf } from "./dates";

// One week of the calendar (F1), Sunday to Saturday in Eastern time, as seen by the signed-in user.

export type CalVisit = {
  id: number;
  project: string;
  address: string | null;
  /** Eastern wall-clock start, "YYYY-MM-DDTHH:mm". */
  start: string;
  duration: number;
  window: number;
  techId: number | null;
  team: number[];
  status: string;
  /** From Google Calendar, project not recognised yet (Schedule › Needs a project). */
  noProject: boolean;
  /** The technician's colour (Google legend or palette); the status colour when nobody is assigned. */
  color: string;
  statusColor: string;
  service: string | null;
  instructions: string | null;
};
export type CalPerson = { id: number; name: string; color: string };

type Row = {
  id: number;
  title: string | null;
  starts_at: string;
  duration: string | null;
  arrival_window: string | null;
  status: string | null;
  service_type: string | null;
  instructions: string | null;
  technician_id: number | null;
  project_id: number | null;
  visits_team: { target_id: number }[];
  projects: { title: string | null; job_address: Address | null } | null;
};

const line = (a: Address | null) => (a ? [a.street, a.city].filter(Boolean).join(", ") : "") || null;

export async function loadWeek(week: string | undefined): Promise<{ weekStart: string; visits: CalVisit[]; people: CalPerson[] }> {
  const weekStart = weekStartOf(week && /^\d{4}-\d{2}-\d{2}$/.test(week) ? week : todayET());
  const from = fromDateTimeLocalET(`${weekStart}T00:00`);
  const to = fromDateTimeLocalET(`${addDays(weekStart, 7)}T00:00`);
  const db = await recordsDb();
  const [{ data }, { data: emp }] = await Promise.all([
    db
      .from("visits")
      .select("id, title, starts_at, duration, arrival_window, status, service_type, instructions, technician_id, project_id, visits_team(target_id), projects(title, job_address)")
      .gte("starts_at", from)
      .lt("starts_at", to)
      .is("deleted_at", null)
      .is("archived_at", null)
      .order("starts_at"),
    db.from("employees").select("id, title, status, departments").is("deleted_at", null).order("title"),
  ]);
  const statusField = getTable("visits").fields.find((f) => f.name === "status")!;
  const rows = (data ?? []) as unknown as Row[];
  const staff = (emp ?? []) as { id: number; title: string | null; status: string | null; departments: string[] | null }[];
  const colors = await technicianColors([...staff.map((e) => e.id), ...rows.flatMap((v) => [v.technician_id, ...v.visits_team.map((t) => t.target_id)]).filter((x): x is number => x !== null)]);
  const visits: CalVisit[] = rows.map((v) => ({
    id: v.id,
    // F15: a visit from Google Calendar that found no project keeps Google's title and shows grey.
    project: v.projects?.title ?? (v.project_id ? `Project #${v.project_id}` : v.title || "No project"),
    noProject: !v.project_id,
    address: line(v.projects?.job_address ?? null),
    start: toDateTimeLocalET(v.starts_at),
    duration: Number(v.duration ?? 60),
    window: Number(v.arrival_window ?? 0),
    techId: v.technician_id,
    team: v.visits_team.map((t) => t.target_id),
    status: v.status ?? "Scheduled",
    color: (v.technician_id && colors.get(v.technician_id)) || (!v.project_id && v.status !== "Cancelled" ? "#9ca3af" : statusField.options?.find((o) => o.value === v.status)?.color ?? "#2563eb"),
    statusColor: statusField.options?.find((o) => o.value === v.status)?.color ?? "#2563eb",
    service: v.service_type,
    instructions: v.instructions,
  }));
  // Lanes: people who do field work (active or freelance, with a department) plus anyone booked this week.
  const booked = new Set(visits.flatMap((v) => [v.techId, ...v.team]));
  const people = staff.filter((e) => booked.has(e.id) || (e.status !== "Inactive" && (e.departments?.length ?? 0) > 0)).map((e) => ({ id: e.id, name: e.title ?? `#${e.id}`, color: colors.get(e.id) ?? "#64748b" }));
  return { weekStart, visits, people };
}
