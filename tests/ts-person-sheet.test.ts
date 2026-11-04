// TS-b Person panel (SPEC §9.1): days of a period, week blocks and the totals at the top.
import { describe, expect, it } from "vitest";
import { fromDateTimeLocalET } from "@/lib/dates";
import { personDays, personTotals, reasonNeeded, weekBlocks, type DayOff } from "@/lib/time-clock/person-sheet";
import type { SheetEntry } from "@/lib/time-clock/timesheet";

const at = (local: string) => fromDateTimeLocalET(local);
let n = 0;
const e = (kind: SheetEntry["kind"], local: string, extra: Partial<SheetEntry> = {}): SheetEntry => ({ id: ++n, kind, at: at(local), ...extra });
const NOW = Date.parse(at("2026-10-30T12:00"));
const TODAY = "2026-10-30";

// A biweekly period 10/12 – 10/25 (Monday to Sunday twice) with a 10-hour Tuesday, a normal Wednesday, a
// system clock-out on Thursday and a paid day off on Friday.
const entries = [
  e("clock_in", "2026-10-13T07:00"),
  e("on_way", "2026-10-13T07:05"),
  e("clock_out", "2026-10-13T17:00"),
  e("clock_in", "2026-10-14T08:00"),
  e("clock_out", "2026-10-14T16:00"),
  e("clock_in", "2026-10-15T08:00"),
  e("clock_out", "2026-10-15T16:00", { needs_adjustment: true, auto_closed: true }),
  e("clock_in", "2026-10-20T08:00"),
  e("clock_out", "2026-10-20T12:30"),
];
const off: DayOff[] = [{ id: 1, day: "2026-10-16", kind: "Vacation", paid: true, minutes: 480, note: null }, { id: 2, day: "2026-10-23", kind: "Unpaid", paid: false, minutes: 480, note: null }];

describe("the person's days", () => {
  const days = personDays(entries, "2026-10-12", "2026-10-25", off, NOW, TODAY);

  it("has one row per day of the period, with that day's shifts and time off", () => {
    expect(days).toHaveLength(14);
    expect(days[0]).toMatchObject({ date: "2026-10-12", minutes: 0, shifts: [], timeOff: null });
    expect(days[1]).toMatchObject({ date: "2026-10-13", minutes: 600 });
    expect(days[3]).toMatchObject({ date: "2026-10-15", minutes: 0, toReview: 1 }); // the suggested clock-out counts 0
    expect(days[3].shifts[0].flags).toEqual(["adjust"]);
    expect(days[4].timeOff).toMatchObject({ kind: "Vacation", paid: true });
  });

  it("groups the days by week with a subtotal and the paid time off", () => {
    const blocks = weekBlocks(days);
    expect(blocks.map((b) => b.monday)).toEqual(["2026-10-12", "2026-10-19"]);
    expect(blocks[0].days).toHaveLength(7);
    expect(blocks[0]).toMatchObject({ minutes: 600 + 480, ptoMinutes: 480 });
    expect(blocks[1]).toMatchObject({ minutes: 270, ptoMinutes: 0 }); // the unpaid day never counts
  });

  it("cuts the blocks at the period's edges (a Friday anchor)", () => {
    const blocks = weekBlocks(personDays(entries, "2026-10-16", "2026-10-22", [], NOW, TODAY));
    expect(blocks.map((b) => [b.monday, b.days.length])).toEqual([
      ["2026-10-12", 3],
      ["2026-10-19", 4],
    ]);
  });

  it("totals regular, overtime past 9 h a day, PTO and the days worked", () => {
    expect(personTotals(days)).toEqual({ minutes: 1350, regular: 1290, overtime: 60, pto: 480, daysWorked: 3, toReview: 1 });
  });
});

describe("when a reason is asked", () => {
  it("only for changing a recorded time, never for filling an empty field or a suggestion", () => {
    expect(reasonNeeded({ recorded: true, suggested: false, changed: true })).toBe(true);
    expect(reasonNeeded({ recorded: true, suggested: false, changed: false })).toBe(false);
    expect(reasonNeeded({ recorded: true, suggested: true, changed: true })).toBe(false);
    expect(reasonNeeded({ recorded: false, suggested: false, changed: true })).toBe(false);
  });
});
