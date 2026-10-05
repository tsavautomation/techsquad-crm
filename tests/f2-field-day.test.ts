// F2 Field day: the day's hours, return-card text and due dates, the Job Report result rules,
// and the automation actions (one checklist item per line, return card).
import { describe, expect, it } from "vitest";
import { check } from "@/lib/engine/automation-schema";
import { daySummary, formatMinutes, missingLines, parseFieldDay, returnCardDetails, returnDueDate, routeUrl } from "@/lib/field-day/day";
import { evaluateRules } from "@/lib/rules/evaluate";
import { getTable } from "@/registry";
import { REASONS } from "@/registry/tables/job_reports";

const at = (hhmm: string) => `2026-10-01T${hhmm}:00.000Z`;

describe("the technician's day", () => {
  it("adds time on site, travel between jobs and the whole day", () => {
    const s = daySummary([
      { starts_at: at("12:00"), on_way_at: at("11:30"), checked_in_at: at("12:00"), checked_out_at: at("14:00") },
      { starts_at: at("15:00"), on_way_at: null, checked_in_at: at("14:45"), checked_out_at: at("16:00") },
    ]);
    expect(s.onSiteMin).toBe(120 + 75);
    expect(s.travelMin).toBe(30 + 45); // "On my way" → check-in, then check-out → next check-in
    expect(s.spanMin).toBe(270); // 11:30 → 16:00
    expect(s.open).toBe(false);
  });

  it("counts a visit still on site up to now, and ignores long breaks as travel", () => {
    const s = daySummary(
      [
        { starts_at: at("08:00"), on_way_at: null, checked_in_at: at("08:00"), checked_out_at: at("09:00") },
        { starts_at: at("15:00"), on_way_at: null, checked_in_at: at("15:00"), checked_out_at: null },
      ],
      Date.parse(at("15:30")),
    );
    expect(s.onSiteMin).toBe(90);
    expect(s.travelMin).toBe(0); // 6 h between jobs is not travel
    expect(s.open).toBe(true);
    expect(s.ended).toBeNull();
  });

  it("shows minutes as hours and minutes", () => {
    expect(formatMinutes(135)).toBe("2 h 15 min");
    expect(formatMinutes(60)).toBe("1 h");
    expect(formatMinutes(0)).toBe("0 min");
  });

  it("routes from where the phone is through every stop", () => {
    expect(routeUrl([])).toBeNull();
    expect(routeUrl(["1 Main St, Miami, FL", "", "2 Ocean Dr, Miami Beach, FL"])).toBe("https://www.google.com/maps/dir//1%20Main%20St%2C%20Miami%2C%20FL/2%20Ocean%20Dr%2C%20Miami%20Beach%2C%20FL");
  });
});

describe("return cards", () => {
  const settings = parseFieldDay({ scheduler_employee_id: 1004, return_days: { "Missing material": 3, "Waiting on GC / builder": 5 } });

  it("splits What's missing into one item per line", () => {
    expect(missingLines("- 2 keystones\n\n• HDMI 6 ft\n1. HDMI 6 ft\n  wall plate  ")).toEqual(["2 keystones", "HDMI 6 ft", "wall plate"]);
    expect(missingLines(null)).toEqual([]);
  });

  it("is due by the reason's days, 3 when unknown", () => {
    expect(returnDueDate("Waiting on GC / builder", "2026-09-29", settings)).toBe("2026-10-04");
    expect(returnDueDate("Something new", "2026-09-29", settings)).toBe("2026-10-02");
  });

  it("falls back to empty settings when the stored value is broken", () => {
    expect(parseFieldDay({ scheduler_employee_id: "Jessica" })).toEqual({ scheduler_employee_id: null, return_days: {}, service_lists: {}, time_clock: expect.objectContaining({ radius_m: 150, start_time: "08:00" }), report_rule: { mode: "off", since: null } });
  });

  it("writes the card's details, flagging a 2nd partial in a row", () => {
    const text = returnCardDetails(
      { result: "Partial", partial_reason: "Missing material", waiting_on: null, missing_items: "2 keystones\nHDMI", bring_next: "Tall ladder", time_needed: "90", people_needed: 2, access_info: "Gate 1234" },
      true,
    );
    expect(text).toBe(
      ["2nd visit in a row that wasn't finished on this project.", "Return visit needed: Partial (Missing material).", "Missing:", "- 2 keystones", "- HDMI", "Bring: Tall ladder", "Needs: time 1 h 30 min, 2 people", "Access: Gate 1234"].join("\n"),
    );
  });

  it("has a due-days setting for every reason, as seeded", () => {
    expect(REASONS).toHaveLength(8);
    expect(getTable("job_reports").fields.find((f) => f.name === "partial_reason")!.options!.map((o) => o.value)).toEqual(REASONS);
  });
});

describe("Job Report result (rules 900201–900203)", () => {
  const jr = getTable("job_reports");

  it("asks why and what's missing only when the visit wasn't finished", () => {
    const done = evaluateRules(jr, { result: "Completed" });
    expect(done.visible.has("missing_items")).toBe(false);
    const partial = evaluateRules(jr, { result: "Partial" });
    expect(partial.visible.has("missing_items")).toBe(true);
    expect(partial.required.has("partial_reason")).toBe(true);
    expect(partial.required.has("missing_items")).toBe(true);
    const notDone = evaluateRules(jr, { result: "Not done" });
    expect(notDone.required.has("partial_reason")).toBe(true);
    expect(notDone.required.has("missing_items")).toBe(false);
  });

  it("clears the return details when switched back to Completed", () => {
    const r = evaluateRules(jr, { result: "Completed", missing_items: "HDMI", partial_reason: "Other" });
    expect(r.values.missing_items).toBeNull();
    expect(r.values.partial_reason).toBeNull();
  });

  it("keeps Pending 1–5 for old reports but off the form", () => {
    for (let n = 1; n <= 5; n++) expect(jr.fields.find((f) => f.name === `pending_${n}`)!.formHidden).toBe(true);
  });
});

describe("automation actions", () => {
  const base = { title: "x", active: true, events: ["added"], conditions: { match: "all" as const, rules: [] }, notes: null };

  it("accepts a line-by-line checklist and a return card on Job Reports", () => {
    expect(check(getTable("job_reports"), { ...base, actions: [{ type: "checklist", target: "project_id", item: "{missing_items}", lines: true }, { type: "return_card" }] })).toEqual([]);
  });

  it("refuses a return card on other tables", () => {
    expect(check(getTable("projects"), { ...base, actions: [{ type: "return_card" }] })).toEqual(["A return card can only come from a Job Report."]);
  });
});
