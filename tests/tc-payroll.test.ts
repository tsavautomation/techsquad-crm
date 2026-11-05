// TC-e / TC-f / PS-a Pay periods (SPEC §9.1): period boundaries per pay schedule and the line per person.
import { describe, expect, it } from "vitest";
import { hours, payLine, periodCsv } from "@/lib/payroll/engine";
import { nextPeriod, parsePayDayRule, payDayOf, periodDates, periodEnded, periodFor, previousPeriod, recentPeriods, scheduleInForce, weekdayOf, type Schedule } from "@/lib/payroll/periods";
import type { Shift } from "@/lib/time-clock/timesheet";

const BIWEEKLY: Schedule = { id: 1, name: "Biweekly", frequency: "Biweekly", anchor_on: "2026-10-12", pay_day_rule: { kind: "days_after", days: 5 }, active: true };
// Fred 2026-11-04: the office's 4-week cycle starts on a Friday and is paid on the Friday that completes the four weeks.
const OFFICE: Schedule = { id: 2, name: "Every 4 weeks", frequency: "Every 4 weeks", anchor_on: "2026-10-16", pay_day_rule: { kind: "weekday", weekday: 5 }, active: true };
const MONTHLY: Schedule = { id: 3, name: "Monthly", frequency: "Monthly calendar", anchor_on: "2026-01-01", pay_day_rule: { kind: "days_after", days: 5 }, active: true };

describe("pay schedule periods", () => {
  it("biweekly runs 14 days from the anchor, paid 5 days after", () => {
    expect(periodFor(BIWEEKLY, "2026-10-20")).toEqual({ schedule_id: 1, frequency: "Biweekly", starts_on: "2026-10-12", ends_on: "2026-10-25", pay_day: "2026-10-30", pay_day_moved: false });
    expect(periodFor(BIWEEKLY, "2026-10-26").starts_on).toBe("2026-10-26");
    expect(periodFor(BIWEEKLY, "2026-10-11")).toMatchObject({ starts_on: "2026-09-28", ends_on: "2026-10-11" });
    expect(periodFor(BIWEEKLY, "2026-01-01")).toMatchObject({ starts_on: "2025-12-22", ends_on: "2026-01-04" });
  });

  it("every 4 weeks runs 28 days from a Friday and pays on the Friday that completes them", () => {
    expect(weekdayOf("2026-10-16")).toBe(5);
    const p = periodFor(OFFICE, "2026-11-04");
    expect(p).toMatchObject({ starts_on: "2026-10-16", ends_on: "2026-11-12", pay_day: "2026-11-13" });
    expect(weekdayOf(p.pay_day)).toBe(5);
    expect(nextPeriod(p, OFFICE)).toMatchObject({ starts_on: "2026-11-13", ends_on: "2026-12-10", pay_day: "2026-12-11" });
    expect(previousPeriod(p, OFFICE)).toMatchObject({ starts_on: "2026-09-18", ends_on: "2026-10-15", pay_day: "2026-10-16" });
  });

  it("monthly calendar is the calendar month", () => {
    expect(periodFor(MONTHLY, "2026-10-21")).toMatchObject({ starts_on: "2026-10-01", ends_on: "2026-10-31", pay_day: "2026-11-05" });
    expect(periodFor(MONTHLY, "2028-02-20").ends_on).toBe("2028-02-29");
    expect(nextPeriod(periodFor(MONTHLY, "2026-12-31"), MONTHLY).starts_on).toBe("2027-01-01");
  });

  it("pay-day rules: days after, or the first weekday after the period", () => {
    expect(payDayOf("2026-10-25", { kind: "days_after", days: 0 })).toBe("2026-10-25");
    expect(payDayOf("2026-10-25", { kind: "weekday", weekday: 5 })).toBe("2026-10-30"); // Sunday → next Friday
    expect(payDayOf("2026-10-29", { kind: "weekday", weekday: 5 })).toBe("2026-10-30"); // Thursday → tomorrow
    expect(payDayOf("2026-10-30", { kind: "weekday", weekday: 5 })).toBe("2026-11-06"); // ends on a Friday → the next one
    expect(parsePayDayRule({ kind: "weekday", weekday: 9 })).toEqual({ kind: "days_after", days: 5 });
  });

  it("a moved pay day applies to that period only", () => {
    const moved = new Map([["2026-10-12", "2026-10-29"]]);
    expect(periodFor(BIWEEKLY, "2026-10-20", moved)).toMatchObject({ pay_day: "2026-10-29", pay_day_moved: true });
    expect(periodFor(BIWEEKLY, "2026-10-27", moved)).toMatchObject({ pay_day: "2026-11-13", pay_day_moved: false });
  });

  it("walks forward and back without gaps", () => {
    const list = recentPeriods(BIWEEKLY, "2026-11-04", 3);
    expect(list.map((x) => x.starts_on)).toEqual(["2026-10-26", "2026-10-12", "2026-09-28"]);
    expect(periodDates(list[0])).toHaveLength(14);
    expect(periodDates(periodFor(OFFICE, "2026-11-04"))).toHaveLength(28);
  });

  it("can only be approved once it has ended", () => {
    const p = periodFor(BIWEEKLY, "2026-10-12"); // ends 10/25
    expect(periodEnded(p, "2026-10-25")).toBe(false);
    expect(periodEnded(p, "2026-10-26")).toBe(true);
  });

  it("the schedule in force is the latest link started by that date", () => {
    const links = [
      { employee_id: 7, schedule_id: 1, effective_from: "2026-10-12" },
      { employee_id: 7, schedule_id: 2, effective_from: "2026-11-13" },
      { employee_id: 7, schedule_id: null, effective_from: "2027-01-01" },
      { employee_id: 8, schedule_id: 2, effective_from: "2026-10-16" },
    ];
    expect(scheduleInForce(links, 7, "2026-10-11")).toBeNull();
    expect(scheduleInForce(links, 7, "2026-10-12")).toBe(1);
    expect(scheduleInForce(links, 7, "2026-11-13")).toBe(2);
    expect(scheduleInForce(links, 7, "2027-02-01")).toBeNull();
    expect(scheduleInForce(links, 9, "2026-12-01")).toBeNull();
  });
});

const shift = (day: string, minutes: number, needsReview = false): Shift => ({ inId: 1, outId: 2, inAt: `${day}T11:00:00Z`, outAt: `${day}T20:00:00Z`, suggestedOutAt: null, projectId: null, managerNote: null, day, minutes, flags: needsReview ? ["long"] : [], needsReview });

describe("the pay line", () => {
  const rates = [
    { employee_id: 1, hourly_rate: 25, effective_from: "2026-01-01" },
    { employee_id: 1, hourly_rate: 27, effective_from: "2026-10-14" },
  ];

  it("multiplies each day's hours by the rate in force that day", () => {
    const line = payLine([shift("2026-10-12", 480), shift("2026-10-13", 60), shift("2026-10-14", 600)], rates);
    expect(line.minutes).toBe(1140);
    expect(line.amount).toBe(8 * 25 + 1 * 25 + 10 * 27); // 495
    expect(line.rateText).toBe("$25.00 → $27.00");
    expect(line.total).toBe(495);
    expect(line.toReview).toBe(0);
  });

  it("pays PTO at the day's rate and adds earlier adjustments", () => {
    const line = payLine([shift("2026-10-12", 480)], rates, [{ day: "2026-10-15", minutes: 420 }], 12.5);
    expect(line.ptoMinutes).toBe(420);
    expect(line.amount).toBe(200 + 7 * 27);
    expect(line.adjustments).toBe(12.5);
    expect(line.total).toBe(200 + 189 + 12.5);
  });

  it("leaves the amount empty while a worked day has no rate, and counts shifts to review", () => {
    const line = payLine([shift("2025-12-30", 480), shift("2026-10-12", 60, true)], rates);
    expect(line.amount).toBeNull();
    expect(line.total).toBeNull();
    expect(line.missingRateDays).toEqual(["2025-12-30"]);
    expect(line.toReview).toBe(1);
    expect(line.rateText).toBe("$25.00");
  });

  it("writes an Excel-friendly CSV", () => {
    const csv = periodCsv([{ name: "Gurgel, Carlos", frequency: "Biweekly", period: "10/12/2026 – 10/25/2026", line: payLine([shift("2026-10-12", 525)], rates) }]);
    expect(csv.startsWith("﻿Name,Pay schedule,Period,Hours,PTO hours,Rate,Amount,Adjustments,Total,Needs review,Timesheet,Approved by\r\n")).toBe(true);
    expect(csv).toContain('"Gurgel, Carlos",Biweekly,10/12/2026 – 10/25/2026,8.75,0,$25.00,218.75,0,218.75,0,,');
    expect(hours(525)).toBe(8.75);
  });
});
