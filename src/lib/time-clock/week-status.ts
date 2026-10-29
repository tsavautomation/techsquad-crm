import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { CurrentUser } from "@/lib/auth/session";
import { fromDateTimeLocalET } from "@/lib/dates";
import { addDays } from "@/lib/schedule/dates";
import { overtimeMarker } from "./overtime-engine";
import { mondayOf } from "./timesheet";
import type { WeekRow } from "./week-approval";

// TC-h: what the screens and the actions read about a week's approval (the pure rules are in week-approval.ts).

export const canApproveWeeks = (user: Pick<CurrentUser, "isSysadmin" | "permissions">) => user.isSysadmin || user.permissions.has("administrative.timesheets.approve");

export type WeekRowWithNames = WeekRow & { id: number; approver: string | null; reopener: string | null };

/** The stored week rows (Approved / Reopened) for these people and this Monday, with the approver's name. */
export async function loadWeekRows(db: SupabaseClient, monday: string, employeeIds: number[]): Promise<Map<number, WeekRowWithNames>> {
  if (!employeeIds.length) return new Map();
  const { data } = await db
    .from("timesheet_weeks")
    .select("id, employee_id, monday, status, minutes_at_approval, approved_by, approved_at, reopened_by, reopened_at, reopen_reason")
    .eq("monday", monday)
    .in("employee_id", employeeIds);
  const rows = (data ?? []) as (WeekRow & { id: number })[];
  const userIds = [...new Set(rows.flatMap((r) => [r.approved_by, r.reopened_by]).filter((x): x is string => Boolean(x)))];
  const { data: profiles } = userIds.length ? await db.from("profiles").select("id, first_name, last_name, email").in("id", userIds) : { data: [] };
  const name = new Map(((profiles ?? []) as { id: string; first_name: string | null; last_name: string | null; email: string }[]).map((p) => [p.id, [p.first_name, p.last_name].filter(Boolean).join(" ") || p.email]));
  return new Map(rows.map((r) => [r.employee_id, { ...r, approver: r.approved_by ? (name.get(r.approved_by) ?? null) : null, reopener: r.reopened_by ? (name.get(r.reopened_by) ?? null) : null }]));
}

/** Per person: pending correction requests whose time falls in the week, and whether an overtime task is still open. */
export async function loadWeekPending(db: SupabaseClient, monday: string, employeeIds: number[]): Promise<Map<number, { corrections: number; overtime: boolean }>> {
  const out = new Map<number, { corrections: number; overtime: boolean }>();
  if (!employeeIds.length) return out;
  const from = fromDateTimeLocalET(`${monday}T00:00`);
  const to = fromDateTimeLocalET(`${addDays(monday, 7)}T00:00`);
  const [{ data: corr }, { data: tasks }] = await Promise.all([
    db.from("time_corrections").select("employee_id").eq("status", "pending").in("employee_id", employeeIds).gte("requested_at", from).lt("requested_at", to),
    db.from("tasks").select("details").eq("status", "Pending").is("deleted_at", null).like("details", `%[overtime:%:${monday}]%`),
  ]);
  for (const id of employeeIds) out.set(id, { corrections: 0, overtime: false });
  for (const c of (corr ?? []) as { employee_id: number }[]) out.get(c.employee_id)!.corrections++;
  for (const t of (tasks ?? []) as { details: string | null }[]) for (const id of employeeIds) if (t.details?.includes(overtimeMarker(id, monday))) out.get(id)!.overtime = true;
  return out;
}

/** True when this person's week containing `at` (or `day`) is approved, so its entries are locked. */
export async function weekApprovedFor(db: SupabaseClient, employeeId: number, day: string): Promise<boolean> {
  const { count } = await db.from("timesheet_weeks").select("id", { count: "exact", head: true }).eq("employee_id", employeeId).eq("monday", mondayOf(day)).eq("status", "Approved");
  return (count ?? 0) > 0;
}

/** The people whose week starting `monday` is approved (for the Day view's locks). */
export async function approvedEmployeesFor(db: SupabaseClient, monday: string): Promise<Set<number>> {
  const { data } = await db.from("timesheet_weeks").select("employee_id").eq("monday", monday).eq("status", "Approved");
  return new Set(((data ?? []) as { employee_id: number }[]).map((r) => r.employee_id));
}
