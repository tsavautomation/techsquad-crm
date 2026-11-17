import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { CurrentUser } from "@/lib/auth/session";
import { fromDateTimeLocalET } from "@/lib/dates";
import { loadFieldDay } from "@/lib/field-day/return-card";
import { loadAssignments, loadOverrides, loadSchedules } from "@/lib/payroll/load";
import { periodFor, scheduleInForce, type Period, type Schedule } from "@/lib/payroll/periods";
import { addDays } from "@/lib/schedule/dates";
import { needsApproval, type ApprovalRow } from "./period-approval";
import { OPEN_STATUSES } from "./overtime-rules";

// TS-c: what the screens and the actions read about a person's period approval (the pure rules are in
// period-approval.ts).

export const canApproveTimesheets = (user: Pick<CurrentUser, "isSysadmin" | "permissions">) => user.isSysadmin || user.permissions.has("administrative.timesheets.approve");

/** The time-clock groups whose timesheets need the approval (Admin › Field day; the Field by default). */
export async function approvalGroups(db: SupabaseClient): Promise<string[]> {
  return (await loadFieldDay(db)).approval_groups;
}

export type PersonPeriod = { schedule: Schedule; period: Period };

/** Each person's pay-schedule period containing `day` (people on no schedule that day are left out). */
export async function periodsAt(db: SupabaseClient, employeeIds: number[], day: string): Promise<Map<number, PersonPeriod>> {
  const out = new Map<number, PersonPeriod>();
  if (!employeeIds.length) return out;
  const [links, schedules] = await Promise.all([loadAssignments(db, employeeIds), loadSchedules(db)]);
  const byId = new Map(schedules.map((s) => [s.id, s]));
  const overrides = new Map(await Promise.all([...new Set(links.map((l) => l.schedule_id).filter((x): x is number => x !== null))].map(async (id) => [id, await loadOverrides(db, id)] as const)));
  for (const id of employeeIds) {
    const scheduleId = scheduleInForce(links, id, day);
    const schedule = scheduleId === null ? undefined : byId.get(scheduleId);
    if (!schedule) continue;
    out.set(id, { schedule, period: periodFor(schedule, day, overrides.get(schedule.id)) });
  }
  return out;
}

export type ApprovalRowWithNames = ApprovalRow & { id: number; approver: string | null; reopener: string | null };

/** The stored approval rows (Approved / Reopened) of these people whose period contains `day`, with the approver's name. */
export async function loadApprovalsAt(db: SupabaseClient, employeeIds: number[], day: string): Promise<Map<number, ApprovalRowWithNames>> {
  if (!employeeIds.length) return new Map();
  const { data } = await db
    .from("timesheet_periods")
    .select("id, employee_id, schedule_id, starts_on, ends_on, status, minutes_at_approval, approved_by, approved_at, reopened_by, reopened_at, reopen_reason")
    .in("employee_id", employeeIds)
    .lte("starts_on", day)
    .gte("ends_on", day);
  const rows = (data ?? []) as (ApprovalRow & { id: number })[];
  const userIds = [...new Set(rows.flatMap((r) => [r.approved_by, r.reopened_by]).filter((x): x is string => Boolean(x)))];
  const { data: profiles } = userIds.length ? await db.from("profiles").select("id, first_name, last_name, email").in("id", userIds) : { data: [] };
  const name = new Map(((profiles ?? []) as { id: string; first_name: string | null; last_name: string | null; email: string }[]).map((p) => [p.id, [p.first_name, p.last_name].filter(Boolean).join(" ") || p.email]));
  return new Map(rows.map((r) => [r.employee_id, { ...r, approver: r.approved_by ? (name.get(r.approved_by) ?? null) : null, reopener: r.reopened_by ? (name.get(r.reopened_by) ?? null) : null }]));
}

/** Per person: pending correction requests (F22) whose time falls between the two days (both included). */
export async function loadPendingCorrections(db: SupabaseClient, employeeIds: number[], from: string, to: string): Promise<Map<number, number>> {
  const out = new Map<number, number>();
  if (!employeeIds.length) return out;
  const { data } = await db.from("time_corrections").select("employee_id").eq("status", "pending").in("employee_id", employeeIds).gte("requested_at", fromDateTimeLocalET(`${from}T00:00`)).lt("requested_at", fromDateTimeLocalET(`${addDays(to, 1)}T00:00`));
  for (const id of employeeIds) out.set(id, 0);
  for (const c of (data ?? []) as { employee_id: number }[]) out.set(c.employee_id, (out.get(c.employee_id) ?? 0) + 1);
  return out;
}

/** OT-b / TO-a: what else holds a period: overtime days still open and time-off requests pending, by person, in [from, to]. */
export type Holds = { overtime: { employee_id: number; day: string }[]; timeOff: { employee_id: number; starts_on: string; ends_on: string }[] };
export async function loadHolds(db: SupabaseClient, employeeIds: number[], from: string, to: string): Promise<Holds> {
  if (!employeeIds.length) return { overtime: [], timeOff: [] };
  const [{ data: ot }, { data: off }] = await Promise.all([
    db.from("overtime_days").select("employee_id, day").in("employee_id", employeeIds).in("status", OPEN_STATUSES).gte("day", from).lte("day", to),
    db.from("time_off_requests").select("employee_id, starts_on, ends_on").in("employee_id", employeeIds).eq("status", "pending").lte("starts_on", to).gte("ends_on", from),
  ]);
  return { overtime: (ot ?? []) as Holds["overtime"], timeOff: (off ?? []) as Holds["timeOff"] };
}
/** How many of each hold fall in one person's period. */
export function holdsIn(h: Holds, employeeId: number, from: string, to: string): { overtimeOpen: number; timeOffPending: number } {
  return { overtimeOpen: h.overtime.filter((o) => o.employee_id === employeeId && o.day >= from && o.day <= to).length, timeOffPending: h.timeOff.filter((r) => r.employee_id === employeeId && r.starts_on <= to && r.ends_on >= from).length };
}

/** True when this person's approved period contains `day`, so its entries are locked. */
export async function periodApprovedFor(db: SupabaseClient, employeeId: number, day: string): Promise<boolean> {
  const { count } = await db.from("timesheet_periods").select("id", { count: "exact", head: true }).eq("employee_id", employeeId).eq("status", "Approved").lte("starts_on", day).gte("ends_on", day);
  return (count ?? 0) > 0;
}

/** The people whose approved period contains `day` (for the Day view's locks). */
export async function approvedEmployeesFor(db: SupabaseClient, day: string): Promise<Set<number>> {
  const { data } = await db.from("timesheet_periods").select("employee_id").eq("status", "Approved").lte("starts_on", day).gte("ends_on", day);
  return new Set(((data ?? []) as { employee_id: number }[]).map((r) => r.employee_id));
}

/** Whether a person's group goes through the approval, from the settings. */
export async function approvalRequiredFor(db: SupabaseClient, group: string | null | undefined): Promise<boolean> {
  return needsApproval(group, await approvalGroups(db));
}
