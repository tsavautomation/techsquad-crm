import { describe, expect, it } from "vitest";
import { applyPing, formatMinutes, sumUsage } from "@/lib/usage/engine";

// ADM-b Usage (SPEC §9.1 ADM-b): how heartbeats become time, sessions and pages.
const at = (s: string) => new Date(`2026-10-14T${s}:00Z`);

describe("applyPing", () => {
  it("starts a day with the first ping", () => {
    expect(applyPing(null, at("12:00"), true)).toEqual({ first_at: "2026-10-14T12:00:00.000Z", last_at: "2026-10-14T12:00:00.000Z", active_seconds: 0, sessions: 1, pages: 1 });
  });
  it("credits the gap since the last ping, up to three minutes", () => {
    const a = applyPing(null, at("12:00"), true);
    const b = applyPing(a, at("12:01"), false);
    expect(b.active_seconds).toBe(60);
    const c = applyPing(b, at("12:10"), true); // tab was idle: only the cap counts
    expect(c.active_seconds).toBe(60 + 180);
    expect(c.pages).toBe(2);
    expect(c.sessions).toBe(1);
  });
  it("counts a new session after a 30-minute pause", () => {
    const a = applyPing(null, at("08:00"), true);
    const b = applyPing(a, at("08:29"), true);
    expect(b.sessions).toBe(1);
    const c = applyPing(b, at("09:00"), true);
    expect(c.sessions).toBe(2);
    expect(c.active_seconds).toBe(180 + 180);
  });
});

describe("formatting and totals", () => {
  it("shows minutes and hours", () => {
    expect(formatMinutes(0)).toBe("0m");
    expect(formatMinutes(35 * 60)).toBe("35m");
    expect(formatMinutes(125 * 60)).toBe("2h 05m");
  });
  it("sums days", () => {
    expect(sumUsage([{ active_seconds: 60, sessions: 1, pages: 3 }, { active_seconds: 120, sessions: 2, pages: 1 }])).toEqual({ seconds: 180, sessions: 3, days: 2, pages: 4 });
    expect(sumUsage([])).toEqual({ seconds: 0, sessions: 0, days: 0, pages: 0 });
  });
});
