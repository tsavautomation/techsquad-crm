import { describe, expect, it } from "vitest";
import { distanceKm, estimatedDriveMin, realityFlags, type RealityInput } from "@/lib/reports/reality";
import { proposedStart } from "@/lib/ai/review-apply";

// F19-b Report vs. reality: arrival vs the drive from the warehouse, hours vs the clock, vehicle, van position.

const office = { lat: 25.9, lng: -80.2 }; // Hollywood-ish
const site = { lat: 25.98, lng: -80.2 }; // ~9 km north → about 17 min
const T = (h: number, m = 0) => `2026-10-05T${String(h + 4).padStart(2, "0")}:${String(m).padStart(2, "0")}:00.000Z`; // EDT

const base = (): RealityInput => ({
  visit: { starts_at: T(9), on_way_at: T(8, 30), checked_in_at: T(8, 55), checked_out_at: T(12), vehicle_id: 7, site },
  report: { vehicle_id: 7 },
  entries: [
    { kind: "clock_in", at: T(8), place: "Office", lat: null, lng: null },
    { kind: "clock_out", at: T(17), place: "Office", lat: null, lng: null },
  ],
  office,
  trips: [{ start: T(8, 30), end: T(8, 52), endLat: site.lat + 0.001, endLng: site.lng }],
  thresholdMin: 30,
  graceMin: 15,
});

describe("geometry", () => {
  it("measures distance and estimates the drive", () => {
    expect(distanceKm(office, site)).toBeCloseTo(8.9, 0);
    expect(estimatedDriveMin(office, site)).toBe(17);
    expect(estimatedDriveMin(office, office)).toBe(5);
  });
});

describe("realityFlags", () => {
  it("is quiet when everything agrees", () => {
    expect(realityFlags(base())).toEqual([]);
  });
  it("flags an arrival the drive doesn't explain, beyond the threshold and grace", () => {
    const i = base();
    i.visit!.checked_in_at = T(10, 0); // 90 min after leaving, drive 17 + 15 grace → 58 unexplained
    const f = realityFlags(i).filter((x) => x.key === "arrival");
    expect(f).toHaveLength(1);
    expect(f[0].minutes).toBe(58);
  });
  it("uses the office clock-in as the departure when On my way wasn't pressed", () => {
    const i = base();
    i.visit!.on_way_at = null;
    i.visit!.checked_in_at = T(9, 30); // 90 min after the 8:00 office clock-in
    expect(realityFlags(i).some((x) => x.key === "arrival")).toBe(true);
    i.entries[0].place = "Elsewhere";
    expect(realityFlags(i).some((x) => x.key === "arrival")).toBe(false);
  });
  it("notes a check-in pressed before the drive could be done", () => {
    const i = base();
    i.visit!.checked_in_at = T(8, 33); // 3 min after leaving, drive 17
    expect(realityFlags(i).map((x) => x.key)).toContain("early_checkin");
  });
  it("compares the on-site window with the clocked day", () => {
    const i = base();
    i.entries = [
      { kind: "clock_in", at: T(9, 40), place: "On site", lat: null, lng: null },
      { kind: "clock_out", at: T(11, 0), place: "On site", lat: null, lng: null },
    ];
    const keys = realityFlags(i).map((x) => x.key);
    expect(keys.filter((k) => k === "hours")).toHaveLength(3); // longer than clocked, in before clock-in, out after clock-out
  });
  it("says when there was no clock-in at all", () => {
    const i = base();
    i.entries = [];
    expect(realityFlags(i).map((x) => x.key)).toEqual(["no_clock"]);
  });
  it("flags a different vehicle on the report", () => {
    const i = base();
    i.report.vehicle_id = 8;
    expect(realityFlags(i).map((x) => x.key)).toEqual(["vehicle"]);
  });
  it("flags a van that never stopped at the site, and one with no trip at all", () => {
    const i = base();
    i.trips = [{ start: T(8, 30), end: T(8, 52), endLat: 26.2, endLng: -80.3 }];
    expect(realityFlags(i).map((x) => x.key)).toEqual(["van_position"]);
    i.trips = [];
    expect(realityFlags(i)[0].text).toMatch(/no trip that day/);
    i.trips = null;
    expect(realityFlags(i)).toEqual([]);
  });
});

describe("proposedStart (F19-a)", () => {
  it("lands on a weekday at 9:00, `days` after the report (3 when unsaid)", () => {
    expect(proposedStart("2026-10-05", null)).toBe("2026-10-08T09:00"); // Monday + 3 = Thursday
    expect(proposedStart("2026-10-08", 2)).toBe("2026-10-12T09:00"); // Thursday + 2 = Saturday → Monday
    expect(proposedStart("2026-10-05", 0)).toBe("2026-10-06T09:00"); // never the same day
  });
});
