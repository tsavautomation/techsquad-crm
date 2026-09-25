import { describe, expect, it } from "vitest";
import { sanitizeRichText } from "@/lib/records/sanitize";
import { newRecordValues, normalize, validate } from "@/lib/records/values";
import { evaluateRules } from "@/lib/rules/evaluate";
import { getTable } from "@/registry";

describe("rich text is cleaned before saving", () => {
  it("keeps formatting", () => {
    expect(sanitizeRichText("<h2>Title</h2><p><strong>Bold</strong> and <em>italic</em></p><ul><li>a</li></ul>")).toBe(
      "<h2>Title</h2><p><strong>Bold</strong> and <em>italic</em></p><ul><li>a</li></ul>",
    );
  });
  it("strips scripts, event handlers and javascript: links", () => {
    const out = sanitizeRichText(`<p onclick="alert(1)">Hi</p><script>alert(1)</script><img src=x onerror=alert(1)><a href="javascript:alert(1)">x</a>`) ?? "";
    expect(out).not.toMatch(/script|onclick|onerror|javascript:|<img/i);
    expect(out).toContain("<p>Hi</p>");
  });
  it("links open in a new tab safely", () => {
    expect(sanitizeRichText('<a href="https://sonos.com">Sonos</a>')).toBe('<a href="https://sonos.com" target="_blank" rel="noreferrer">Sonos</a>');
  });
});

describe("M6 field validation", () => {
  it("required uploads and multi-lookups are enforced (TV Installation: all 9 fields)", () => {
    const t = getTable("tv_installations");
    const values = normalize(t, newRecordValues(t, "2026-09-25"));
    const errors = validate(t, values, evaluateRules(t, values, "2026-09-25"), "2026-09-25");
    expect(Object.keys(errors).sort()).toEqual(
      ["brand_and_model", "email", "pictures", "project_id", "room_area", "serial_number", "signature", "team_ids", "validated_by"].sort(),
    );
  });

  it("SSN and EIN need 9 digits", () => {
    const t = getTable("employees");
    const base = { first_name: "A", last_name: "B", departments: ["ELECTRICAL"], status: "Active", employment_type: "W2 Employee" };
    const bad = normalize(t, { ...base, ssn: "12345", ein: "12-3" });
    const errors = validate(t, bad, evaluateRules(t, bad, "2026-09-25"), "2026-09-25");
    expect(errors.ssn).toBeDefined();
    expect(errors.ein).toBeDefined();
    const good = normalize(t, { ...base, ssn: "123456789", ein: "123456789" });
    expect(validate(t, good, evaluateRules(t, good, "2026-09-25"), "2026-09-25")).toEqual({});
  });

  it("a lookup must hold a record id, not free text", () => {
    const t = getTable("permits");
    const v = normalize(t, { municipality_id: "Miami-Dade", type: "Electrical", project_id: 1 });
    expect(validate(t, v, evaluateRules(t, v, "2026-09-25"), "2026-09-25").municipality_id).toBeDefined();
  });
});
