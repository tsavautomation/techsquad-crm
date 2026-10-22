import { describe, expect, it } from "vitest";
import { personStatus } from "@/lib/field-day/day";
import { AT_PLACE_M, FAR_AWAY_M, formatDistance, tooFar } from "@/lib/time-clock/clock";

// F29 (Fred 2026-10-22): check-in per person; the "you are far away" question; distances in ft / miles.

const T = "2026-10-22T11:00:00.000Z";

describe("F29-a one person's state on a shared visit", () => {
  it("follows the person's own row, not the team", () => {
    expect(personStatus(null, "On site")).toBe("Scheduled"); // Daniel checked in; Jeferson has not
    expect(personStatus({ on_way_at: T, checked_in_at: null, checked_out_at: null }, "On site")).toBe("On the way");
    expect(personStatus({ on_way_at: null, checked_in_at: T, checked_out_at: null }, "Scheduled")).toBe("On site");
    expect(personStatus({ on_way_at: null, checked_in_at: T, checked_out_at: T }, "On site")).toBe("Done");
  });
  it("a cancelled visit is cancelled for everyone", () => {
    expect(personStatus({ on_way_at: null, checked_in_at: T, checked_out_at: null }, "Cancelled")).toBe("Cancelled");
  });
});

describe("F29-b far-away question and US distances", () => {
  const office = { lat: 26.4176, lng: -80.0922 };
  it("asks beyond 1000 ft, not within", () => {
    expect(FAR_AWAY_M).toBe(305);
    expect(tooFar({ lat: 26.4176, lng: -80.0922 }, office)).toBeNull();
    expect(tooFar({ lat: 26.4176, lng: -80.0952 }, office)).toBeNull(); // ~300 m = 980 ft
    const far = tooFar({ lat: 26.4276, lng: -80.0922 }, office); // ~1.1 km
    expect(far).not.toBeNull();
    expect(far!).toBeGreaterThan(1000);
    expect(tooFar(null, office)).toBeNull();
    expect(tooFar({ lat: 26.5, lng: -80.2 }, null)).toBeNull();
  });
  it("shows nothing under 500 ft, feet under a mile, then miles", () => {
    expect(AT_PLACE_M).toBe(152);
    expect(formatDistance(null)).toBe("");
    expect(formatDistance(120)).toBe("");
    expect(formatDistance(151)).toBe("");
    expect(formatDistance(260)).toBe("850 ft");
    expect(formatDistance(1000)).toBe("3280 ft");
    expect(formatDistance(1609)).toBe("5280 ft");
    expect(formatDistance(1700)).toBe("1.1 mi");
    expect(formatDistance(3700)).toBe("2.3 mi");
  });
});
