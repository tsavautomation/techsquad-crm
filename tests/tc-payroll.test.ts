// TC-e / TC-f Pay periods (SPEC §9.1, Stage 3): period boundaries and the line per person.
import { describe, expect, it } from "vitest";
import { hours, payLine, periodCsv } from "@/lib/payroll/engine";
import { nextPeriod, parsePayrollSettings, periodDates, periodEnded, periodFor, previousPeriod, recentPeriods } from "@/lib/payroll/periods";
import type { Shift } from "@/lib/time-clock/timesheet";

const S = parsePayrollSettings({ biweekly_anchor: "2026-10-05", days_after: { Biweekly: 5, "Semi-monthly": 5, Monthly: 5 } });

describe("periods", () => {
  it("biweekly runs 14 days from the anchor Monday", () => {
    expect(periodFor("Biweekly", "2026-10-12", S)).toEqual({ frequency: "Biweekly", starts_on: "2026-10-05", ends_on: "2026-10-18", pay_day: "2026-10-23" });
    expect(periodFor("Biweekly", "2026-10-19", S).starts_on).toBe("2026-10-19");
    expect(periodFor("Biweekly", "2026-10-04", S)).toMatchObject({ starts_on: "2026-09-21", ends_on: "2026-10-04" });
    expect(periodFor("Biweekly", "2026-01-01", S)).toMatchObject({ starts_on: "2025-12-29", ends_on: "2026-01-11" });
  });

  it("semi-monthly is 1–15 and 16–end of month", () => {
    expect(periodFor("Semi-monthly", "2026-10-15", S)).toMatchObject({ starts_on: "2026-10-01", ends_on: "2026-10-15", pay_day: "2026-10-20" });
    expect(periodFor("Semi-monthly", "2026-10-16", S)).toMatchObject({ starts_on: "2026-10-16", ends_on: "2026-10-31", pay_day: "2026-11-05" });
    expect(periodFor("Semi-monthly", "2026-02-20", S)).toMatchObject({ starts_on: "2026-02-16", ends_on: "2026-02-28" });
    expect(periodFor("Semi-monthly", "2028-02-20", S).ends_on).toBe("2028-02-29");
  });

  it("monthly is the calendar month", () => {
    expect(periodFor("Monthly", "2026-10-21", S)).toMatchObject({ starts_on: "2026-10-01", ends_on: "2026-10-31", pay_day: "2026-11-05" });
    expect(periodFor("Monthly", "2026-12-31", S).pay_day).toBe("2027-01-05");
  });

  it("walks forward and back without gaps", () => {
    const p = periodFor("Semi-monthly", "2026-10-10", S);
    expect(nextPeriod(p, S).starts_on).toBe("2026-10-16");
    expect(previousPeriod(p, S)).toMatchObject({ starts_on: "2026-09-16", ends_on: "2026-09-30" });
    const list = recentPeriods("Biweekly", "2026-10-21", 3, S);
    expect(list.map((x) => x.starts_on)).toEqual(["2026-10-19", "2026-10-05", "2026-09-21"]);
    expect(periodDates(p)).toHaveLength(15);
  });

  it("can only be approved once it has ended", () => {
    const p = periodFor("Biweekly", "2026-10-12", S); // ends 10/18
    expect(periodEnded(p, "2026-10-18")).toBe(false);
    expect(periodEnded(p, "2026-10-19")).toBe(true);
  });

  it("falls back to defaults on bad settings", () => {
    expect(parsePayrollSettings({ biweekly_anchor: "nope" }).biweekly_anchor).toBe("2026-10-05");
  });
});

const shift = (day: string, minutes: number, needsReview = false): Shift => ({ inId: 1, outId: 2, inAt: `${day}T11:00:00Z`, outAt: `${day}T20:00:00Z`, day, minutes, flags: needsReview ? ["long"] : [], needsReview });

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
    const csv = periodCsv([{ name: "Gurgel, Carlos", frequency: "Biweekly", period: "10/5/2026 – 10/18/2026", line: payLine([shift("2026-10-12", 525)], rates) }]);
    expect(csv.startsWith("﻿Name,Pay frequency,Period,Hours,PTO hours,Rate,Amount,Adjustments,Total,Needs review,Weeks approved,Approved by\r\n")).toBe(true);
    expect(csv).toContain('"Gurgel, Carlos",Biweekly,10/5/2026 – 10/18/2026,8.75,0,$25.00,218.75,0,218.75,0,,');
    expect(hours(525)).toBe(8.75);
  });
});
