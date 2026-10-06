import { describe, expect, it } from "vitest";
import { autoCloseAt } from "@/lib/field-day/day";
import { fromDateTimeLocalET } from "@/lib/dates";

// F20 Forgotten check-outs (SPEC §9.1 F20-b): the check-out the system writes after midnight.
describe("autoCloseAt", () => {
  it("closes at the day's cut-off when the check-in came earlier", () => {
    const checkedIn = fromDateTimeLocalET("2026-10-05T09:12");
    expect(autoCloseAt(checkedIn, "2026-10-05", "16:00")).toBe(new Date(fromDateTimeLocalET("2026-10-05T16:00")).toISOString());
    expect(autoCloseAt(checkedIn, "2026-10-05", "17:00")).toBe(new Date(fromDateTimeLocalET("2026-10-05T17:00")).toISOString());
  });
  it("closes a minute after a check-in that came after the cut-off", () => {
    const checkedIn = fromDateTimeLocalET("2026-10-05T18:40");
    expect(autoCloseAt(checkedIn, "2026-10-05", "16:00")).toBe(new Date(Date.parse(checkedIn) + 60_000).toISOString());
  });
});
