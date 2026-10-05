import { describe, expect, it } from "vitest";
import { planLate, planMissing, planReminders, reportsForVisit, smsBody, statusFor, visitCounts, type RuleEmployee, type RuleReport, type RuleVisit } from "@/lib/reports/rule";
import { toE164 } from "@/lib/sms/phone";

// F18 Visit = Report rule (SPEC §9.1 F18-a): on time / late / missing, the 9 PM reminders and the deficiencies.

const visit = (o: Partial<RuleVisit> = {}): RuleVisit => ({ id: 10, project_id: 5, project: "Roth Residence", date: "2026-10-05", people: [1, 2], cancelled: false, attended: true, ...o });
const report = (o: Partial<RuleReport> = {}): RuleReport => ({ id: 100, visit_id: 10, project_id: 5, date: "2026-10-05", team: [1], created_at: "2026-10-05T22:30:00.000Z", ...o }); // 6:30 PM Eastern
const people: RuleEmployee[] = [
  { id: 1, name: "Ana", active: true, phone: "(305) 555-0123" },
  { id: 2, name: "Bruno", active: true, phone: "305.555.0199" },
  { id: 3, name: "Carlos", active: false, phone: "3055550100" },
  { id: 4, name: "Dora", active: true, phone: null },
  { id: 5, name: "Eli", active: true, phone: "12345" },
];

describe("statusFor", () => {
  it("is on time when the report was filed on the visit's Eastern day, late after it, missing otherwise", () => {
    const r = statusFor(visit(), [report()]);
    expect(r).toEqual([
      { employee_id: 1, status: "on_time", report_id: 100, filed_on: "2026-10-05" },
      { employee_id: 2, status: "missing", report_id: null, filed_on: null },
    ]);
    // 11:59 PM Eastern (03:59 UTC next day) is still the same day; 12:00 AM is the next day.
    expect(statusFor(visit({ people: [1] }), [report({ created_at: "2026-10-06T03:59:00.000Z" })])[0].status).toBe("on_time");
    expect(statusFor(visit({ people: [1] }), [report({ created_at: "2026-10-06T04:00:00.000Z" })])[0]).toMatchObject({ status: "late", filed_on: "2026-10-06" });
  });
  it("counts each person separately: one report with both on the Team covers both", () => {
    expect(statusFor(visit(), [report({ team: [1, 2] })]).map((s) => s.status)).toEqual(["on_time", "on_time"]);
  });
  it("takes an unlinked report by project and day, but not one for another project or day", () => {
    expect(statusFor(visit({ people: [1] }), [report({ visit_id: null })])[0].status).toBe("on_time");
    expect(statusFor(visit({ people: [1] }), [report({ visit_id: null, project_id: 6 })])[0].status).toBe("missing");
    expect(statusFor(visit({ people: [1] }), [report({ visit_id: null, date: "2026-10-04" })])[0].status).toBe("missing");
    expect(reportsForVisit(visit(), [report({ visit_id: 11, project_id: 5 })])).toEqual([]); // linked to another visit
  });
  it("uses the earliest report when there are two", () => {
    const r = statusFor(visit({ people: [1] }), [report({ id: 101, created_at: "2026-10-07T12:00:00.000Z" }), report({ id: 100 })]);
    expect(r[0]).toMatchObject({ status: "on_time", report_id: 100 });
  });
});

describe("visitCounts", () => {
  it("skips cancelled visits, visits nobody attended, and visits before the start date", () => {
    expect(visitCounts(visit(), null)).toBe(true);
    expect(visitCounts(visit({ cancelled: true }), null)).toBe(false);
    expect(visitCounts(visit({ attended: false }), null)).toBe(false);
    expect(visitCounts(visit(), "2026-10-06")).toBe(false);
    expect(visitCounts(visit(), "2026-10-05")).toBe(true);
  });
});

describe("planReminders (the 9 PM job)", () => {
  it("sends one SMS per missing report to active people with a usable phone, and lists the rest", () => {
    const visits = [visit({ people: [1, 2, 3, 4, 5] }), visit({ id: 11, project: "Lima", people: [1] })];
    const { reminders, skipped } = planReminders({ visits, reports: [report({ team: [1] })], employees: people, since: null });
    expect(reminders).toEqual([
      { employee_id: 2, visit_id: 10, project_id: 5, project: "Roth Residence", to: "+13055550199", body: 'Tech Squad Reports - Seu report do trabalho "Roth Residence" não foi recebido hoje.' },
      { employee_id: 1, visit_id: 11, project_id: 5, project: "Lima", to: "+13055550123", body: smsBody("Lima") },
    ]);
    expect(skipped.map((s) => [s.employee_id, s.reason])).toEqual([
      [3, "inactive"],
      [4, "no_phone"],
      [5, "bad_phone"],
    ]);
  });
  it("sends nothing for a visit nobody attended or before the start date", () => {
    expect(planReminders({ visits: [visit({ attended: false })], reports: [], employees: people, since: null }).reminders).toEqual([]);
    expect(planReminders({ visits: [visit()], reports: [], employees: people, since: "2026-11-01" }).reminders).toEqual([]);
  });
});

describe("planMissing and planLate (deficiencies)", () => {
  it("creates Missing for active people without a report after the day closes", () => {
    expect(planMissing({ visits: [visit({ people: [1, 2, 3] })], reports: [report()], employees: people, since: null })).toEqual([
      { employee_id: 2, visit_id: 10, project_id: 5, project: "Roth Residence", date: "2026-10-05" },
    ]);
  });
  it("finds the visits a report is late for, per team member on the visit", () => {
    const late = report({ team: [1, 2, 9], created_at: "2026-10-07T15:00:00.000Z" });
    expect(planLate(late, [visit(), visit({ id: 11, date: "2026-10-07" })], null)).toEqual([
      { employee_id: 1, visit_id: 10, project_id: 5, project: "Roth Residence", date: "2026-10-05", filed_on: "2026-10-07" },
      { employee_id: 2, visit_id: 10, project_id: 5, project: "Roth Residence", date: "2026-10-05", filed_on: "2026-10-07" },
    ]);
    expect(planLate(report(), [visit()], null)).toEqual([]); // on time
  });
});

describe("toE164", () => {
  it("normalises US numbers and rejects the rest", () => {
    expect(toE164("(305) 555-0123")).toBe("+13055550123");
    expect(toE164("1 305 555 0123")).toBe("+13055550123");
    expect(toE164("+55 11 91234-5678")).toBe("+5511912345678");
    expect(toE164("12345")).toBeNull();
    expect(toE164("")).toBeNull();
    expect(toE164("0305550123")).toBeNull();
  });
});
