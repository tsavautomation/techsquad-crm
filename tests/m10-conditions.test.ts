// Automation conditions against SPEC §5 and the Q7 decisions (closed date gaps).
import { describe, expect, it } from "vitest";
import { conditionsMatch, daysToToday, eventsForChange, renderTokens, type Conditions } from "@/lib/engine/conditions";

const TODAY = "2026-09-25";
const days = (field: string, op: "<" | "<=" | ">" | ">=" | "=", value: number) => ({ field, days: true, op, value });

describe("days to today (US Eastern)", () => {
  it("is positive for past dates, negative for future", () => {
    expect(daysToToday("2026-09-20", TODAY)).toBe(5);
    expect(daysToToday("2026-10-05", TODAY)).toBe(-10);
    expect(daysToToday("2026-09-25", TODAY)).toBe(0);
    expect(daysToToday("2026-03-08", "2026-03-09")).toBe(1); // across the daylight-saving change
  });
});

/** Which status a set of mutually exclusive automations assigns for a date `offset` days from today. */
function statusFor(rules: [string, Conditions][], offset: number) {
  const d = new Date(Date.UTC(2026, 8, 25 - offset)).toISOString().slice(0, 10);
  return rules.filter(([, c]) => conditionsMatch(c, { date: d }, TODAY)).map(([s]) => s);
}

describe("date-driven statuses have no gaps or overlaps (SPEC §9.1 Q7)", () => {
  const permit: [string, Conditions][] = [
    ["Active", { match: "all", rules: [days("date", "<=", -31)] }],
    ["Renew Soon", { match: "all", rules: [days("date", ">=", -30), days("date", "<=", -1)] }],
    ["Expired", { match: "all", rules: [days("date", ">=", 0)] }],
  ];
  const maintenance: [string, Conditions][] = [
    ["Active", { match: "all", rules: [days("date", "<", 335)] }],
    ["Renewal Alert", { match: "all", rules: [days("date", ">=", 335), days("date", "<=", 365)] }],
    ["Expired", { match: "all", rules: [days("date", ">", 365)] }],
  ];
  const coi: [string, Conditions][] = [
    ["Active", { match: "all", rules: [days("date", "<", 0)] }],
    ["Expired", { match: "all", rules: [days("date", ">=", 0)] }],
  ];
  const license: [string, Conditions][] = [
    ["Active", { match: "all", rules: [days("date", "<=", 0)] }],
    ["Expired", { match: "all", rules: [days("date", ">=", 1)] }],
  ];

  it("every day from 400 days ahead to 400 days ago gets exactly one status", () => {
    for (const [name, set] of Object.entries({ permit, maintenance, coi, license })) {
      for (let offset = -400; offset <= 400; offset++) {
        expect(statusFor(set, offset), `${name} at ${offset} days`).toHaveLength(1);
      }
    }
  });

  it("permit boundaries", () => {
    expect(statusFor(permit, -31)).toEqual(["Active"]);
    expect(statusFor(permit, -30)).toEqual(["Renew Soon"]); // WebAuthor left this day out
    expect(statusFor(permit, -1)).toEqual(["Renew Soon"]);
    expect(statusFor(permit, 0)).toEqual(["Expired"]);
  });

  it("maintenance plan boundaries", () => {
    expect(statusFor(maintenance, 334)).toEqual(["Active"]); // WebAuthor gap
    expect(statusFor(maintenance, 335)).toEqual(["Renewal Alert"]); // WebAuthor gap
    expect(statusFor(maintenance, 366)).toEqual(["Expired"]);
  });

  it("driver's licence expires only after the date", () => {
    expect(statusFor(license, 0)).toEqual(["Active"]);
    expect(statusFor(license, 1)).toEqual(["Expired"]);
  });
});

describe("other conditions", () => {
  it("financial status compares two fields; empty counts as 0", () => {
    const current: Conditions = { match: "all", rules: [{ field: "invoiced_amount", op: "<=", field2: "paid_amount" }, { field: "financial_status", op: "!=", value: "Current" }] };
    expect(conditionsMatch(current, { invoiced_amount: null, paid_amount: null, financial_status: null })).toBe(true);
    expect(conditionsMatch(current, { invoiced_amount: 500, paid_amount: 200, financial_status: null })).toBe(false);
    expect(conditionsMatch(current, { invoiced_amount: 500, paid_amount: 500, financial_status: "Current" })).toBe(false);
  });

  it("punch due email: today or 7/14/30 days overdue ('any')", () => {
    const due: Conditions = { match: "any", rules: [0, 7, 14, 30].map((n) => days("due_date", "=", n)) };
    expect(conditionsMatch(due, { due_date: "2026-09-18" }, TODAY)).toBe(true); // 7 days ago
    expect(conditionsMatch(due, { due_date: "2026-09-17" }, TODAY)).toBe(false);
    expect(conditionsMatch(due, { due_date: null }, TODAY)).toBe(false);
  });

  it("empty / not empty and per-person ids", () => {
    expect(conditionsMatch({ match: "all", rules: [{ field: "submitted_at", op: "empty" }] }, { submitted_at: null })).toBe(true);
    expect(conditionsMatch({ match: "all", rules: [{ field: "pending_1", op: "not_empty" }] }, { pending_1: " " })).toBe(true);
    expect(conditionsMatch({ match: "all", rules: [{ field: "team_member_id", op: "=", value: 1012 }] }, { team_member_id: 1012 })).toBe(true);
  });
});

describe("events and tokens", () => {
  it("history entries raise WebAuthor-style events", () => {
    expect(eventsForChange("create", {})).toEqual(["added"]);
    expect(eventsForChange("update", { status: [1, 2] })).toEqual(["modified", "field:status"]);
    expect(eventsForChange("unsubmit", { submitted_at: [1, null], locked: [true, false] })).toContain("field:submitted_at");
    expect(eventsForChange("archive", { archived_at: [null, "x"] })).toEqual([]);
  });

  it("renders subject tokens", () => {
    expect(renderTokens("{project_id} ( {team_ids}) -  {date}", (f) => ({ project_id: "Gonzalez", team_ids: "Lucas", date: "9/25/2026" })[f] ?? "")).toBe(
      "Gonzalez ( Lucas) -  9/25/2026",
    );
  });
});
