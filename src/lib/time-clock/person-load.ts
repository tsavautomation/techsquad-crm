import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { fromDateTimeLocalET, toDateTimeLocalET } from "@/lib/dates";
import { loadAssignments, loadOverrides, loadSchedule } from "@/lib/payroll/load";
import { nextPeriod, periodFor, previousPeriod, scheduleInForce, type Period, type Schedule } from "@/lib/payroll/periods";
import { addDays } from "@/lib/schedule/dates";
import { CLOCK_GROUPS, type EntryKind, type Place } from "./clock";
import { personDays, type DayOff, type PersonDay } from "./person-sheet";
import { mondayOf, type SheetEntry } from "./timesheet";

// TS-b Person panel: what the page reads for one person. The period is the person's pay-schedule period
// containing the asked day (PS-a); with no schedule in force, the Monday-to-Sunday week.

export type PanelPerson = { id: number; title: string; clock_group: string; status: string | null };

export type PanelRange = {
  from: string;
  to: string;
  /** The pay schedule the range comes from, or null for a plain week. */
  schedule: Schedule | null;
  period: Period | null;
  prevDay: string;
  nextDay: string;
};

/** The period (or week) of `person` that contains `day`. */
export async function panelRange(db: SupabaseClient, employeeId: number, day: string): Promise<PanelRange> {
  const links = await loadAssignments(db, [employeeId]);
  const scheduleId = scheduleInForce(links, employeeId, day);
  const schedule = scheduleId === null ? null : await loadSchedule(db, scheduleId);
  if (schedule) {
    const overrides = await loadOverrides(db, schedule.id);
    const period = periodFor(schedule, day, overrides);
    return { from: period.starts_on, to: period.ends_on, schedule, period, prevDay: previousPeriod(period, schedule, overrides).starts_on, nextDay: nextPeriod(period, schedule, overrides).starts_on };
  }
  const monday = mondayOf(day);
  return { from: monday, to: addDays(monday, 6), schedule: null, period: null, prevDay: addDays(monday, -7), nextDay: addDays(monday, 7) };
}

/** The people the panel walks through with Previous / Next: everyone who must clock in and still works, by name. Part 4 narrows it per approver. */
export async function panelPeople(db: SupabaseClient, group: string): Promise<PanelPerson[]> {
  let q = db.from("employees").select("id, title, clock_group, status, must_clock_in").is("deleted_at", null).in("status", ["Active", "Reports"]).eq("must_clock_in", true).order("title");
  if ((CLOCK_GROUPS as readonly string[]).includes(group)) q = q.eq("clock_group", group);
  const { data } = await q;
  return ((data ?? []) as { id: number; title: string | null; clock_group: string | null; status: string | null }[]).map((p) => ({ id: p.id, title: p.title ?? `#${p.id}`, clock_group: p.clock_group ?? "Field", status: p.status }));
}

export type EntryRow = SheetEntry & {
  employee_id: number;
  visit_id: number | null;
  place: Place;
  distance_m: number | null;
  lat: number | null;
  lng: number | null;
  pay_period_id: number | null;
  corrected_at: string | null;
  original_at: string | null;
  visits: { projects: { title: string | null } | null } | null;
};

/** One day's "On my way" / "Arrived at the job" / "Left the job" events (never part of the total). */
export type DayEvent = { id: number; kind: EntryKind; at: string; project: string | null; place: Place; lat: number | null; lng: number | null; distance_m: number | null };

export type PanelData = {
  days: PersonDay[];
  /** Every clock entry of the range by id (for the locations, corrections and notes of a shift). */
  entries: Map<number, EntryRow>;
  events: Map<string, DayEvent[]>;
  /** Mondays of the range whose week is approved (TC-h): those days are locked. */
  approvedMondays: Set<string>;
  /** Titles of the jobs set on the shifts. */
  projectTitles: Map<number, string>;
};

export async function loadPanel(db: SupabaseClient, employeeId: number, range: PanelRange, now: number, today: string): Promise<PanelData> {
  const mondays = new Set<string>();
  for (let d = range.from; d <= range.to; d = addDays(d, 1)) mondays.add(mondayOf(d));
  const [{ data: ent }, { data: off }, { data: weeks }] = await Promise.all([
    db
      .from("time_entries")
      .select("id, employee_id, kind, at, visit_id, place, distance_m, lat, lng, note, reviewed_at, auto_closed, needs_adjustment, project_id, manager_note, pay_period_id, corrected_at, original_at, visits:visit_id(projects(title))")
      .eq("employee_id", employeeId)
      .gte("at", fromDateTimeLocalET(`${range.from}T00:00`))
      .lt("at", fromDateTimeLocalET(`${addDays(range.to, 1)}T06:00`)) // a shift may end after midnight
      .is("deleted_at", null)
      .order("at"),
    db.from("time_off_entries").select("id, day, kind, paid, minutes, note").eq("employee_id", employeeId).gte("day", range.from).lte("day", range.to).is("deleted_at", null),
    db.from("timesheet_weeks").select("monday").eq("employee_id", employeeId).eq("status", "Approved").in("monday", [...mondays]),
  ]);
  const rows = (ent ?? []) as unknown as EntryRow[];
  const days = personDays(rows, range.from, range.to, (off ?? []) as DayOff[], now, today);
  const events = new Map<string, DayEvent[]>();
  for (const e of rows) {
    if (e.kind === "clock_in" || e.kind === "clock_out") continue;
    const day = toDateTimeLocalET(e.at).slice(0, 10);
    const list = events.get(day) ?? [];
    list.push({ id: e.id, kind: e.kind, at: e.at, project: e.visits?.projects?.title ?? null, place: e.place, lat: e.lat, lng: e.lng, distance_m: e.distance_m });
    events.set(day, list);
  }
  const projectIds = [...new Set(rows.map((r) => r.project_id).filter((x): x is number => typeof x === "number"))];
  const { data: projects } = projectIds.length ? await db.from("projects").select("id, title").in("id", projectIds) : { data: [] };
  return {
    days,
    entries: new Map(rows.map((r) => [r.id, r])),
    events,
    approvedMondays: new Set(((weeks ?? []) as { monday: string }[]).map((w) => w.monday)),
    projectTitles: new Map(((projects ?? []) as { id: number; title: string | null }[]).map((p) => [p.id, p.title ?? `#${p.id}`])),
  };
}
