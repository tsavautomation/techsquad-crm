// P2: time clock helpers and the performance score engine.
import { describe, expect, it } from "vitest";
import { aspectScores, band, byMonth, fade, overall, signals, skillsGrade } from "@/lib/performance/score";
import { clockDay, distanceM, minutesLate, parseTimeClock, placeFor, type TimeEntry } from "@/lib/time-clock/clock";

const OFFICE = { lat: 25.7617, lng: -80.1918 }; // downtown Miami
const SITE = { lat: 25.79, lng: -80.13 }; // Miami Beach

describe("places", () => {
  it("measures distance in metres", () => {
    expect(distanceM(OFFICE, OFFICE)).toBe(0);
    expect(distanceM(OFFICE, SITE)).toBeGreaterThan(6000);
    expect(distanceM(OFFICE, SITE)).toBeLessThan(8000);
  });

  it("labels the office, a job site, elsewhere and unknown", () => {
    expect(placeFor({ lat: 25.7618, lng: -80.1917 }, OFFICE, [SITE], 150)).toEqual({ place: "Office", distance_m: expect.any(Number) });
    expect(placeFor({ ...SITE, accuracy_m: 20 }, OFFICE, [SITE], 150)).toEqual({ place: "On site", distance_m: 0 });
    expect(placeFor({ lat: 25.7, lng: -80.3 }, OFFICE, [SITE], 150).place).toBe("Elsewhere");
    expect(placeFor(null, OFFICE, [SITE], 150)).toEqual({ place: "Unknown", distance_m: null });
  });

  it("widens the radius a little for a poor GPS fix, never beyond double", () => {
    const near = { lat: 25.7617, lng: -80.1898, accuracy_m: 400 }; // ~200 m east of the office
    expect(placeFor({ ...near, accuracy_m: 0 }, OFFICE, [], 150).place).toBe("Elsewhere");
    expect(placeFor(near, OFFICE, [], 150).place).toBe("Office");
  });

  it("parses settings with defaults", () => {
    const s = parseTimeClock({ office_address: "1 Main St", radius_m: 999 });
    expect(s).toMatchObject({ office_address: "1 Main St", radius_m: 999, start_time: "08:00", reminder: { Field: "17:00", Office: "18:00" } });
    expect(parseTimeClock({ radius_m: 5 }).radius_m).toBe(150); // out of range → defaults
  });
});

describe("the day", () => {
  const E = (id: number, kind: TimeEntry["kind"], at: string, visit_id: number | null = null): TimeEntry => ({ id, kind, at, visit_id, place: "Unknown", distance_m: null, lat: null, lng: null });

  it("adds up clocked and on-site minutes, open stretches run until now", () => {
    const day = clockDay(
      [E(1, "clock_in", "2026-10-02T12:00:00Z"), E(2, "visit_in", "2026-10-02T13:00:00Z", 9), E(3, "visit_out", "2026-10-02T15:30:00Z", 9), E(4, "visit_in", "2026-10-02T16:00:00Z", 10)],
      Date.parse("2026-10-02T17:00:00Z"),
    );
    expect(day.openSince).toBe("2026-10-02T12:00:00Z");
    expect(day.clockedMin).toBe(300);
    expect(day.onSiteMin).toBe(150 + 60);
    expect(day.lastOut).toBeNull();
  });

  it("closes the day at clock-out", () => {
    const day = clockDay([E(1, "clock_in", "2026-10-02T12:00:00Z"), E(2, "clock_out", "2026-10-02T20:15:00Z")], Date.parse("2026-10-03T00:00:00Z"));
    expect(day.openSince).toBeNull();
    expect(day.clockedMin).toBe(495);
    expect(day.lastOut).toBe("2026-10-02T20:15:00Z");
  });

  it("counts minutes late against the start time", () => {
    expect(minutesLate("07:55", "08:00")).toBe(0);
    expect(minutesLate("08:12", "08:00")).toBe(12);
  });
});

describe("performance score", () => {
  const now = Date.parse("2026-10-02T12:00:00Z");

  it("starts at 70 and moves ±5 × weight", () => {
    const s = aspectScores(
      [
        { date: "2026-10-01", type: "Positive", aspect: "Speed", weight: "Major" },
        { date: "2026-10-01", type: "Negative", aspect: "Punctuality", weight: "Minor" },
        { date: "2026-10-01", type: "Negative", aspect: "Punctuality", weight: null },
      ],
      now,
    );
    expect(s.find((x) => x.aspect === "Speed")).toMatchObject({ score: 85, positive: 1, negative: 0 });
    expect(s.find((x) => x.aspect === "Punctuality")).toMatchObject({ score: 55, positive: 0, negative: 2 });
    expect(s.find((x) => x.aspect === "Safety")!.score).toBe(70);
    expect(overall(s)).toBe(70); // (85 + 55) / 2
  });

  it("fades old reports and stays within 0–100", () => {
    expect(fade("2026-10-02", now)).toBeCloseTo(1, 2);
    expect(fade("2026-04-05", now)).toBeCloseTo(0.5, 1);
    const many = Array.from({ length: 20 }, () => ({ date: "2026-10-01", type: "Positive", aspect: "Speed", weight: "Major" }));
    expect(aspectScores(many, now).find((x) => x.aspect === "Speed")!.score).toBe(100);
    const old = aspectScores([{ date: "2025-10-02", type: "Negative", aspect: "Speed", weight: "Major" }], now);
    expect(old.find((x) => x.aspect === "Speed")!.score).toBe(66); // 15 points faded to ~3.75
  });

  it("puts reports with no aspect under General and bands the result", () => {
    const s = aspectScores([{ date: null, type: "Positive", aspect: null, weight: "Normal" }], now);
    expect(s.find((x) => x.aspect === "General")!.score).toBe(80);
    expect(band(90)).toBe("excellent");
    expect(band(70)).toBe("good");
    expect(band(60)).toBe("watch");
    expect(band(40)).toBe("attention");
  });

  it("counts positives and negatives per month", () => {
    const m = byMonth([{ date: "2026-10-01", type: "Positive", aspect: null, weight: null }, { date: "2026-08-15", type: "Negative", aspect: null, weight: null }], 3, now);
    expect(m.map((x) => x.month)).toEqual(["2026-08", "2026-09", "2026-10"]);
    expect(m[0].negative).toBe(1);
    expect(m[2].positive).toBe(1);
  });

  it("grades the skills grid and says what to work on next", () => {
    const g = skillsGrade({ Network: "Expert", Cabling: "Can do", "AV design": "Learning" }, ["Network", "Cabling", "AV design", "Sales"]);
    expect(g).toMatchObject({ points: 6, max: 12, score: 50, letter: "D" });
    expect(g.steps).toEqual([
      { skill: "Sales", from: null, to: "Learning" },
      { skill: "AV design", from: "Learning", to: "Can do" },
      { skill: "Cabling", from: "Can do", to: "Expert" },
    ]);
    expect(skillsGrade({ Network: "Expert", Cabling: "Expert" }, ["Network", "Cabling"])).toMatchObject({ score: 100, letter: "A", steps: [] });
    expect(skillsGrade({}).max).toBe(36);
  });

  it("turns field data into punctuality, speed and quality signals", () => {
    const s = signals({ clockIns: [0, 3, 20], checkIns: [0, 0], visits: [{ planned: 120, real: 120 }, { planned: 60, real: 90 }], results: ["Completed", "Completed", "Partial"], returns: 1 });
    expect(s.find((x) => x.key === "punctuality")!.score).toBe(84); // (67 + 100) / 2, rounded
    expect(s.find((x) => x.key === "speed")!.score).toBe(73); // ratio 1.25 → 85 − 12.5
    expect(s.find((x) => x.key === "quality")!.score).toBe(65); // 67 − 2
    expect(signals({ clockIns: [], checkIns: [], visits: [], results: [], returns: 0 }).every((x) => x.score === null)).toBe(true);
  });
});
