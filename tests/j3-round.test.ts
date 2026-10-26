import { describe, expect, it } from "vitest";
import { parseTaskDone, taskDonePrompt } from "@/lib/ai/task-done-engine";
import { pickScheduler } from "@/lib/field-day/day";
import { departmentOfCategory, inDepartment, periodSheet } from "@/lib/time-clock/period";
import { overtimeDays, overtimeDetails, overtimeMarker } from "@/lib/time-clock/overtime-engine";

// Jessica's third round (via Fred 2026-10-26), SPEC §9.1 J-s … J-z: the pure parts.

const et = (day: string, hm: string) => new Date(`${day}T${hm}:00-04:00`).toISOString(); // October: EDT
const shift = (id: number, day: string, inHm: string, outHm: string) => [
  { id, kind: "clock_in" as const, at: et(day, inHm) },
  { id: id + 1, kind: "clock_out" as const, at: et(day, outHm) },
];
const now = Date.parse("2026-10-26T12:00:00Z");

describe("J-t overtime: days over 9 hours in the week, one task per person", () => {
  it("finds the days over 9 h with the excess, ignoring other weeks and normal days", () => {
    const entries = [...shift(1, "2026-10-19", "07:00", "17:30"), ...shift(3, "2026-10-20", "08:00", "16:00"), ...shift(5, "2026-10-21", "06:30", "12:00"), ...shift(7, "2026-10-21", "13:00", "18:30"), ...shift(9, "2026-10-12", "06:00", "19:00")];
    const days = overtimeDays(entries, "2026-10-19", now);
    expect(days.map((d) => [d.date, d.minutes, d.excess])).toEqual([
      ["2026-10-19", 630, 90],
      ["2026-10-21", 660, 120],
    ]);
    expect(days[1].from).toBe(et("2026-10-21", "06:30"));
    expect(days[1].to).toBe(et("2026-10-21", "18:30"));
  });
  it("writes the task text with each day, and a marker that keeps the week from being raised twice", () => {
    const text = overtimeDetails("Daniel Sousa", "2026-10-19", overtimeDays(shift(1, "2026-10-19", "07:00", "17:30"), "2026-10-19", now));
    expect(text).toContain("Daniel Sousa, week of 10/19/2026 – 10/25/2026");
    expect(text).toContain("10/19/2026: 7:00 AM – 5:30 PM · 10:30 h worked, 1:30 h over 9");
    expect(text).toContain("Total over 9 h/day: 1:30 h");
    expect(overtimeMarker(1017, "2026-10-19")).toBe("[overtime:1017:2026-10-19]");
  });
});

describe("J-v / J-w departments and periods", () => {
  it("filters by department and reads the project category", () => {
    expect(inDepartment(["LOW VOLTAGE"], "")).toBe(true);
    expect(inDepartment(["LOW VOLTAGE"], "ELECTRICAL")).toBe(false);
    expect(inDepartment(["ELECTRICAL", "LOW VOLTAGE"], "ELECTRICAL")).toBe(true);
    expect(inDepartment(null, "ELECTRICAL")).toBe(false);
    expect(departmentOfCategory("Electrical")).toBe("ELECTRICAL");
    expect(departmentOfCategory("Low Voltage")).toBe("LOW VOLTAGE");
    expect(departmentOfCategory(null)).toBeNull();
  });
  it("a period includes both ends and totals the days", () => {
    const entries = [...shift(1, "2026-10-01", "08:00", "12:00"), ...shift(3, "2026-10-03", "08:00", "18:00"), ...shift(5, "2026-10-04", "08:00", "09:00")];
    const p = periodSheet(entries, "2026-10-01", "2026-10-03", now);
    expect(p.days.map((d) => d.date)).toEqual(["2026-10-01", "2026-10-02", "2026-10-03"]);
    expect(p.days.map((d) => d.minutes)).toEqual([240, 0, 600]);
    expect(p.totalMinutes).toBe(840);
  });
});

describe("J-x return cards by department", () => {
  const s = { scheduler_employee_id: 1004, scheduler_employee_id_electrical: 1012 };
  it("Electrical projects go to the electrical scheduler, everything else to the usual one", () => {
    expect(pickScheduler(s, "Electrical", null)).toBe(1012);
    expect(pickScheduler(s, "Low Voltage", null)).toBe(1004);
    expect(pickScheduler(s, null, ["ELECTRICAL"])).toBe(1012);
    expect(pickScheduler(s, null, ["LOW VOLTAGE"])).toBe(1004);
    expect(pickScheduler(s, null, null)).toBe(1004);
    expect(pickScheduler({ scheduler_employee_id: 1004, scheduler_employee_id_electrical: null }, "Electrical", null)).toBe(1004);
  });
});

describe("J-z AI 'looks done'", () => {
  it("reads the answer and builds the prompt", () => {
    const a = parseTaskDone('```json\n{"done": true, "confidence": 0.92, "report_id": 55, "quote": "Replaced the faulty keypad in the master bedroom.", "why": "explicit"}\n```');
    expect(a).toMatchObject({ done: true, confidence: 0.92, report_id: 55, quote: "Replaced the faulty keypad in the master bedroom." });
    expect(parseTaskDone('{"done":"false"}')?.done).toBe(false);
    expect(parseTaskDone("nope")).toBeNull();
    const p = taskDonePrompt({ id: 1, details: "Return: replace keypad", checklist: ["keypad"], createdAt: "2026-10-20T10:00:00Z" }, [{ id: 55, date: "2026-10-22", technician: "Daniel", result: "Completed", text: "Replaced the keypad." }]);
    expect(p).toContain("Report #55 (10/22/2026, Daniel, result: Completed)");
    expect(p).toContain("Checklist still open:\n- keypad");
  });
});
