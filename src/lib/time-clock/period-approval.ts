// TS-c Timesheet approval per pay period and department (Fred 2026-11-04/05, Part 4 of the Pay periods / Time
// clock brief; replaces TC-h's week): the pure part. A person's timesheet is Open until an approver approves it
// for one pay-schedule period; approving locks every clock entry of that period (database trigger), reopening
// (with a reason) unlocks it. Only the time-clock groups listed in Admin › Field day need the approval (the
// Field); the others go to Pay periods directly. Tests: tests/ts-period-approval.test.ts.
import { formatDate } from "@/lib/dates";
import type { PushMessage } from "@/lib/push/engine";
import type { SheetEntry } from "./timesheet";

export type ApprovalStatus = "Open" | "Approved" | "Reopened";

/** A `timesheet_periods` row (no row = Open). */
export type ApprovalRow = {
  employee_id: number;
  schedule_id: number;
  starts_on: string;
  ends_on: string;
  status: "Approved" | "Reopened";
  minutes_at_approval: number | null;
  approved_by: string | null;
  approved_at: string | null;
  reopened_by: string | null;
  reopened_at: string | null;
  reopen_reason: string | null;
};

export const approvalStatusOf = (row: Pick<ApprovalRow, "status"> | null | undefined): ApprovalStatus => row?.status ?? "Open";

/** Approved periods are locked; Open and Reopened ones are not. */
export const approvalLocked = (row: Pick<ApprovalRow, "status"> | null | undefined) => row?.status === "Approved";

/** True when this time-clock group's timesheets go through the approval before Pay periods take them. */
export const needsApproval = (group: string | null | undefined, approvalGroups: readonly string[]) => approvalGroups.includes(group ?? "Field");

/** Why a period cannot be approved yet (translated on screen with t()). */
export type Blocker = "review" | "corrections" | "not_ended" | "no_schedule";
export const BLOCKER_TEXT: Record<Blocker, string> = {
  review: "Shifts need a look",
  corrections: "Correction requests pending",
  not_ended: "The period has not ended",
  no_schedule: "No pay schedule",
};

/**
 * What stands between a person's period and its approval, in the order the office should clear them.
 * `toReview` counts the shifts under Needs a look, a forgotten clock-out that still counts 0 (TS-a) among them.
 */
export function approvalBlockers(p: { toReview: number; pendingCorrections: number; endsOn: string | null; today: string }): Blocker[] {
  const out: Blocker[] = [];
  if (p.endsOn === null) return ["no_schedule"];
  if (p.endsOn >= p.today) out.push("not_ended");
  if (p.toReview > 0) out.push("review");
  if (p.pendingCorrections > 0) out.push("corrections");
  return out;
}

/**
 * Several shifts in one day are fine as long as they do not overlap: in time order the clock entries must
 * alternate clock-in, clock-out, clock-in, … A clock-out may come first (a shift that started the day before)
 * and a clock-in may be last (a shift still open or ending after midnight). Returns the problem, or null.
 */
export function shiftSequenceProblem(entries: Pick<SheetEntry, "kind" | "at">[]): string | null {
  const sorted = entries.filter((e) => e.kind === "clock_in" || e.kind === "clock_out").sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  let open = false;
  for (let i = 0; i < sorted.length; i++) {
    const e = sorted[i];
    if (i > 0 && Date.parse(e.at) === Date.parse(sorted[i - 1].at)) return "Two entries at the same time.";
    if (e.kind === "clock_in") {
      if (open) return "That shift overlaps another one. Clock out of the earlier shift first.";
      open = true;
    } else {
      if (!open && i > 0) return "A clock-out needs a clock-in before it.";
      open = false;
    }
  }
  return null;
}

/** The Monday push to the approvers: how many people have an ended period with hours and no approval yet. */
export function approvalReminderMessage(p: { open: number; group: string; oldest: string }): PushMessage {
  return {
    title: p.open === 1 ? "1 timesheet to approve" : `${p.open} timesheets to approve`,
    body: `${p.group}: periods ended since ${formatDate(p.oldest)} still open`,
    url: `/time-clock/timesheets?group=${encodeURIComponent(p.group)}&status=open`,
    tag: `timesheets-${p.group}-${p.oldest}`,
  };
}
