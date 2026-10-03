// F9 Job hours: the pure engine (team credit, per project, per person) and the places that reuse it.
import { describe, expect, it } from "vitest";
import { daySummary } from "@/lib/field-day/day";
import { crew, hoursByProject, hoursByTech, projectHours, visitHours, windowMinutes, type HoursVisit } from "@/lib/hours/engine";
import { onSiteByTech } from "@/lib/insights/stats";

const NOW = Date.parse("2026-10-02T20:00:00Z");
const V = (o: Partial<HoursVisit>): HoursVisit => ({
  id: 1,
  project_id: 10,
  starts_at: "2026-10-02T13:00:00Z",
  status: "Done",
  duration: "120",
  technician_id: 1,
  team_ids: [],
  checked_in_at: "2026-10-02T13:00:00Z",
  checked_out_at: "2026-10-02T16:00:00Z",
  ...o,
});

describe("one visit", () => {
  it("credits the technician and everyone also going, once each, technician first", () => {
    expect(crew({ technician_id: 1, team_ids: [2, 1, 3, 2] })).toEqual([1, 2, 3]);
    expect(crew({ technician_id: null, team_ids: [4] })).toEqual([4]);
    expect(crew({ technician_id: null, team_ids: null })).toEqual([]);
  });

  it("measures check-in → check-out, or → now while still on site", () => {
    expect(windowMinutes({ checked_in_at: "2026-10-02T13:00:00Z", checked_out_at: "2026-10-02T15:15:00Z" }, NOW)).toBe(135);
    expect(windowMinutes({ checked_in_at: "2026-10-02T18:30:00Z", checked_out_at: null }, NOW)).toBe(90);
    expect(windowMinutes({ checked_in_at: null, checked_out_at: null }, NOW)).toBeNull();
    expect(windowMinutes({ checked_in_at: "2026-10-02T15:00:00Z", checked_out_at: "2026-10-02T13:00:00Z" }, NOW)).toBe(0);
  });

  it("keeps planned per person and real per visit", () => {
    const h = visitHours(V({ team_ids: [2], checked_out_at: null, checked_in_at: "2026-10-02T19:00:00Z" }), NOW);
    expect(h).toMatchObject({ people: [1, 2], plannedMin: 120, realMin: 60, open: true });
  });
});

describe("hours per job (F9-a: 3 h on site with a helper = 6 technician-hours, 3 each)", () => {
  const visits = [
    V({ id: 1, team_ids: [2] }), // 3 h, two people
    V({ id: 2, starts_at: "2026-10-03T13:00:00Z", duration: "60", checked_in_at: "2026-10-03T13:00:00Z", checked_out_at: "2026-10-03T13:45:00Z" }), // 45 min alone
    V({ id: 3, starts_at: "2026-10-04T13:00:00Z", technician_id: 3, checked_in_at: null, checked_out_at: null }), // planned only
    V({ id: 4, status: "Cancelled", duration: "480" }),
  ];

  it("adds technician-hours on site and planned the same way, and lists visits latest first", () => {
    const p = projectHours(visits, NOW);
    expect(p.visits.map((v) => v.id)).toEqual([3, 2, 1]);
    expect(p.timed).toBe(2);
    expect(p.onSiteMin).toBe(180 * 2 + 45); // 405 technician-minutes
    expect(p.clockMin).toBe(225);
    expect(p.plannedMin).toBe(120 * 2 + 60 + 120); // 420
    expect(p.people).toBe(3);
    expect(p.open).toBe(false);
  });

  it("splits the hours per person, helpers included", () => {
    const by = hoursByTech(visits, NOW);
    expect(by.get(1)).toEqual({ id: 1, visits: 2, timed: 2, min: 225 });
    expect(by.get(2)).toEqual({ id: 2, visits: 1, timed: 1, min: 180 });
    expect(by.get(3)).toEqual({ id: 3, visits: 1, timed: 0, min: 0 });
    expect(by.has(null)).toBe(false);
    expect(projectHours(visits, NOW).byTech.map((t) => t.id)).toEqual([1, 2, 3]);
  });

  it("puts visits with nobody on them under null", () => {
    expect(hoursByTech([V({ technician_id: null, team_ids: [] })], NOW).get(null)).toEqual({ id: null, visits: 1, timed: 1, min: 180 });
  });

  it("groups technician-hours per project for Insights", () => {
    const by = hoursByProject([...visits, V({ id: 5, project_id: 11, team_ids: [2, 3] }), V({ id: 6, project_id: null })], NOW);
    expect(by.get(10)).toEqual({ visits: 3, timed: 2, onSiteMin: 405, plannedMin: 420, people: 3 });
    expect(by.get(11)).toEqual({ visits: 1, timed: 1, onSiteMin: 540, plannedMin: 360, people: 3 });
    expect(by.get(null)).toEqual({ visits: 1, timed: 1, onSiteMin: 180, plannedMin: 120, people: 1 });
  });
});

describe("the same rule elsewhere", () => {
  it("Insights › hours per technician credits people also going", () => {
    const by = onSiteByTech([
      { service_type: null, technician_id: 1, team_ids: [2], status: "Done", duration: "120", checked_in_at: "2026-10-02T13:00:00Z", checked_out_at: "2026-10-02T16:00:00Z" },
      { service_type: null, technician_id: 2, status: "Done", duration: "60", checked_in_at: "2026-10-02T17:00:00Z", checked_out_at: "2026-10-02T17:30:00Z" },
    ]);
    expect(by.get(1)).toEqual({ visits: 1, min: 180 });
    expect(by.get(2)).toEqual({ visits: 2, min: 210 });
  });

  it("Today's day summary counts a visit the person is only 'also going' on (its times are the visit's)", () => {
    const sum = daySummary([{ starts_at: "2026-10-02T13:00:00Z", on_way_at: null, checked_in_at: "2026-10-02T13:00:00Z", checked_out_at: "2026-10-02T16:00:00Z" }], NOW);
    expect(sum.onSiteMin).toBe(180);
  });
});
