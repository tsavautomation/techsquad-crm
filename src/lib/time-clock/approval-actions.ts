"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/session";
import { fromDateTimeLocalET, nowMs, todayET } from "@/lib/dates";
import { recordsDb } from "@/lib/records/data";
import { addDays } from "@/lib/schedule/dates";
import { approvalGroups, canApproveTimesheets, loadApprovalsAt, loadPendingCorrections, periodsAt } from "./approval-status";
import { BLOCKER_TEXT, approvalBlockers, needsApproval, type Blocker } from "./period-approval";
import { personDays } from "./person-sheet";
import type { SheetEntry } from "./timesheet";

// TS-c Timesheet approval per pay period (Fred 2026-11-04/05, Part 4): Approve, Approve all, Reopen.
// Approving stores the period's minutes and locks its clock entries (trigger guard_locked_time_entry);
// reopening needs a reason. Every step lands in timesheet_period_events.

export type ApprovalActionResult = { ok: true } | { ok: false; message: string; blockers?: Blocker[] };
export type ApproveManyResult = { ok: true; approved: number; skipped: { name: string; why: string; blockers?: Blocker[] }[] } | { ok: false; message: string };
export type ApprovalItem = { employeeId: number; startsOn: string };

const DAY = /^\d{4}-\d{2}-\d{2}$/;
type Db = Awaited<ReturnType<typeof recordsDb>>;

async function periodEntries(db: Db, employeeId: number, from: string, to: string): Promise<SheetEntry[]> {
  const { data } = await db
    .from("time_entries")
    .select("id, kind, at, note, reviewed_at, auto_closed, needs_adjustment, project_id, manager_note")
    .eq("employee_id", employeeId)
    .in("kind", ["clock_in", "clock_out"])
    .gte("at", fromDateTimeLocalET(`${from}T00:00`))
    .lt("at", fromDateTimeLocalET(`${addDays(to, 1)}T06:00`)) // a shift may end after midnight
    .is("deleted_at", null)
    .order("at");
  return (data ?? []) as SheetEntry[];
}

/** Approves one person's period, or says what blocks it. */
async function approveOne(db: Db, userId: string, employeeId: number, startsOn: string, today: string, groups: string[]): Promise<ApprovalActionResult> {
  const { data: emp } = await db.from("employees").select("id, clock_group").eq("id", employeeId).is("deleted_at", null).maybeSingle();
  if (!emp) return { ok: false, message: "Person not found." };
  if (!needsApproval((emp as { clock_group: string | null }).clock_group, groups)) return { ok: false, message: "This group's timesheets need no approval: Pay periods take them directly." };
  const mine = (await periodsAt(db, [employeeId], startsOn)).get(employeeId);
  if (!mine) return { ok: false, message: BLOCKER_TEXT.no_schedule, blockers: ["no_schedule"] };
  const { period, schedule } = mine;
  if (period.starts_on !== startsOn) return { ok: false, message: "That date does not start this person's period." };
  const [rows, corrections, entries] = await Promise.all([loadApprovalsAt(db, [employeeId], startsOn), loadPendingCorrections(db, [employeeId], period.starts_on, period.ends_on), periodEntries(db, employeeId, period.starts_on, period.ends_on)]);
  if (rows.get(employeeId)?.status === "Approved") return { ok: false, message: "This period is already approved." };
  const days = personDays(entries, period.starts_on, period.ends_on, [], nowMs(), today);
  const toReview = days.reduce((n, d) => n + d.toReview, 0);
  const blockers = approvalBlockers({ toReview, pendingCorrections: corrections.get(employeeId) ?? 0, endsOn: period.ends_on, today });
  if (blockers.length) return { ok: false, message: blockers.map((b) => BLOCKER_TEXT[b]).join(" · "), blockers };
  const minutes = days.reduce((n, d) => n + d.minutes, 0);
  const stamp = new Date().toISOString();
  const { data: saved, error } = await db
    .from("timesheet_periods")
    .upsert({ employee_id: employeeId, schedule_id: schedule.id, starts_on: period.starts_on, ends_on: period.ends_on, status: "Approved", minutes_at_approval: minutes, approved_by: userId, approved_at: stamp, reopened_by: null, reopened_at: null, reopen_reason: null, updated_at: stamp }, { onConflict: "employee_id,starts_on" })
    .select("id")
    .single();
  if (error) return { ok: false, message: error.message };
  await db.from("timesheet_period_events").insert({ period_id: (saved as { id: number }).id, action: "approved", minutes, by_user: userId });
  return { ok: true };
}

function refresh() {
  revalidatePath("/time-clock");
  revalidatePath("/time-clock/timesheets");
  revalidatePath("/time-clock/people/[id]", "page");
  revalidatePath("/pay-periods");
}

export async function approveTimesheetAction(employeeId: number, startsOn: string): Promise<ApprovalActionResult> {
  const user = await requireUser();
  if (!canApproveTimesheets(user)) return { ok: false, message: "You don't have permission to approve timesheets." };
  if (!Number.isInteger(employeeId) || !DAY.test(startsOn)) return { ok: false, message: "Pick the person and the period." };
  const db = await recordsDb();
  const r = await approveOne(db, user.id, employeeId, startsOn, todayET(), await approvalGroups(db));
  if (r.ok) refresh();
  return r;
}

/** Approves every listed person's period that has nothing left to clear; the rest are reported, not stopped on. */
export async function approveManyAction(items: ApprovalItem[]): Promise<ApproveManyResult> {
  const user = await requireUser();
  if (!canApproveTimesheets(user)) return { ok: false, message: "You don't have permission to approve timesheets." };
  const wanted = items.filter((i) => Number.isInteger(i.employeeId) && DAY.test(i.startsOn));
  if (!wanted.length) return { ok: true, approved: 0, skipped: [] };
  const db = await recordsDb();
  const { data: emps } = await db.from("employees").select("id, title").in("id", wanted.map((i) => i.employeeId));
  const name = new Map(((emps ?? []) as { id: number; title: string | null }[]).map((e) => [e.id, e.title ?? `#${e.id}`]));
  const today = todayET();
  const groups = await approvalGroups(db);
  let approved = 0;
  const skipped: { name: string; why: string; blockers?: Blocker[] }[] = [];
  for (const i of wanted) {
    const r = await approveOne(db, user.id, i.employeeId, i.startsOn, today, groups);
    if (r.ok) approved++;
    else skipped.push({ name: name.get(i.employeeId) ?? `#${i.employeeId}`, why: r.message, blockers: r.blockers });
  }
  if (approved) refresh();
  return { ok: true, approved, skipped };
}

/** Unlocks an approved period; the reason is kept with the period and in its events. */
export async function reopenTimesheetAction(employeeId: number, startsOn: string, reason: string): Promise<ApprovalActionResult> {
  const user = await requireUser();
  if (!canApproveTimesheets(user)) return { ok: false, message: "You don't have permission to reopen timesheets." };
  if (!Number.isInteger(employeeId) || !DAY.test(startsOn)) return { ok: false, message: "Pick the person and the period." };
  const why = reason.trim().slice(0, 300);
  if (!why) return { ok: false, message: "Say why you are reopening this period (for the record)." };
  const db = await recordsDb();
  const stamp = new Date().toISOString();
  const { data, error } = await db
    .from("timesheet_periods")
    .update({ status: "Reopened", reopened_by: user.id, reopened_at: stamp, reopen_reason: why, updated_at: stamp })
    .eq("employee_id", employeeId)
    .eq("starts_on", startsOn)
    .eq("status", "Approved")
    .select("id");
  if (error) return { ok: false, message: error.message };
  if (!data?.length) return { ok: false, message: "This period is not approved." };
  await db.from("timesheet_period_events").insert({ period_id: (data[0] as { id: number }).id, action: "reopened", reason: why, by_user: user.id });
  refresh();
  return { ok: true };
}
