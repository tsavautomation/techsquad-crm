import { describe, expect, it } from "vitest";
import { inPeriod, periods, scorecard, type ScoreReport } from "@/lib/reports/scorecard";

// F19-e Tech scorecards: periods and the counting.

const full = { text: true, result: true, materials: true, problems: true, photo: true };
const half = { text: true, result: true, materials: false, problems: false, photo: false };
const rows: ScoreReport[] = [
  { date: "2026-10-05", status: "on_time", completeness: full, result: "Completed", mismatches: 0 },
  { date: "2026-10-06", status: "on_time", completeness: half, result: "Partial", mismatches: 2 },
  { date: "2026-10-07", status: "late", completeness: full, result: "Not done", mismatches: 0 },
  { date: "2026-10-08", status: "missing", completeness: null, result: null, mismatches: 0 },
];

describe("periods", () => {
  it("gives the Monday–Sunday week, the month and last month", () => {
    expect(periods("2026-10-05")).toEqual({ week: { from: "2026-10-05", to: "2026-10-11" }, month: { from: "2026-10-01", to: "2026-10-31" }, lastMonth: { from: "2026-09-01", to: "2026-09-30" } });
    expect(periods("2026-10-11").week).toEqual({ from: "2026-10-05", to: "2026-10-11" }); // Sunday belongs to the week before
    expect(periods("2026-01-15").lastMonth).toEqual({ from: "2025-12-01", to: "2025-12-31" });
    expect(inPeriod("2026-10-11", periods("2026-10-05").week)).toBe(true);
    expect(inPeriod("2026-10-12", periods("2026-10-05").week)).toBe(false);
    expect(inPeriod(null, periods("2026-10-05").week)).toBe(false);
  });
});

describe("scorecard", () => {
  it("counts on time, late, missing, completeness, callbacks and mismatches", () => {
    expect(scorecard(rows, 3)).toEqual({ visits: 4, onTime: 2, late: 1, missing: 1, onTimePct: 50, completeness: 80, callbacks: 2, mismatches: 1, openPending: 3 });
  });
  it("has no percentages without reports", () => {
    expect(scorecard([], 0)).toEqual({ visits: 0, onTime: 0, late: 0, missing: 0, onTimePct: null, completeness: null, callbacks: 0, mismatches: 0, openPending: 0 });
  });
});
