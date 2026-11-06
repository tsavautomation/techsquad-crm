import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { RateRow } from "@/lib/costing/engine";
import type { PayOptions } from "./engine";
import { limitAt, type HoursRow, type Trip } from "./overtime";

// OT Overtime: what the pay line needs besides the pay rates: the overtime rates, the regular hours per group
// and per person (both with history) and the work trips. Read with the viewer's own permissions: the overtime
// rates only with Job costing (empty otherwise), the rest with Employees › View all.

export type OvertimeRate = RateRow & { id: number; note: string | null };
export type HoursRowWithId = HoursRow & { id: number; note: string | null };
export type GroupHoursRow = HoursRowWithId & { clock_group: string };
export type TripRow = Trip & { id: number; employee_id: number; project_id: number | null; destination: string | null; note: string | null; premium_pct: number };

export type OvertimeData = {
  overtimeRates: Map<number, OvertimeRate[]>;
  groupHours: Map<string, HoursRowWithId[]>;
  personHours: Map<number, HoursRowWithId[]>;
  trips: Map<number, TripRow[]>;
};

/** Every group's regular-hours history, newest first. */
export async function loadGroupHours(db: SupabaseClient): Promise<GroupHoursRow[]> {
  const { data } = await db.from("clock_group_hours").select("id, clock_group, daily_minutes, weekly_minutes, effective_from, note").order("effective_from", { ascending: false });
  return (data ?? []) as GroupHoursRow[];
}

export async function loadOvertimeRates(db: SupabaseClient, employeeIds: number[]): Promise<OvertimeRate[]> {
  if (!employeeIds.length) return [];
  const { data } = await db.from("employee_overtime_rates").select("id, employee_id, hourly_rate, effective_from, note").in("employee_id", employeeIds).order("effective_from", { ascending: false });
  return ((data ?? []) as OvertimeRate[]).map((r) => ({ ...r, hourly_rate: Number(r.hourly_rate) }));
}

export async function loadPersonHours(db: SupabaseClient, employeeIds: number[]): Promise<(HoursRowWithId & { employee_id: number })[]> {
  if (!employeeIds.length) return [];
  const { data } = await db.from("employee_daily_hours").select("id, employee_id, daily_minutes, weekly_minutes, effective_from, note").in("employee_id", employeeIds).order("effective_from", { ascending: false });
  return (data ?? []) as (HoursRowWithId & { employee_id: number })[];
}

/** The trips of some people touching the range (or all of theirs when no range is given), by start date. */
export async function loadTrips(db: SupabaseClient, employeeIds: number[], from?: string, to?: string): Promise<TripRow[]> {
  if (!employeeIds.length) return [];
  let q = db.from("work_trips").select("id, employee_id, starts_on, ends_on, premium_pct, project_id, destination, note").in("employee_id", employeeIds).order("starts_on", { ascending: false });
  if (from) q = q.gte("ends_on", from);
  if (to) q = q.lte("starts_on", to);
  const { data } = await q;
  return ((data ?? []) as TripRow[]).map((t) => ({ ...t, premium_pct: Number(t.premium_pct) }));
}

export async function loadOvertime(db: SupabaseClient, employeeIds: number[], from: string, to: string): Promise<OvertimeData> {
  const [overtimeRates, groups, personRows, trips] = await Promise.all([loadOvertimeRates(db, employeeIds), loadGroupHours(db), loadPersonHours(db, employeeIds), loadTrips(db, employeeIds, from, to)]);
  return {
    overtimeRates: Map.groupBy(overtimeRates, (r) => r.employee_id),
    groupHours: Map.groupBy(groups, (g) => g.clock_group),
    personHours: Map.groupBy(personRows, (r) => r.employee_id),
    trips: Map.groupBy(trips, (t) => t.employee_id),
  };
}

/** The pay-line options of one person (their group's limits, their own override, their overtime rates and trips). */
export function overtimeOptions(data: OvertimeData, employeeId: number, clockGroup: string | null | undefined): PayOptions {
  const group = data.groupHours.get(clockGroup ?? "Field") ?? [];
  const own = data.personHours.get(employeeId) ?? [];
  return { overtimeRates: data.overtimeRates.get(employeeId) ?? [], limitFor: (day) => limitAt(group, own, day), trips: data.trips.get(employeeId) ?? [] };
}
