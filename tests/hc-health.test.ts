import { describe, expect, it } from "vitest";
import { hoursSince, reportState, STALE_HOURS, type HealthReport } from "@/lib/health/report";

// HC-a: the nightly diagnostic's pure rules (what the Home page warns about).

const NOW = Date.parse("2026-10-31T05:00:00Z");
const report = (ranHoursAgo: number, checks: HealthReport["checks"]): HealthReport => ({ ran_at: new Date(NOW - ranHoursAgo * 3_600_000).toISOString(), by: "tick", ms: 100, checks });

describe("HC-a health report", () => {
  it("no report yet counts as stale, with nothing to list", () => {
    expect(reportState(null, NOW)).toEqual({ stale: true, problems: [] });
  });

  it("lists the failed checks and ignores skipped ones", () => {
    const r = report(1, [
      { key: "onedrive", label: "OneDrive", ok: true, detail: null },
      { key: "backup", label: "Nightly backup", ok: false, detail: "Last copy: 2026-10-28 (done)" },
      { key: "bouncie", label: "Bouncie (vehicles)", ok: true, skipped: true, detail: "Not connected" },
      { key: "wa_messages", label: "WhatsApp messages", ok: false, detail: "Nothing received in the last 24 h" },
    ]);
    const s = reportState(r, NOW);
    expect(s.stale).toBe(false);
    expect(s.problems.map((p) => p.key)).toEqual(["backup", "wa_messages"]);
  });

  it("a report older than STALE_HOURS is stale even when everything passed", () => {
    const fine = [{ key: "timer", label: "Hourly timer", ok: true, detail: null }];
    expect(reportState(report(STALE_HOURS - 1, fine), NOW).stale).toBe(false);
    expect(reportState(report(STALE_HOURS + 1, fine), NOW).stale).toBe(true);
  });

  it("hoursSince treats a missing time as forever ago", () => {
    expect(hoursSince(null, NOW)).toBe(Infinity);
    expect(hoursSince(new Date(NOW - 90 * 60_000).toISOString(), NOW)).toBeCloseTo(1.5);
  });
});
