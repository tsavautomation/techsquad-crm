// F1 Scheduling: week boundaries, overlapping visits side by side, repeating series (Eastern time).
import { describe, expect, it } from "vitest";
import { toDateTimeLocalET } from "@/lib/dates";
import { addDays, clock, lanes, weekStartOf } from "@/lib/schedule/dates";
import { seriesStarts } from "@/lib/schedule/series";
import { getTable, NEW_TABLES } from "@/registry";

describe("calendar weeks", () => {
  it("weeks start on Sunday", () => {
    expect(weekStartOf("2026-09-30")).toBe("2026-09-27"); // Wednesday → Sunday
    expect(weekStartOf("2026-09-27")).toBe("2026-09-27");
    expect(weekStartOf("2027-01-02")).toBe("2026-12-27"); // across the new year
    expect(addDays("2026-02-27", 2)).toBe("2026-03-01");
  });

  it("shows times the American way", () => {
    expect(clock("09:05")).toBe("9:05 AM");
    expect(clock("12:30")).toBe("12:30 PM");
    expect(clock("00:15")).toBe("12:15 AM");
    expect(clock("17:00")).toBe("5:00 PM");
  });
});

describe("overlapping visits", () => {
  it("get side-by-side lanes only while they overlap", () => {
    const out = lanes([
      { id: 1, start: 540, end: 660 }, // 9–11
      { id: 2, start: 600, end: 720 }, // 10–12 overlaps 1
      { id: 3, start: 690, end: 750 }, // 11:30–12:30 overlaps 2, not 1
      { id: 4, start: 780, end: 840 }, // 13–14 alone
    ]);
    const by = Object.fromEntries(out.map((x) => [x.id, [x.lane, x.lanes]]));
    expect(by[1]).toEqual([0, 2]);
    expect(by[2]).toEqual([1, 2]);
    expect(by[3]).toEqual([0, 2]); // reuses lane 0 once visit 1 has ended
    expect(by[4]).toEqual([0, 1]);
  });
});

describe("repeating visits", () => {
  const et = (iso: string) => toDateTimeLocalET(iso);

  it("keeps 9:00 AM Eastern across the daylight-saving change", () => {
    const first = new Date("2026-10-26T13:00:00Z").toISOString(); // Mon 9:00 EDT
    const s = seriesStarts(first, "weekly", 3).map(et);
    expect(s).toEqual(["2026-10-26T09:00", "2026-11-02T09:00", "2026-11-09T09:00"]); // Nov 1 = back to EST
  });

  it("monthly on the 31st falls back to the month's last day", () => {
    const first = new Date("2027-01-31T15:00:00Z").toISOString(); // 10:00 EST
    expect(seriesStarts(first, "monthly", 3).map(et)).toEqual(["2027-01-31T10:00", "2027-02-28T10:00", "2027-03-31T10:00"]);
  });

  it("caps a series at 24 visits and never returns fewer than one", () => {
    const first = new Date("2026-10-05T13:00:00Z").toISOString();
    expect(seriesStarts(first, "biweekly", 99)).toHaveLength(24);
    expect(seriesStarts(first, "yearly", 0)).toHaveLength(1);
  });
});

describe("Visits table", () => {
  it("is a new table (not in the WebAuthor parity checks) with the Schedule tab", () => {
    const v = getTable("visits");
    expect(NEW_TABLES).toContain(v);
    expect(v.origin).toBe("new");
    expect(v.module).toBe("schedule");
    expect(v.fields.filter((f) => f.createOnly).map((f) => f.name)).toEqual(["repeat", "repeat_count"]);
    expect(v.fields.find((f) => f.name === "service_type")?.options).toEqual([]); // admins add them (option C)
  });
});
