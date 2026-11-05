// TS-c Timesheet approval per pay period and department (Fred 2026-11-05, Part 4): the pure rules.
import { describe, expect, it } from "vitest";
import { fromDateTimeLocalET } from "@/lib/dates";
import { approvalBlockers, approvalLocked, approvalReminderMessage, approvalStatusOf, needsApproval, shiftSequenceProblem } from "@/lib/time-clock/period-approval";

const at = (local: string) => fromDateTimeLocalET(local);
const e = (kind: "clock_in" | "clock_out", local: string) => ({ kind, at: at(local) });

describe("period status", () => {
  it("is Open without a row, else what the row says", () => {
    expect(approvalStatusOf(null)).toBe("Open");
    expect(approvalStatusOf({ status: "Approved" })).toBe("Approved");
    expect(approvalStatusOf({ status: "Reopened" })).toBe("Reopened");
  });
  it("locks only approved periods", () => {
    expect(approvalLocked(null)).toBe(false);
    expect(approvalLocked({ status: "Reopened" })).toBe(false);
    expect(approvalLocked({ status: "Approved" })).toBe(true);
  });
  it("only the groups listed in the settings need the approval (a person with no group is Field)", () => {
    expect(needsApproval("Field", ["Field"])).toBe(true);
    expect(needsApproval(null, ["Field"])).toBe(true);
    expect(needsApproval("Office", ["Field"])).toBe(false);
    expect(needsApproval("Office", ["Field", "Office"])).toBe(true);
    expect(needsApproval("Field", [])).toBe(false);
  });
});

describe("blockers", () => {
  it("lists what the office must clear first, in order", () => {
    expect(approvalBlockers({ toReview: 0, pendingCorrections: 0, endsOn: "2026-10-25", today: "2026-10-26" })).toEqual([]);
    expect(approvalBlockers({ toReview: 2, pendingCorrections: 1, endsOn: "2026-10-25", today: "2026-10-29" })).toEqual(["review", "corrections"]);
  });
  it("waits for the period to end: its last day must be before today", () => {
    expect(approvalBlockers({ toReview: 0, pendingCorrections: 0, endsOn: "2026-10-25", today: "2026-10-25" })).toEqual(["not_ended"]);
    expect(approvalBlockers({ toReview: 1, pendingCorrections: 0, endsOn: "2026-11-08", today: "2026-10-29" })).toEqual(["not_ended", "review"]);
  });
  it("needs a pay schedule before anything else", () => {
    expect(approvalBlockers({ toReview: 3, pendingCorrections: 0, endsOn: null, today: "2026-10-29" })).toEqual(["no_schedule"]);
  });
});

describe("several shifts in a day", () => {
  it("accepts two shifts in a row", () => {
    expect(shiftSequenceProblem([e("clock_in", "2026-10-20T08:00"), e("clock_out", "2026-10-20T12:00"), e("clock_in", "2026-10-20T13:00"), e("clock_out", "2026-10-20T17:00")])).toBeNull();
  });
  it("accepts a clock-out first (shift from the day before) and an open clock-in last", () => {
    expect(shiftSequenceProblem([e("clock_out", "2026-10-20T01:00"), e("clock_in", "2026-10-20T08:00"), e("clock_out", "2026-10-20T12:00"), e("clock_in", "2026-10-20T22:00")])).toBeNull();
  });
  it("refuses an overlap, a doubled time and a clock-out without a clock-in", () => {
    expect(shiftSequenceProblem([e("clock_in", "2026-10-20T08:00"), e("clock_in", "2026-10-20T09:00"), e("clock_out", "2026-10-20T12:00")])).toMatch(/overlaps/);
    expect(shiftSequenceProblem([e("clock_in", "2026-10-20T08:00"), e("clock_out", "2026-10-20T12:00"), e("clock_in", "2026-10-20T10:00"), e("clock_out", "2026-10-20T14:00")])).toMatch(/overlaps/);
    expect(shiftSequenceProblem([e("clock_in", "2026-10-20T08:00"), e("clock_out", "2026-10-20T08:00")])).toMatch(/same time/);
    expect(shiftSequenceProblem([e("clock_in", "2026-10-20T08:00"), e("clock_out", "2026-10-20T12:00"), e("clock_out", "2026-10-20T13:00")])).toMatch(/needs a clock-in/);
  });
});

describe("Monday reminder", () => {
  it("counts the open periods of a group and opens the timesheets filtered to it", () => {
    const m = approvalReminderMessage({ open: 3, group: "Field", oldest: "2026-10-25" });
    expect(m.title).toBe("3 timesheets to approve");
    expect(m.body).toBe("Field: periods ended since 10/25/2026 still open");
    expect(m.url).toBe("/time-clock/timesheets?group=Field&status=open");
    expect(approvalReminderMessage({ open: 1, group: "Field", oldest: "2026-10-25" }).title).toBe("1 timesheet to approve");
  });
});
