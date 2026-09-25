import { describe, expect, it } from "vitest";
import { formatDate, formatDateTime, fromDateTimeLocalET, toDateTimeLocalET, todayET } from "@/lib/dates";
import { joinTitleParts } from "@/lib/records/title-format";
import { newRecordValues, normalize, validate } from "@/lib/records/values";
import { evaluateRules } from "@/lib/rules/evaluate";
import { getTable } from "@/registry";

const lit = (text: string) => ({ text, token: false });
const tok = (text: string) => ({ text, token: true });

describe("record titles (SPEC §9.1 Q1)", () => {
  it("drops an empty middle part with its separator", () => {
    expect(joinTitleParts([tok("Brickell"), lit(" – "), tok(""), lit(" – "), tok("Applied")])).toBe("Brickell – Applied");
  });
  it("drops a bracketed empty part", () => {
    expect(joinTitleParts([tok("2020"), lit(" "), tok("Ford Transit"), lit(" ("), tok(""), lit(")")])).toBe("2020 Ford Transit");
    expect(joinTitleParts([tok("2020"), lit(" "), tok("Ford Transit"), lit(" ("), tok("ABC123"), lit(")")])).toBe("2020 Ford Transit (ABC123)");
  });
  it("keeps a leading literal such as #", () => {
    expect(joinTitleParts([lit("#"), tok("12"), lit(" "), tok("Printer offline")])).toBe("#12 Printer offline");
  });
  it("is null when everything is empty", () => {
    expect(joinTitleParts([tok(""), lit(" "), tok("")])).toBeNull();
  });
});

describe("dates in US Eastern time", () => {
  it("formats like WebAuthor", () => {
    expect(formatDate("2027-03-31")).toBe("3/31/2027");
    expect(formatDateTime("2026-09-25T21:37:00Z")).toBe("9/25/2026 5:37 PM");
  });
  it("today follows Eastern time, not UTC", () => {
    // 11:30 PM Eastern on Sep 25 is already Sep 26 in UTC.
    expect(todayET(new Date("2026-09-26T03:30:00Z"))).toBe("2026-09-25");
  });
  it("datetime-local round-trips across daylight saving", () => {
    for (const local of ["2026-07-04T09:15", "2026-12-24T18:00"]) {
      expect(toDateTimeLocalET(fromDateTimeLocalET(local))).toBe(local);
    }
    expect(fromDateTimeLocalET("2026-07-04T09:15")).toBe("2026-07-04T13:15:00.000Z"); // EDT = UTC-4
    expect(fromDateTimeLocalET("2026-12-24T18:00")).toBe("2026-12-24T23:00:00.000Z"); // EST = UTC-5
  });
});

describe("new-record defaults and validation", () => {
  it("applies registry defaults", () => {
    const v = newRecordValues(getTable("contacts"), "2026-09-25");
    expect(v.type).toBe("End Customer");
    expect(v.was_referred).toBe(false);
    expect(newRecordValues(getTable("transactions"), "2026-09-25").date).toBe("2026-09-25");
  });

  it("rejects bad email, url, option and too-long text", () => {
    const t = getTable("buildings");
    const values = normalize(t, { title: "x".repeat(51), website: "not a url", admin_email: "bad", coi_status: "Maybe" });
    const errors = validate(t, values, evaluateRules(t, values), "2026-09-25");
    expect(Object.keys(errors).sort()).toEqual(["admin_email", "coi_status", "title", "website"]);
  });

  it("Date of Birth cannot be in the future", () => {
    const t = getTable("employees");
    const values = normalize(t, { first_name: "A", last_name: "B", departments: ["ELECTRICAL"], status: "Active", employment_type: "W2 Employee", date_of_birth: "2030-01-01" });
    expect(validate(t, values, evaluateRules(t, values, "2026-09-25"), "2026-09-25").date_of_birth).toMatch(/future/);
  });

  it("intl phone pattern enforced", () => {
    const t = getTable("contacts");
    const values = normalize(t, { type: "End Customer", first_name: "A", intl_phone: "+55 (11) 9999-0000x" });
    expect(validate(t, values, evaluateRules(t, values), "2026-09-25").intl_phone).toBeDefined();
  });
});
