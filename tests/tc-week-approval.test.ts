// TC-h Weekly timesheet approval (SPEC §9.1, Jessica via Fred 2026-10-29, item 1): the pure rules.
import { describe, expect, it } from "vitest";
import { fromDateTimeLocalET } from "@/lib/dates";
import { approvalReminderMessage, shiftSequenceProblem, weekBlockers, weekEnded, weekLocked, weekStatusOf } from "@/lib/time-clock/week-approval";

const at = (local: string) => fromDateTimeLocalET(local);
const e = (kind: "clock_in" | "clock_out", local: string) => ({ kind, at: at(local) });

describe("week status", () => {
  it("is Open without a row, else what the row says", () => {
    expect(weekStatusOf(null)).toBe("Open");
    expect(weekStatusOf({ status: "Approved" })).toBe("Approved");
    expect(weekStatusOf({ status: "Reopened" })).toBe("Reopened");
  });
  it("locks only approved weeks", () => {
    expect(weekLocked(null)).toBe(false);
    expect(weekLocked({ status: "Reopened" })).toBe(false);
    expect(weekLocked({ status: "Approved" })).toBe(true);
  });
  it("can be approved only once the Sunday has passed", () => {
    expect(weekEnded("2026-10-19", "2026-10-25")).toBe(false); // Sunday itself
    expect(weekEnded("2026-10-19", "2026-10-26")).toBe(true); // Monday after
    expect(weekEnded("2026-10-26", "2026-10-29")).toBe(false);
  });
});

describe("blockers", () => {
  it("lists what the office must clear first, in order", () => {
    expect(weekBlockers({ sheet: { toReview: 0 }, pendingCorrections: 0, pendingOvertime: false, monday: "2026-10-19", today: "2026-10-29" })).toEqual([]);
    expect(weekBlockers({ sheet: { toReview: 2 }, pendingCorrections: 1, pendingOvertime: true, monday: "2026-10-19", today: "2026-10-29" })).toEqual(["review", "corrections", "overtime"]);
    expect(weekBlockers({ sheet: { toReview: 0 }, pendingCorrections: 0, pendingOvertime: false, monday: "2026-10-26", today: "2026-10-29" })).toEqual(["not_ended"]);
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
  it("counts the open weeks and opens the filtered timesheets", () => {
    const m = approvalReminderMessage({ monday: "2026-10-19", open: 3 });
    expect(m.title).toBe("3 timesheets to approve");
    expect(m.body).toBe("Week of 10/19/2026 – 10/25/2026: still open");
    expect(m.url).toBe("/time-clock/timesheets?week=2026-10-19&status=open");
    expect(approvalReminderMessage({ monday: "2026-10-19", open: 1 }).title).toBe("1 timesheet to approve");
  });
});
