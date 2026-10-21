// TC Timesheets (SPEC §9.1 TC-a / TC-b): the week per person and the shifts flagged for review.
import { describe, expect, it } from "vitest";
import { fromDateTimeLocalET } from "@/lib/dates";
import { formatHours, hoursDecimal, mondayOf, shiftsOf, weekDates, weekSheet, type SheetEntry } from "@/lib/time-clock/timesheet";

const at = (local: string) => fromDateTimeLocalET(local);
let n = 0;
const e = (kind: SheetEntry["kind"], local: string, extra: Partial<SheetEntry> = {}): SheetEntry => ({ id: ++n, kind, at: at(local), ...extra });
const NOW = Date.parse(at("2026-10-21T12:00"));
const TODAY = "2026-10-21";

describe("the week", () => {
  it("runs Monday to Sunday", () => {
    expect(mondayOf("2026-10-12")).toBe("2026-10-12"); // a Monday
    expect(mondayOf("2026-10-15")).toBe("2026-10-12"); // Thursday
    expect(mondayOf("2026-10-18")).toBe("2026-10-12"); // Sunday belongs to the week before
    expect(mondayOf("2026-10-19")).toBe("2026-10-19");
    expect(weekDates("2026-10-12")).toEqual(["2026-10-12", "2026-10-13", "2026-10-14", "2026-10-15", "2026-10-16", "2026-10-17", "2026-10-18"]);
  });

  it("formats hours for the cells and the exports", () => {
    expect(formatHours(0)).toBe("0:00");
    expect(formatHours(525)).toBe("8:45");
    expect(formatHours(65 * 60 + 5)).toBe("65:05");
    expect(hoursDecimal(525)).toBe(8.75);
    expect(hoursDecimal(10)).toBe(0.17);
  });
});

describe("shifts", () => {
  it("pairs clock-ins with clock-outs and ignores the visit steps", () => {
    const shifts = shiftsOf([e("clock_in", "2026-10-13T07:00"), e("on_way", "2026-10-13T07:30"), e("visit_in", "2026-10-13T08:00"), e("visit_out", "2026-10-13T12:00"), e("clock_out", "2026-10-13T16:30")], NOW, TODAY);
    expect(shifts).toHaveLength(1);
    expect(shifts[0].minutes).toBe(570);
    expect(shifts[0].flags).toEqual([]);
    expect(shifts[0].day).toBe("2026-10-13");
  });

  it("flags a shift under 5 minutes and one in the same minute", () => {
    const [s] = shiftsOf([e("clock_in", "2026-10-12T07:27"), e("clock_out", "2026-10-12T07:27")], NOW, TODAY);
    expect(s.minutes).toBe(0);
    expect(s.flags).toEqual(["short", "same_minute"]);
    expect(s.needsReview).toBe(true);
    const [t] = shiftsOf([e("clock_in", "2026-10-12T07:27"), e("clock_out", "2026-10-12T07:31")], NOW, TODAY);
    expect(t.flags).toEqual(["short"]);
    const [u] = shiftsOf([e("clock_in", "2026-10-12T07:27"), e("clock_out", "2026-10-12T07:32")], NOW, TODAY);
    expect(u.flags).toEqual([]);
  });

  it("flags clock-in / out / in within the same minute on both shifts", () => {
    // Marcelo, 2026-10-16: 15:43:43 out, 15:43:52 in, 15:43:57 out.
    const shifts = shiftsOf([e("clock_in", "2026-10-16T06:57"), e("clock_out", "2026-10-16T15:43"), e("clock_in", "2026-10-16T15:43"), e("clock_out", "2026-10-16T15:43")], NOW, TODAY);
    expect(shifts).toHaveLength(2);
    expect(shifts[0].flags).toEqual(["same_minute"]);
    expect(shifts[1].flags).toEqual(["short", "same_minute"]);
  });

  it("flags a shift over 14 hours", () => {
    const [s] = shiftsOf([e("clock_in", "2026-10-12T07:19"), e("clock_out", "2026-10-12T21:31")], NOW, TODAY);
    expect(s.minutes).toBe(852);
    expect(s.flags).toEqual(["long"]);
    const [t] = shiftsOf([e("clock_in", "2026-10-15T08:28"), e("clock_out", "2026-10-15T21:21")], NOW, TODAY);
    expect(t.flags).toEqual([]);
  });

  it("flags the system's clock-out and a past day never closed", () => {
    const [a] = shiftsOf([e("clock_in", "2026-10-14T06:54"), e("clock_out", "2026-10-14T16:00", { note: "Automatic clock-out: the day was never closed (F20)" })], NOW, TODAY);
    expect(a.flags).toEqual(["auto"]);
    expect(a.minutes).toBe(546);
    const [o] = shiftsOf([e("clock_in", "2026-10-14T06:54")], NOW, TODAY);
    expect(o.flags).toEqual(["open"]);
    expect(o.minutes).toBe(0);
    expect(o.outAt).toBeNull();
  });

  it("keeps today's open shift running until now, without a flag", () => {
    const [s] = shiftsOf([e("clock_in", "2026-10-21T07:00")], NOW, TODAY);
    expect(s.flags).toEqual([]);
    expect(s.minutes).toBe(300);
    expect(s.needsReview).toBe(false);
  });

  it("a reviewed shift keeps its flag but no longer asks for a look", () => {
    const [s] = shiftsOf([e("clock_in", "2026-10-12T07:19", { reviewed_at: "2026-10-20T10:00:00Z" }), e("clock_out", "2026-10-12T21:31")], NOW, TODAY);
    expect(s.flags).toEqual(["long"]);
    expect(s.needsReview).toBe(false);
  });

  it("a clock-in while already clocked in is ignored, and a stray clock-out too", () => {
    const shifts = shiftsOf([e("clock_out", "2026-10-13T06:00"), e("clock_in", "2026-10-13T07:00"), e("clock_in", "2026-10-13T07:10"), e("clock_out", "2026-10-13T12:00")], NOW, TODAY);
    expect(shifts).toHaveLength(1);
    expect(shifts[0].minutes).toBe(300);
  });

  it("a shift that ends after midnight belongs to the day it started", () => {
    const [s] = shiftsOf([e("clock_in", "2026-10-13T22:00"), e("clock_out", "2026-10-14T01:30")], NOW, TODAY);
    expect(s.day).toBe("2026-10-13");
    expect(s.minutes).toBe(210);
  });
});

describe("the week sheet", () => {
  it("sums each day and the week, and counts what is left to review", () => {
    const sheet = weekSheet(
      [
        e("clock_in", "2026-10-12T07:00"),
        e("clock_out", "2026-10-12T16:00"),
        e("clock_in", "2026-10-13T07:00"),
        e("clock_out", "2026-10-13T07:00"),
        e("clock_in", "2026-10-13T11:00"),
        e("clock_out", "2026-10-13T15:50"),
        e("clock_in", "2026-10-16T08:00"),
        e("clock_out", "2026-10-16T16:30"),
      ],
      "2026-10-12",
      NOW,
      TODAY,
    );
    expect(sheet.days.map((d) => d.minutes)).toEqual([540, 290, 0, 0, 510, 0, 0]);
    expect(sheet.totalMinutes).toBe(1340);
    expect(sheet.toReview).toBe(1);
    expect(sheet.days[1].toReview).toBe(1);
    expect(sheet.days[1].shifts).toHaveLength(2);
  });
});
