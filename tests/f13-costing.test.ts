// F13 Job costing: the rate in force on a day, and labour / materials / margin per project.
import { describe, expect, it } from "vitest";
import { costedMinutes, isPast, jobCosting, rateAt, visitDay, type RateRow } from "@/lib/costing/engine";
import type { HoursVisit } from "@/lib/hours/engine";

const NOW = Date.parse("2026-10-03T20:00:00Z");
const V = (o: Partial<HoursVisit>): HoursVisit => ({
  id: 1,
  project_id: 10,
  starts_at: "2026-10-02T13:00:00Z",
  status: "Done",
  duration: "120",
  technician_id: 1,
  team_ids: [],
  checked_in_at: "2026-10-02T13:00:00Z",
  checked_out_at: "2026-10-02T16:00:00Z", // 3 h
  ...o,
});
const rates: RateRow[] = [
  { employee_id: 1, hourly_rate: "30", effective_from: "2026-01-01" },
  { employee_id: 1, hourly_rate: 40, effective_from: "2026-10-01" },
  { employee_id: 2, hourly_rate: 25, effective_from: "2026-10-05" }, // only from the 5th
];

describe("rate in force", () => {
  it("takes the latest effective date on or before the day", () => {
    const mine = rates.filter((r) => r.employee_id === 1);
    expect(rateAt(mine, "2026-09-30")).toBe(30);
    expect(rateAt(mine, "2026-10-01")).toBe(40);
    expect(rateAt(mine, "2025-12-31")).toBeNull();
    expect(rateAt([], "2026-10-01")).toBeNull();
  });

  it("dates a visit by its check-in in Eastern time, else its start", () => {
    expect(visitDay({ starts_at: "2026-10-02T13:00:00Z", checked_in_at: "2026-10-03T02:30:00Z" })).toBe("2026-10-02"); // 10:30 PM Eastern
    expect(visitDay({ starts_at: "2026-10-02T13:00:00Z", checked_in_at: null })).toBe("2026-10-02");
  });
});

describe("job costing", () => {
  it("costs every person's minutes at their rate, flags unrated time and works out the margin", () => {
    const c = jobCosting(
      [
        V({ id: 1, team_ids: [2] }), // tech 1 at $40 × 3 h = 120; helper 2 has no rate yet
        V({ id: 2, starts_at: "2026-10-06T13:00:00Z", technician_id: 2, checked_in_at: "2026-10-06T13:00:00Z", checked_out_at: "2026-10-06T14:30:00Z" }), // 1.5 h × 25 = 37.50
        V({ id: 3, status: "Cancelled" }),
        V({ id: 4, checked_in_at: null, checked_out_at: null }), // F13-c: past, no check-in → its 120 planned minutes
        V({ id: 5, status: "Scheduled", starts_at: "2026-10-09T13:00:00Z", checked_in_at: null, checked_out_at: null }), // still to come: nothing
      ],
      rates,
      [{ cost: "199.99" }, { cost: 50 }, { cost: null }],
      1000,
      NOW,
      100.004, // parts of the approved proposals
    );
    expect(c.labour.map((l) => [l.id, l.minutes, l.unratedMin, l.plannedMin, l.rate, l.cost, l.visits])).toEqual([
      [1, 300, 0, 120, 40, 200, 2],
      [2, 270, 180, 0, 25, 37.5, 2],
    ]);
    expect(c.labourMin).toBe(570);
    expect(c.labourCost).toBe(237.5);
    expect(c.unratedMin).toBe(180);
    expect(c.plannedMin).toBe(120);
    expect(c.plannedVisits).toBe(1);
    expect(c.partsCost).toBe(100);
    expect(c.materialsCost).toBe(349.99);
    expect(c.materialsCount).toBe(3);
    expect(c.totalCost).toBe(587.49);
    expect(c.margin).toBe(412.51);
    expect(c.marginPct).toBe(41.3);
  });

  it("F13-c: a visit is past when it is Done or its planned window has ended; a forgotten check-out falls back to the plan", () => {
    const now = Date.parse("2026-10-02T14:30:00Z");
    expect(isPast(V({ status: "Scheduled", starts_at: "2026-10-02T13:00:00Z", duration: "60" }), now)).toBe(true);
    expect(isPast(V({ status: "Scheduled", starts_at: "2026-10-02T13:00:00Z", duration: "120" }), now)).toBe(false);
    expect(isPast(V({ status: "Done", starts_at: "2026-10-02T13:00:00Z", duration: "120" }), now)).toBe(true);
    expect(costedMinutes(V({ checked_in_at: null, checked_out_at: null, duration: "240" }), NOW)).toEqual({ min: 240, planned: true });
    expect(costedMinutes(V({ checked_in_at: "2026-09-01T13:00:00Z", checked_out_at: null, duration: "240" }), NOW)).toEqual({ min: 240, planned: true });
    expect(costedMinutes(V({}), NOW)).toEqual({ min: 180, planned: false });
    expect(costedMinutes(V({ status: "Scheduled", starts_at: "2026-10-09T13:00:00Z", checked_in_at: null, checked_out_at: null }), NOW)).toEqual({ min: 0, planned: false });
  });

  it("has no margin without an approved amount", () => {
    const c = jobCosting([V({})], rates, [], 0, NOW);
    expect(c.labourCost).toBe(120);
    expect(c.margin).toBeNull();
    expect(c.marginPct).toBeNull();
  });
});
