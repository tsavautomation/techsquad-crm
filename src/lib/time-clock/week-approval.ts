// TC-h Weekly timesheet approval (SPEC §9.1, Jessica via Fred 2026-10-29, item 1): the pure part.
// A person's week is Open until the office approves it; approving locks every clock entry of that week
// (database trigger); reopening (with a reason) unlocks it. What blocks an approval, the status text,
// the Monday reminder and the check that keeps several shifts of a day from overlapping.
// Tests: tests/tc-week-approval.test.ts.
import { formatDate } from "@/lib/dates";
import { addDays } from "@/lib/schedule/dates";
import type { PushMessage } from "@/lib/push/engine";
import type { SheetEntry, WeekSheet } from "./timesheet";

export type WeekStatus = "Open" | "Approved" | "Reopened";

/** A `timesheet_weeks` row (no row = Open). */
export type WeekRow = {
  employee_id: number;
  monday: string;
  status: "Approved" | "Reopened";
  minutes_at_approval: number | null;
  approved_by: string | null;
  approved_at: string | null;
  reopened_by: string | null;
  reopened_at: string | null;
  reopen_reason: string | null;
};

export const weekStatusOf = (row: Pick<WeekRow, "status"> | null | undefined): WeekStatus => row?.status ?? "Open";

/** Approving is only for weeks that have ended: the Sunday is before today (Eastern). */
export const weekEnded = (monday: string, today: string) => addDays(monday, 6) < today;

/** Why a week cannot be approved yet (translated on screen with t()). */
export type Blocker = "review" | "corrections" | "overtime" | "not_ended";
export const BLOCKER_TEXT: Record<Blocker, string> = {
  review: "Shifts need a look",
  corrections: "Correction requests pending",
  overtime: "Overtime waiting for approval",
  not_ended: "The week has not ended",
};

/** What stands between this week and its approval, in the order the office should clear them. */
export function weekBlockers(p: { sheet: Pick<WeekSheet, "toReview">; pendingCorrections: number; pendingOvertime: boolean; monday: string; today: string }): Blocker[] {
  const out: Blocker[] = [];
  if (!weekEnded(p.monday, p.today)) out.push("not_ended");
  if (p.sheet.toReview > 0) out.push("review");
  if (p.pendingCorrections > 0) out.push("corrections");
  if (p.pendingOvertime) out.push("overtime");
  return out;
}

/** Approved weeks are locked; Open and Reopened weeks are not. */
export const weekLocked = (row: Pick<WeekRow, "status"> | null | undefined) => row?.status === "Approved";

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

/** The Monday push to the approvers: how many people's last week is still open. */
export function approvalReminderMessage(p: { monday: string; open: number }): PushMessage {
  return {
    title: p.open === 1 ? "1 timesheet to approve" : `${p.open} timesheets to approve`,
    body: `Week of ${formatDate(p.monday)} – ${formatDate(addDays(p.monday, 6))}: still open`,
    url: `/time-clock/timesheets?week=${p.monday}&status=open`,
    tag: `timesheets-${p.monday}`,
  };
}
