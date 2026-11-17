// OT-b Overtime approval flow and TO-a Time off (Fred 2026-11-17): the pure rules.
import { describe, expect, it } from "vitest";
import { periodFor, nextPeriod, previousPeriod, weekdayOf, type Schedule } from "@/lib/payroll/periods";
import { decidedMessage, justifyDueAt, justifyMessage, reconcile, reviewCutoff, stateOf, weeklyMessage } from "@/lib/time-clock/overtime-rules";
import { approvalBlockers } from "@/lib/time-clock/period-approval";
import { ABSENCE, bankBalance, hourChoices, hoursProblem, isAbsence, isWeekday, offTotals, requestDays } from "@/lib/time-clock/time-off-rules";

describe("an overtime day follows the day's hours", () => {
  it("is created once the day is closed and its excess passes the tolerance", () => {
    expect(reconcile(null, 60, true)).toEqual({ action: "create" });
    expect(reconcile(null, 0, true)).toEqual({ action: "none" });
  });
  it("a shift with no clock-out raises nothing (only the missing clock-out alert)", () => {
    expect(reconcile(null, 60, false)).toEqual({ action: "none" });
    expect(reconcile({ status: "approved", excess_minutes: 60, justification: "x" }, 0, false)).toEqual({ action: "none" });
  });
  it("stays as it is while the excess does not change", () => {
    expect(reconcile({ status: "pending", excess_minutes: 60, justification: "late delivery" }, 60, true)).toEqual({ action: "none" });
    expect(reconcile({ status: "refused", excess_minutes: 60, justification: null }, 60, true)).toEqual({ action: "none" });
  });
  it("updates an undecided day whose hours changed", () => {
    expect(reconcile({ status: "awaiting_justification", excess_minutes: 60, justification: null }, 45, true)).toEqual({ action: "update" });
  });
  it("reopens a decided day whose hours changed: back to the queue, or to the technician when nothing was written", () => {
    expect(reconcile({ status: "approved", excess_minutes: 60, justification: "late delivery" }, 90, true)).toEqual({ action: "reopen", to: "pending" });
    expect(reconcile({ status: "refused", excess_minutes: 60, justification: null }, 90, true)).toEqual({ action: "reopen", to: "awaiting_justification" });
  });
  it("is voided when the day has no overtime any more, and comes back if it does again", () => {
    expect(reconcile({ status: "pending", excess_minutes: 60, justification: "x" }, 0, true)).toEqual({ action: "void" });
    expect(reconcile({ status: "void", excess_minutes: 0, justification: "x" }, 0, true)).toEqual({ action: "none" });
    expect(reconcile({ status: "void", excess_minutes: 0, justification: "x" }, 30, true)).toEqual({ action: "reopen", to: "pending" });
  });
  it("the pay waits while there is no row or no decision", () => {
    expect(stateOf(null)).toBe("awaiting");
    expect(stateOf({ status: "awaiting_justification" })).toBe("awaiting");
    expect(stateOf({ status: "pending" })).toBe("pending");
    expect(stateOf({ status: "approved" })).toBe("approved");
    expect(stateOf({ status: "refused" })).toBe("refused");
  });
  it("gives the technician 48 hours and the approver one Thursday notice up to Wednesday", () => {
    expect(justifyDueAt("2026-11-17T22:00:00.000Z")).toBe("2026-11-19T22:00:00.000Z");
    expect(reviewCutoff("2026-11-19")).toBe("2026-11-18");
    expect(justifyMessage({ day: "2026-11-17", excess: 70 })).toMatchObject({ title: "Overtime: tell us why", url: "/my-time" });
    expect(decidedMessage({ day: "2026-11-17", excess: 70, approved: false, comment: "Not authorized" }).body).toBe("11/17: +1:10 · Not authorized");
    expect(weeklyMessage({ days: 3, people: ["Fabio", "Hugo"] })).toMatchObject({ title: "Overtime of the week: 3 days to decide", body: "Fabio, Hugo", url: "/time-clock/overtime" });
    expect(weeklyMessage({ days: 1, people: ["Fabio"], backup: true }).title).toBe("Overtime still undecided: 1 day");
  });
  it("blocks the person's period while overtime or a time-off request is open", () => {
    expect(approvalBlockers({ toReview: 0, pendingCorrections: 0, endsOn: "2026-11-18", today: "2026-11-19", overtimeOpen: 1, timeOffPending: 1 })).toEqual(["overtime", "time_off"]);
    expect(approvalBlockers({ toReview: 0, pendingCorrections: 0, endsOn: "2026-11-18", today: "2026-11-19", overtimeOpen: 0, timeOffPending: 0 })).toEqual([]);
  });
});

describe("time off", () => {
  it("takes hours on the working days of the range only (Monday to Friday, holidays out)", () => {
    expect(isWeekday("2026-11-20")).toBe(true); // Friday
    expect(isWeekday("2026-11-21")).toBe(false);
    expect(requestDays("2026-11-19", "2026-11-24")).toEqual(["2026-11-19", "2026-11-20", "2026-11-23", "2026-11-24"]);
    expect(requestDays("2026-11-25", "2026-11-27", ["2026-11-26"])).toEqual(["2026-11-25", "2026-11-27"]);
    expect(requestDays("2026-11-21", "2026-11-22")).toEqual([]);
  });
  it("asks from 1 h up to the full day, in whole hours", () => {
    expect(hourChoices(540)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(hourChoices(600)).toHaveLength(10);
    expect(hoursProblem(540, 540)).toBeNull();
    expect(hoursProblem(60, 540)).toBeNull();
    expect(hoursProblem(90, 540)).toMatch(/whole hours/);
    expect(hoursProblem(0, 540)).toMatch(/whole hours/);
    expect(hoursProblem(600, 540)).toMatch(/full day/);
  });
  it("the bank is blank until the opening balance, then the typed rows minus what was taken since", () => {
    const taken = [{ day: "2026-11-09", minutes: 540 }, { day: "2026-11-20", minutes: 540 }, { day: "2026-11-23", minutes: 240 }];
    expect(bankBalance([], taken, "2026-11-30")).toBeNull();
    const rows = [{ day: "2026-11-17", delta_minutes: 2400 }];
    expect(bankBalance(rows, taken, "2026-11-17")).toBe(2400); // the day of 11/9 was before the opening balance
    expect(bankBalance(rows, taken, "2026-11-20")).toBe(2400 - 540);
    expect(bankBalance(rows, taken, "2026-11-30")).toBe(2400 - 540 - 240);
    expect(bankBalance([...rows, { day: "2026-11-25", delta_minutes: -120 }], taken, "2026-11-30")).toBe(2400 - 540 - 240 - 120);
  });
  it("can go below zero", () => {
    expect(bankBalance([{ day: "2026-11-17", delta_minutes: 300 }], [{ day: "2026-11-18", minutes: 540 }], "2026-11-18")).toBe(-240);
  });
  it("a weekday with no clock-in and no time off is an absence; a weekend or a holiday never is", () => {
    expect(isAbsence({ day: "2026-11-18", hasClockIn: false, hasTimeOff: false })).toBe(true);
    expect(isAbsence({ day: "2026-11-18", hasClockIn: true, hasTimeOff: false })).toBe(false);
    expect(isAbsence({ day: "2026-11-18", hasClockIn: false, hasTimeOff: true })).toBe(false);
    expect(isAbsence({ day: "2026-11-21", hasClockIn: false, hasTimeOff: false })).toBe(false);
    expect(isAbsence({ day: "2026-11-26", hasClockIn: false, hasTimeOff: false, holidays: ["2026-11-26"] })).toBe(false);
  });
  it("counts paid hours, unpaid hours and the absences apart", () => {
    const entries = [
      { day: "2026-11-09", kind: "Paid absence", paid: true, minutes: 540 },
      { day: "2026-11-10", kind: "Unpaid absence", paid: false, minutes: 240 },
      { day: "2026-11-11", kind: ABSENCE, paid: false, minutes: 540 },
      { day: "2026-11-30", kind: ABSENCE, paid: false, minutes: 540 },
    ];
    expect(offTotals(entries, "2026-11-06", "2026-11-18")).toEqual({ paidMinutes: 540, unpaidMinutes: 240, absenceDates: ["2026-11-11"] });
  });
});

describe("the pay calendar moves to Thursday → Wednesday", () => {
  const BIWEEKLY: Schedule = { id: 1, name: "Biweekly", frequency: "Biweekly", anchor_on: "2026-10-23", pay_day_rule: { kind: "weekday", weekday: 5 }, active: true, reanchor_on: "2026-11-19" };
  const OFFICE: Schedule = { id: 2, name: "Every 4 weeks", frequency: "Every 4 weeks", anchor_on: "2026-10-09", pay_day_rule: { kind: "weekday", weekday: 5 }, active: true, reanchor_on: "2026-12-03" };

  it("the period under way ends a day early, on the Wednesday", () => {
    const p = periodFor(BIWEEKLY, "2026-11-17");
    expect(p).toMatchObject({ starts_on: "2026-11-06", ends_on: "2026-11-18", pay_day: "2026-11-20" });
    expect(weekdayOf(p.ends_on)).toBe(3);
    expect(periodFor(OFFICE, "2026-11-17")).toMatchObject({ starts_on: "2026-11-06", ends_on: "2026-12-02", pay_day: "2026-12-04" });
  });
  it("the next ones run Thursday to Wednesday and are paid on the Friday", () => {
    const p = periodFor(BIWEEKLY, "2026-11-19");
    expect(p).toMatchObject({ starts_on: "2026-11-19", ends_on: "2026-12-02", pay_day: "2026-12-04" });
    expect([weekdayOf(p.starts_on), weekdayOf(p.ends_on), weekdayOf(p.pay_day)]).toEqual([4, 3, 5]);
    expect(nextPeriod(p, BIWEEKLY)).toMatchObject({ starts_on: "2026-12-03", ends_on: "2026-12-16", pay_day: "2026-12-18" });
    expect(periodFor(OFFICE, "2026-12-03")).toMatchObject({ starts_on: "2026-12-03", ends_on: "2026-12-30", pay_day: "2027-01-01" });
  });
  it("walks back across the change without a gap or an overlap, and leaves the earlier periods alone", () => {
    const first = periodFor(BIWEEKLY, "2026-11-19");
    const cut = previousPeriod(first, BIWEEKLY);
    expect(cut).toMatchObject({ starts_on: "2026-11-06", ends_on: "2026-11-18" });
    expect(previousPeriod(cut, BIWEEKLY)).toMatchObject({ starts_on: "2026-10-23", ends_on: "2026-11-05", pay_day: "2026-11-06" });
    expect(nextPeriod(cut, BIWEEKLY).starts_on).toBe("2026-11-19");
  });
});
