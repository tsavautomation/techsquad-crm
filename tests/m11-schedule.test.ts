// Scheduled automations (PLAN M11): time-travel tests for Eastern-time slots and "days to today".
import { describe, expect, it } from "vitest";
import { conditionsMatch, type Conditions } from "@/lib/engine/conditions";
import { etSlot, runKeys } from "@/lib/engine/schedule";

const HOUR = 3_600_000;

describe("run slots in Eastern time", () => {
  it("the day changes at midnight Eastern, summer (EDT, UTC−4) and winter (EST, UTC−5)", () => {
    expect(runKeys(new Date("2026-07-15T03:59:00Z")).daily).toBe("daily:2026-07-14");
    expect(runKeys(new Date("2026-07-15T04:01:00Z")).daily).toBe("daily:2026-07-15");
    expect(runKeys(new Date("2026-01-15T04:59:00Z")).daily).toBe("daily:2026-01-14");
    expect(runKeys(new Date("2026-01-15T05:01:00Z")).daily).toBe("daily:2026-01-15");
    expect(runKeys(new Date("2026-01-15T05:01:00Z")).hourly).toBe("hourly:2026-01-15T00");
  });

  it("an hourly timer over a whole year yields exactly one daily slot per date, DST included", () => {
    const start = Date.UTC(2026, 0, 1, 5, 1); // 00:01 ET, Jan 1
    const daily = new Set<string>();
    const hourly: string[] = [];
    for (let t = start; t < start + 365 * 24 * HOUR; t += HOUR) {
      const k = runKeys(new Date(t));
      daily.add(k.daily);
      hourly.push(k.hourly);
    }
    expect(daily.size).toBe(365);
    // Spring forward (Mar 8) skips 02:00; fall back (Nov 1) repeats 01:00, which then runs once.
    expect(hourly).not.toContain("hourly:2026-03-08T02");
    expect(hourly.filter((h) => h === "hourly:2026-11-01T01")).toHaveLength(2);
    expect(new Set(hourly).size).toBe(hourly.length - 1);
  });

  it("the Vercel backup call (05:15 UTC) lands on the right Eastern date all year", () => {
    expect(etSlot(new Date("2026-07-15T05:15:00Z")).date).toBe("2026-07-15"); // 01:15 EDT
    expect(etSlot(new Date("2026-12-15T05:15:00Z")).date).toBe("2026-12-15"); // 00:15 EST
  });
});

describe("statuses flip overnight (days to today, SPEC §9.1 Q7)", () => {
  const permit: [string, Conditions][] = [
    ["Active", { match: "all", rules: [{ field: "expiration_date", days: true, op: "<=", value: -31 }] }],
    ["Renew Soon", { match: "all", rules: [{ field: "expiration_date", days: true, op: ">=", value: -30 }, { field: "expiration_date", days: true, op: "<=", value: -1 }] }],
    ["Expired", { match: "all", rules: [{ field: "expiration_date", days: true, op: ">=", value: 0 }] }],
  ];
  const statusAt = (utc: string, rec: Record<string, unknown>) =>
    permit.filter(([, c]) => conditionsMatch(c, rec, etSlot(new Date(utc)).date)).map(([s]) => s);

  it("a permit expiring 11/1/2026 changes at midnight Eastern, not midnight UTC", () => {
    const rec = { expiration_date: "2026-11-01" };
    expect(statusAt("2026-10-02T03:59:00Z", rec)).toEqual(["Active"]); // 11:59 PM 10/1 EDT
    expect(statusAt("2026-10-02T04:01:00Z", rec)).toEqual(["Renew Soon"]); // 12:01 AM 10/2: 30 days left
    expect(statusAt("2026-11-01T03:30:00Z", rec)).toEqual(["Renew Soon"]); // 11:30 PM 10/31 EDT
    expect(statusAt("2026-11-01T04:01:00Z", rec)).toEqual(["Expired"]); // 12:01 AM 11/1 EDT
  });

  it("a punch item due email fires only on due day and 7/14/30 days late", () => {
    const due: Conditions = { match: "any", rules: [0, 7, 14, 30].map((n) => ({ field: "due_date", days: true, op: "=" as const, value: n })) };
    const fired: string[] = [];
    for (let t = Date.UTC(2026, 11, 1, 5, 1); t < Date.UTC(2027, 1, 1); t += 24 * HOUR) {
      const today = etSlot(new Date(t)).date;
      if (conditionsMatch(due, { due_date: "2026-12-10" }, today)) fired.push(today);
    }
    expect(fired).toEqual(["2026-12-10", "2026-12-17", "2026-12-24", "2027-01-09"]);
  });
});
