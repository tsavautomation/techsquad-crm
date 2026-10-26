import { describe, expect, it } from "vitest";
import { isSurvey, SURVEY_COLOR, surveyLabel, surveyPlace, visitLabel } from "@/lib/schedule/survey";
import { getTable } from "@/registry";
import { evaluateRules } from "@/lib/rules/evaluate";

// SV Survey visits (Fred 2026-10-26, SPEC §9.1 SV-a … SV-d): the pure parts.

describe("SV-a the survey's label", () => {
  it("uses the street, else the city, else the contact", () => {
    expect(surveyPlace({ street: "123 Main St", city: "Miami" }, "John")).toBe("123 Main St");
    expect(surveyPlace({ street: "123 Main St", address_2: "Apt 4" }, null)).toBe("123 Main St, Apt 4");
    expect(surveyPlace({ city: "Miami", state: "FL" }, "John")).toBe("Miami, FL");
    expect(surveyPlace(null, "John Doe")).toBe("John Doe");
    expect(surveyLabel(null, null)).toBe("SURVEY");
    expect(surveyLabel({ street: "9701 Collins Ave" }, null)).toBe("SURVEY – 9701 Collins Ave");
  });
  it("labels a visit by project, survey place, internal subject or the old fallback", () => {
    expect(visitLabel({ kind: "Visit", project_id: 5 }, "Roth Residence")).toBe("Roth Residence");
    expect(visitLabel({ kind: "Visit", project_id: 5 }, null)).toBe("Project #5");
    expect(visitLabel({ kind: "Survey", project_id: null, address: { street: "1 Beach Rd" } }, null)).toBe("SURVEY – 1 Beach Rd");
    expect(visitLabel({ kind: "Internal", project_id: null, subject: "Warehouse" }, null)).toBe("Warehouse");
    expect(visitLabel({ kind: "Visit", project_id: null, title: "Google: Smith" }, null)).toBe("Google: Smith");
    expect(isSurvey("Survey")).toBe(true);
    expect(SURVEY_COLOR).toMatch(/^#/);
  });
});

describe("SV-a the visit form rules for a survey", () => {
  const t = getTable("visits");
  it("hides the project, billing and maintenance fields, needs the address and the contact name", () => {
    const r = evaluateRules(t, { kind: "Survey", project_id: 12, billing: "Service call", maintenance_visit: true, subject: "x" });
    expect(r.visible.has("project_id")).toBe(false);
    expect(r.visible.has("billing")).toBe(false);
    expect(r.visible.has("maintenance_visit")).toBe(false);
    expect(r.values.project_id).toBeNull();
    expect(r.values.billing).toBeNull();
    expect(r.required.has("address")).toBe(true);
    expect(r.required.has("contact_name")).toBe(true);
    expect(r.visible.has("contact_phone")).toBe(true);
  });
  it("a client visit still needs its project and hides the contact fields", () => {
    const r = evaluateRules(t, { kind: "Visit" });
    expect(r.required.has("project_id")).toBe(true);
    expect(r.visible.has("contact_name")).toBe(false);
    expect(t.fields.find((f) => f.name === "kind")?.options?.map((o) => o.value)).toEqual(["Visit", "Survey", "Internal"]);
  });
});

describe("SV-b a survey's job report", () => {
  it("no longer requires a project in the form itself (the save checks the visit's type)", () => {
    expect(getTable("job_reports").fields.find((f) => f.name === "project_id")?.required).toBeFalsy();
  });
});
