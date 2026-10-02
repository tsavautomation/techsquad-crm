import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { CurrentUser } from "@/lib/auth/session";
import { fromDateTimeLocalET, todayET } from "@/lib/dates";
import { mapAddress, myEmployeeIds } from "@/lib/field-day/load";
import { loadFieldDay } from "@/lib/field-day/return-card";
import type { Address } from "@/lib/records/values";
import { addDays } from "@/lib/schedule/dates";
import { clockDay, placeFor, type EntryKind, type Geo, type TimeEntry } from "./clock";
import { geocode } from "./geocode";

// P2: writing a time entry (clock in / out, visit steps) with where the phone was, and reading a day.

export type Recorded = { ok: true; entry: TimeEntry } | { ok: false; message: string };

/** Today's job sites for an employee: the job addresses of their visits (positions looked up once). */
async function todaysSites(db: SupabaseClient, employeeId: number, today: string): Promise<Geo[]> {
  const from = fromDateTimeLocalET(`${today}T00:00`);
  const to = fromDateTimeLocalET(`${addDays(today, 1)}T00:00`);
  const { data: team } = await db.from("visits_team").select("record_id").eq("target_id", employeeId);
  const ids = ((team ?? []) as { record_id: number }[]).map((x) => x.record_id);
  const or = ids.length ? `technician_id.eq.${employeeId},id.in.(${ids.join(",")})` : `technician_id.eq.${employeeId}`;
  const { data } = await db.from("visits").select("projects(job_address)").or(or).gte("starts_at", from).lt("starts_at", to).neq("status", "Cancelled").is("deleted_at", null).limit(6);
  const addresses = [...new Set(((data ?? []) as unknown as { projects: { job_address: Address | null } | null }[]).map((v) => mapAddress(v.projects?.job_address ?? null)).filter((a): a is string => Boolean(a)))];
  return (await Promise.all(addresses.map((a) => geocode(db, a)))).filter((g): g is Geo => g !== null);
}

/** The job site of one visit. */
export async function visitSite(db: SupabaseClient, visitId: number): Promise<Geo | null> {
  const { data } = await db.from("visits").select("projects(job_address)").eq("id", visitId).maybeSingle();
  const address = mapAddress(((data as unknown as { projects: { job_address: Address | null } | null } | null)?.projects?.job_address) ?? null);
  return geocode(db, address);
}

/**
 * Save an entry for the signed-in person (their Employee record is found by email). `here` is the
 * phone's position at that moment, or null when it wasn't available; the entry is saved either way.
 */
export async function recordEntry(db: SupabaseClient, user: CurrentUser, kind: EntryKind, here: Geo | null, visitId: number | null = null): Promise<Recorded> {
  const [employeeId] = await myEmployeeIds(db, user);
  if (!employeeId) return { ok: false, message: "Your login isn't linked to an Employee record (same email). Ask the office to fix the employee's email." };
  const settings = (await loadFieldDay(db)).time_clock;
  const office = settings.office_lat !== null && settings.office_lng !== null ? { lat: settings.office_lat, lng: settings.office_lng } : null;
  const sites = visitId ? [await visitSite(db, visitId)].filter((g): g is Geo => g !== null) : await todaysSites(db, employeeId, todayET());
  const where = placeFor(here, office, sites, settings.radius_m);
  const { data, error } = await db
    .from("time_entries")
    .insert({ employee_id: employeeId, user_id: user.id, kind, visit_id: visitId, lat: here?.lat ?? null, lng: here?.lng ?? null, accuracy_m: here?.accuracy_m ?? null, place: where.place, distance_m: where.distance_m })
    .select("id, kind, at, visit_id, place, distance_m, lat, lng")
    .single();
  if (error) return { ok: false, message: error.message };
  return { ok: true, entry: data as TimeEntry };
}

/** An employee's entries for one Eastern-time day, in time order. */
export async function loadDayEntries(db: SupabaseClient, employeeId: number, day: string): Promise<TimeEntry[]> {
  const { data } = await db
    .from("time_entries")
    .select("id, kind, at, visit_id, place, distance_m, lat, lng")
    .eq("employee_id", employeeId)
    .gte("at", fromDateTimeLocalET(`${day}T00:00`))
    .lt("at", fromDateTimeLocalET(`${addDays(day, 1)}T00:00`))
    .is("deleted_at", null)
    .order("at");
  return (data ?? []) as TimeEntry[];
}

/** The signed-in person's clock for today (null when no Employee record matches their login). */
export async function myClockToday(db: SupabaseClient, user: CurrentUser, now = Date.now()) {
  const [employeeId] = await myEmployeeIds(db, user);
  if (!employeeId) return null;
  const today = todayET(new Date(now));
  const [entries, { data: emp }] = await Promise.all([loadDayEntries(db, employeeId, today), db.from("employees").select("clock_group").eq("id", employeeId).maybeSingle()]);
  return { employeeId, group: ((emp as { clock_group: string | null } | null)?.clock_group ?? "Field") as "Field" | "Office", day: clockDay(entries, now) };
}
