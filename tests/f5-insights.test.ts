// F5: the Insights sums (planned vs real time, salespeople) and the Data page's duplicate finder.
import { describe, expect, it } from "vitest";
import { findDuplicates, onSiteByTech, realMinutes, realVsPlanned, reportResults, salespeople, type VisitTimes } from "@/lib/insights/stats";

const V = (o: Partial<VisitTimes>): VisitTimes => ({ service_type: "Install", technician_id: 1, status: "Done", duration: "120", checked_in_at: null, checked_out_at: null, ...o });

describe("planned vs real time", () => {
  it("measures check-in to check-out in minutes, or nothing when not timed", () => {
    expect(realMinutes({ checked_in_at: "2026-10-02T13:00:00Z", checked_out_at: "2026-10-02T15:15:00Z" })).toBe(135);
    expect(realMinutes({ checked_in_at: "2026-10-02T13:00:00Z", checked_out_at: null })).toBeNull();
    expect(realMinutes({ checked_in_at: "2026-10-02T15:00:00Z", checked_out_at: "2026-10-02T13:00:00Z" })).toBeNull();
  });

  it("averages per service type, only over the visits that have each figure, and skips cancelled ones", () => {
    const rows = realVsPlanned([
      V({ checked_in_at: "2026-10-02T13:00:00Z", checked_out_at: "2026-10-02T16:00:00Z" }),
      V({ duration: "60" }),
      V({ service_type: "Service call", duration: "30", checked_in_at: "2026-10-02T13:00:00Z", checked_out_at: "2026-10-02T13:20:00Z" }),
      V({ service_type: null, duration: null }),
      V({ status: "Cancelled", duration: "999" }),
    ]);
    expect(rows.map((r) => [r.type, r.n, r.plannedAvg, r.real, r.realAvg])).toEqual([
      ["Install", 2, 90, 1, 180],
      ["Service call", 1, 30, 1, 20],
      ["No service type", 1, 0, 0, 0],
    ]);
  });

  it("sums hours on site per technician", () => {
    const by = onSiteByTech([
      V({ checked_in_at: "2026-10-02T13:00:00Z", checked_out_at: "2026-10-02T14:00:00Z" }),
      V({ checked_in_at: "2026-10-02T15:00:00Z", checked_out_at: "2026-10-02T15:30:00Z" }),
      V({ technician_id: null }),
      V({ technician_id: 2, status: "Cancelled" }),
    ]);
    expect(by.get(1)).toEqual({ visits: 2, min: 90 });
    expect(by.get(null)).toEqual({ visits: 1, min: 0 });
    expect(by.has(2)).toBe(false);
  });

  it("counts job report results in a fixed order, old reports without one apart", () => {
    expect(reportResults([{ result: "Partial" }, { result: "Completed" }, { result: null }, { result: "Completed" }])).toEqual([
      { result: "Completed", n: 2 },
      { result: "Partial", n: 1 },
      { result: "No result", n: 1 },
    ]);
  });
});

describe("salespeople", () => {
  it("counts won / lost / open per salesperson with the win rate over decided projects", () => {
    const rows = salespeople(
      [
        { salesperson_id: 7, job_status: "Complete" },
        { salesperson_id: 7, job_status: "Proposal Denied" },
        { salesperson_id: 7, job_status: "Proposal Sent" },
        { salesperson_id: 7, job_status: "Installation" },
        { salesperson_id: 9, job_status: "Surveying" },
        { salesperson_id: null, job_status: "Complete" },
      ],
      (i) => [1000, 0, 0, 500, 0, 9000][i],
    );
    expect(rows).toEqual([
      { id: 7, n: 4, won: 2, lost: 1, open: 1, value: 1500, winRate: 67 },
      { id: 9, n: 1, won: 0, lost: 0, open: 1, value: 0, winRate: null },
      { id: null, n: 1, won: 1, lost: 0, open: 0, value: 9000, winRate: 100 },
    ]);
  });
});

describe("duplicates", () => {
  it("groups by the last 10 phone digits, email ignoring case, and name ignoring punctuation", () => {
    const groups = findDuplicates([
      { id: 1, name: "Ana Souza", phone: "(305) 555-0100", email: "Ana@x.com" },
      { id: 2, name: "ana  souza", phone: "+1 305 555 0100", email: "ana@x.com" },
      { id: 3, name: "Bo Li", phone: "305-555-0199", email: null },
      { id: 4, name: "Bo", phone: null, email: "" },
    ]);
    expect(groups.map((g) => [g.kind, g.ids])).toEqual([
      ["phone", [1, 2]],
      ["email", [1, 2]],
      ["name", [1, 2]],
    ]);
    expect(groups[0].value).toBe("(305) 555-0100");
  });

  it("never pairs records on a short name or a partial phone", () => {
    expect(findDuplicates([{ id: 1, name: "Bo", phone: "555", email: null }, { id: 2, name: "Bo", phone: "555", email: null }])).toEqual([]);
  });
});
