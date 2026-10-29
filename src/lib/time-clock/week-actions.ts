"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/session";
import { fromDateTimeLocalET, nowMs, todayET } from "@/lib/dates";
import { recordsDb } from "@/lib/records/data";
import { addDays } from "@/lib/schedule/dates";
import { mondayOf, weekSheet, type SheetEntry } from "./timesheet";
import { BLOCKER_TEXT, weekBlockers, type Blocker } from "./week-approval";
import { canApproveWeeks, loadWeekPending, loadWeekRows } from "./week-status";

// TC-h Weekly timesheet approval (Jessica via Fred 2026-10-29, item 1): Approve week, Approve all, Reopen.
// Approving stores the week's minutes and locks its clock entries (trigger guard_locked_time_entry);
// reopening needs a reason. Every step lands in timesheet_week_events.

export type WeekActionResult = { ok: true } | { ok: false; message: string; blockers?: Blocker[] };
export type ApproveAllResult = { ok: true; approved: number; skipped: { name: string; why: string; blockers?: Blocker[] }[] } | { ok: false; message: string };

const DAY = /^\d{4}-\d{2}-\d{2}$/;

async function weekEntries(db: Awaited<ReturnType<typeof recordsDb>>, employeeId: number, monday: string): Promise<SheetEntry[]> {
  const { data } = await db
    .from("time_entries")
    .select("id, kind, at, note, reviewed_at, auto_closed")
    .eq("employee_id", employeeId)
    .in("kind", ["clock_in", "clock_out"])
    .gte("at", fromDateTimeLocalET(`${monday}T00:00`))
    .lt("at", fromDateTimeLocalET(`${addDays(monday, 7)}T00:00`))
    .is("deleted_at", null)
    .order("at");
  return (data ?? []) as SheetEntry[];
}

/** Approves one person's week, or says what blocks it. */
async function approveOne(db: Awaited<ReturnType<typeof recordsDb>>, userId: string, employeeId: number, monday: string, today: string): Promise<WeekActionResult> {
  const [rows, pending, entries] = await Promise.all([loadWeekRows(db, monday, [employeeId]), loadWeekPending(db, monday, [employeeId]), weekEntries(db, employeeId, monday)]);
  const row = rows.get(employeeId);
  if (row?.status === "Approved") return { ok: false, message: "This week is already approved." };
  const sheet = weekSheet(entries, monday, nowMs(), today);
  const p = pending.get(employeeId) ?? { corrections: 0, overtime: false };
  const blockers = weekBlockers({ sheet, pendingCorrections: p.corrections, pendingOvertime: p.overtime, monday, today });
  if (blockers.length) return { ok: false, message: blockers.map((b) => BLOCKER_TEXT[b]).join(" · "), blockers };
  const stamp = new Date().toISOString();
  const { data: saved, error } = await db
    .from("timesheet_weeks")
    .upsert({ employee_id: employeeId, monday, status: "Approved", minutes_at_approval: sheet.totalMinutes, approved_by: userId, approved_at: stamp, updated_at: stamp }, { onConflict: "employee_id,monday" })
    .select("id")
    .single();
  if (error) return { ok: false, message: error.message };
  await db.from("timesheet_week_events").insert({ week_id: (saved as { id: number }).id, action: "approved", minutes: sheet.totalMinutes, by_user: userId });
  return { ok: true };
}

function refresh() {
  revalidatePath("/time-clock");
  revalidatePath("/time-clock/timesheets");
  revalidatePath("/pay-periods");
}

export async function approveWeekAction(employeeId: number, monday: string): Promise<WeekActionResult> {
  const user = await requireUser();
  if (!canApproveWeeks(user)) return { ok: false, message: "You don't have permission to approve timesheets." };
  if (!Number.isInteger(employeeId) || !DAY.test(monday) || mondayOf(monday) !== monday) return { ok: false, message: "Pick the person and the week." };
  const db = await recordsDb();
  const r = await approveOne(db, user.id, employeeId, monday, todayET());
  if (r.ok) refresh();
  return r;
}

/** Approves every listed person whose week has nothing left to clear; the rest are reported, not stopped on. */
export async function approveAllAction(monday: string, employeeIds: number[]): Promise<ApproveAllResult> {
  const user = await requireUser();
  if (!canApproveWeeks(user)) return { ok: false, message: "You don't have permission to approve timesheets." };
  if (!DAY.test(monday) || mondayOf(monday) !== monday) return { ok: false, message: "Pick the week." };
  const ids = [...new Set(employeeIds.filter((id) => Number.isInteger(id)))];
  if (!ids.length) return { ok: true, approved: 0, skipped: [] };
  const db = await recordsDb();
  const { data: emps } = await db.from("employees").select("id, title").in("id", ids);
  const name = new Map(((emps ?? []) as { id: number; title: string | null }[]).map((e) => [e.id, e.title ?? `#${e.id}`]));
  const today = todayET();
  let approved = 0;
  const skipped: { name: string; why: string; blockers?: Blocker[] }[] = [];
  for (const id of ids) {
    const r = await approveOne(db, user.id, id, monday, today);
    if (r.ok) approved++;
    else skipped.push({ name: name.get(id) ?? `#${id}`, why: r.message, blockers: r.blockers });
  }
  if (approved) refresh();
  return { ok: true, approved, skipped };
}

/** Unlocks an approved week; the reason is kept with the week and in its events. */
export async function reopenWeekAction(employeeId: number, monday: string, reason: string): Promise<WeekActionResult> {
  const user = await requireUser();
  if (!canApproveWeeks(user)) return { ok: false, message: "You don't have permission to reopen timesheets." };
  if (!Number.isInteger(employeeId) || !DAY.test(monday)) return { ok: false, message: "Pick the person and the week." };
  const why = reason.trim().slice(0, 300);
  if (!why) return { ok: false, message: "Say why you are reopening this week (for the record)." };
  const db = await recordsDb();
  const stamp = new Date().toISOString();
  const { data, error } = await db
    .from("timesheet_weeks")
    .update({ status: "Reopened", reopened_by: user.id, reopened_at: stamp, reopen_reason: why, updated_at: stamp })
    .eq("employee_id", employeeId)
    .eq("monday", monday)
    .eq("status", "Approved")
    .select("id");
  if (error) return { ok: false, message: error.message };
  if (!data?.length) return { ok: false, message: "This week is not approved." };
  await db.from("timesheet_week_events").insert({ week_id: (data[0] as { id: number }).id, action: "reopened", reason: why, by_user: user.id });
  refresh();
  return { ok: true };
}
