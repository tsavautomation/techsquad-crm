// SS-a (Fred 2026-11-18): "on site" from the day's entries. A visit with no "Left the job" ends at the next job, the
// clock-out or the end of a past day; "now" only today while still clocked in; never more than the clocked time.
import { describe, expect, it } from "vitest";
import { fromDateTimeLocalET } from "@/lib/dates";
import { clockDay, leftPlan, siteStays, type TimeEntry } from "@/lib/time-clock/clock";

const at = (local: string) => fromDateTimeLocalET(local);
let n = 0;
const E = (kind: TimeEntry["kind"], local: string, visit_id: number | null = null, extra: Partial<TimeEntry> = {}): TimeEntry => ({ id: ++n, kind, at: at(local), visit_id, place: "Unknown", distance_m: null, lat: null, lng: null, ...extra });
const NEXT_DAY = Date.parse(at("2026-11-18T10:00"));

// Daniel's real day of 11/17/2026: two arrivals never closed, clock-out at 7:24 PM.
const daniel = () => [
  E("clock_in", "2026-11-17T06:54"),
  E("on_way", "2026-11-17T07:39", 20257),
  E("visit_in", "2026-11-17T09:23", 20257),
  E("on_way", "2026-11-17T11:23", 20247),
  E("visit_in", "2026-11-17T11:57", 20247),
  E("clock_out", "2026-11-17T19:24"),
];

describe("a visit with no exit", () => {
  it("ends at the clock-out", () => {
    const day = clockDay([E("clock_in", "2026-11-17T06:56"), E("on_way", "2026-11-17T07:44", 7), E("visit_in", "2026-11-17T09:42", 7), E("clock_out", "2026-11-17T16:18")], NEXT_DAY);
    expect(day.stays).toMatchObject([{ visitId: 7, endedBy: "clock_out", end: at("2026-11-17T16:18"), outId: null, minutes: 396 }]);
    expect(day.onSiteMin).toBe(396);
    expect(day.clockedMin).toBe(562);
    expect(day.noExit).toHaveLength(1);
  });

  it("ends when the person goes on the way to, or arrives at, another job", () => {
    const day = clockDay(daniel(), NEXT_DAY);
    expect(day.stays).toMatchObject([
      { visitId: 20257, endedBy: "on_way", end: at("2026-11-17T11:23"), minutes: 120 },
      { visitId: 20247, endedBy: "clock_out", end: at("2026-11-17T19:24"), minutes: 447 },
    ]);
    expect(day.onSiteMin).toBe(567); // not 45 h 36 min
    // Arrived at another job with no "On my way" in between: the arrival closes the one before.
    const marcelo = siteStays([E("clock_in", "2026-11-17T07:08"), E("clock_out", "2026-11-17T16:06"), E("visit_in", "2026-11-17T16:06", 20265), E("visit_in", "2026-11-17T16:06", 20278), E("visit_out", "2026-11-17T16:06", 20278)], NEXT_DAY);
    expect(marcelo).toMatchObject([
      { visitId: 20265, endedBy: "arrived", end: at("2026-11-17T16:06"), minutes: 0 },
      { visitId: 20278, endedBy: "left", minutes: 0 },
    ]);
  });

  it("on a past day with no clock-out ends at 23:59, never at now, and never passes the clocked time", () => {
    const entries = [E("clock_in", "2026-11-16T07:00"), E("visit_in", "2026-11-16T08:00", 5)];
    const day = clockDay(entries, NEXT_DAY);
    expect(day.stays).toMatchObject([{ endedBy: "end_of_day", end: at("2026-11-16T23:59"), minutes: 959 }]);
    expect(day.clockedMin).toBe(0); // a past day never closed counts nothing until the office fixes it
    expect(day.onSiteMin).toBe(0);
    // With the system's suggested clock-out (needs adjustment) the visit ends there, and still counts within the clocked time only.
    const closed = clockDay([...entries, E("clock_out", "2026-11-16T16:00", null, { needs_adjustment: true, auto_closed: true })], NEXT_DAY);
    expect(closed.stays[0]).toMatchObject({ endedBy: "clock_out", minutes: 480 });
    expect(closed.onSiteMin).toBe(0);
  });

  it("today runs until now only while the person is still clocked in", () => {
    const now = Date.parse(at("2026-11-18T10:00"));
    const working = clockDay([E("clock_in", "2026-11-18T07:00"), E("visit_in", "2026-11-18T08:30", 9)], now);
    expect(working.stays).toMatchObject([{ endedBy: "now", minutes: 90 }]);
    expect(working.onSiteMin).toBe(90);
    expect(working.clockedMin).toBe(180);
    expect(working.noExit).toEqual([]); // still there: not an alert
    // Arrived without being clocked in: nothing ends it and it counts nothing.
    const notClocked = clockDay([E("visit_in", "2026-11-18T08:30", 9)], now);
    expect(notClocked.stays).toMatchObject([{ endedBy: null, end: null, minutes: 0 }]);
    expect(notClocked.onSiteMin).toBe(0);
    expect(notClocked.noExit).toHaveLength(1);
  });

  it("the first event after the arrival ends it, and on site never passes the clocked time", () => {
    const day = clockDay([E("visit_in", "2026-11-17T08:00", 3), E("clock_in", "2026-11-17T09:00"), E("visit_out", "2026-11-17T12:00", 3), E("clock_out", "2026-11-17T11:00")], NEXT_DAY);
    expect(day.stays).toMatchObject([{ endedBy: "clock_out", minutes: 180, outId: expect.any(Number) }]); // the later Left is its exit
    expect(day.noExit).toEqual([]);
    expect(day.clockedMin).toBe(120);
    expect(day.onSiteMin).toBe(120);
  });
});

describe("the Left the job the system writes", () => {
  it("writes one per open visit at the time of what ended it", () => {
    expect(leftPlan(daniel(), NEXT_DAY)).toEqual({
      create: [
        { visitId: 20257, inId: expect.any(Number), at: at("2026-11-17T11:23"), reason: "on_way" },
        { visitId: 20247, inId: expect.any(Number), at: at("2026-11-17T19:24"), reason: "clock_out" },
      ],
      move: [],
    });
  });
  it("writes nothing for a visit still going on, or closed by the person", () => {
    const now = Date.parse(at("2026-11-18T10:00"));
    expect(leftPlan([E("clock_in", "2026-11-18T07:00"), E("visit_in", "2026-11-18T08:30", 9)], now)).toEqual({ create: [], move: [] });
    expect(leftPlan([E("clock_in", "2026-11-17T07:00"), E("visit_in", "2026-11-17T08:30", 9), E("visit_out", "2026-11-17T12:00", 9), E("clock_out", "2026-11-17T16:00")], NEXT_DAY)).toEqual({ create: [], move: [] });
  });
  it("is idempotent, and follows a corrected clock-out", () => {
    const entries = [...daniel(), E("visit_out", "2026-11-17T11:23", 20257, { auto_closed: true }), E("visit_out", "2026-11-17T19:24", 20247, { auto_closed: true })];
    expect(leftPlan(entries, NEXT_DAY)).toEqual({ create: [], move: [] });
    const corrected = entries.map((e) => (e.kind === "clock_out" ? { ...e, at: at("2026-11-17T18:30") } : e));
    expect(leftPlan(corrected, NEXT_DAY)).toEqual({ create: [], move: [{ id: entries.at(-1)!.id, at: at("2026-11-17T18:30"), reason: "clock_out" }] });
    // One the office corrected by hand is left alone.
    const byHand = corrected.map((e) => (e.id === entries.at(-1)!.id ? { ...e, corrected_at: at("2026-11-18T09:00") } : e));
    expect(leftPlan(byHand, NEXT_DAY)).toEqual({ create: [], move: [] });
  });
  it("closes a past day with nothing else at the end of the day", () => {
    expect(leftPlan([E("visit_in", "2026-11-16T08:00", 5)], NEXT_DAY).create).toMatchObject([{ visitId: 5, at: at("2026-11-16T23:59"), reason: "end_of_day" }]);
  });
});
