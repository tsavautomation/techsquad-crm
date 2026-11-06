import type { CurrentUser } from "@/lib/auth/session";
import { canSeeCosting } from "@/lib/costing/load";
import { todayET } from "@/lib/dates";
import { loadTrips } from "@/lib/payroll/overtime-load";
import { projectLabel } from "@/lib/projects/label";
import { recordsDb } from "@/lib/records/data";
import { getT } from "@/i18n/server";
import { WorkTripsForm } from "./work-trips-form";

// OT Work trips (Fred 2026-11-05): a person's trips on their Employee page. Every hour of the days inside (regular
// and overtime) earns the premium %; the Timesheet tags those days and Pay periods shows the premium.
// People who may change Employees, or see Job costing, set them; Employees › View all sees them.

export async function WorkTripsPanel({ employeeId, user }: { employeeId: number; user: CurrentUser }) {
  const canEdit = canSeeCosting(user) || user.permissions.has("administrative.employees.modify");
  if (!canEdit && !user.permissions.has("administrative.employees.view_all")) return null;
  const tr = await getT();
  const db = await recordsDb();
  const [trips, { data: emp }] = await Promise.all([loadTrips(db, [employeeId]), canEdit ? db.from("employees").select("id, title").is("deleted_at", null).in("status", ["Active", "Reports"]).eq("must_clock_in", true).neq("id", employeeId).order("title") : Promise.resolve({ data: [] })]);
  const projectIds = [...new Set(trips.map((t) => t.project_id).filter((x): x is number => x !== null))];
  const { data: projects } = projectIds.length ? await db.from("projects").select("id, title").in("id", projectIds) : { data: [] };
  const titles = new Map(((projects ?? []) as { id: number; title: string | null }[]).map((p) => [p.id, projectLabel(p.title, p.id)]));
  const today = todayET();

  return (
    <section id="work-trips" className="mb-4 scroll-mt-20 rounded-2xl border bg-card px-[18px] py-4 shadow-card">
      <h2 className="text-[15px] font-semibold tracking-tight">{tr("Work trips")}</h2>
      <p className="text-xs text-text-2">{tr("Every hour of the days inside a trip, regular and overtime, earns the premium. Paid time off does not.")}</p>
      <WorkTripsForm employeeId={employeeId} today={today} canEdit={canEdit} trips={trips.map((t) => ({ id: t.id, starts_on: t.starts_on, ends_on: t.ends_on, premium_pct: t.premium_pct, project_id: t.project_id, project: t.project_id !== null ? (titles.get(t.project_id) ?? `#${t.project_id}`) : null, destination: t.destination, note: t.note }))} people={((emp ?? []) as { id: number; title: string | null }[]).map((e) => ({ id: e.id, name: e.title ?? `#${e.id}` }))} />
    </section>
  );
}
