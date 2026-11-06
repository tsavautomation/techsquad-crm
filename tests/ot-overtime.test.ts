// OT Overtime (Fred 2026-11-05): the per-day rules the spec asks tests for: a day under / over the group's limit,
// a rate change mid-period, a shift over midnight, a day inside / outside a trip, PTO, and the weekly limit.
import { describe, expect, it } from "vitest";
import { fromDateTimeLocalET } from "@/lib/dates";
import { payDays, payLine } from "@/lib/payroll/engine";
import { limitAt, limitHours, splitDays, tripAt, type HoursRow } from "@/lib/payroll/overtime";
import { shiftsOf, type SheetEntry, type Shift } from "@/lib/time-clock/timesheet";

const at = (local: string) => fromDateTimeLocalET(local);
let n = 0;
const e = (kind: SheetEntry["kind"], local: string): SheetEntry => ({ id: ++n, kind, at: at(local) });
const shift = (day: string, minutes: number): Shift => ({ inId: ++n, outId: ++n, inAt: `${day}T11:00:00Z`, outAt: `${day}T20:00:00Z`, suggestedOutAt: null, projectId: null, managerNote: null, day, minutes, flags: [], needsReview: false });

const FIELD: HoursRow[] = [{ effective_from: "2000-01-01", daily_minutes: 540, weekly_minutes: null }];
const OFFICE: HoursRow[] = [{ effective_from: "2000-01-01", daily_minutes: 600, weekly_minutes: null }];
const rates = [{ employee_id: 1, hourly_rate: 20, effective_from: "2026-01-01" }];
const otRates = [{ employee_id: 1, hourly_rate: 30, effective_from: "2026-01-01" }];
const field = (day: string) => limitAt(FIELD, [], day);

describe("the limit in force", () => {
  it("is the group's (Field 9 h, Office 10 h) unless the person has their own from that date", () => {
    expect(limitAt(FIELD, [], "2026-11-10")).toEqual({ daily: 540, weekly: null });
    expect(limitAt(OFFICE, [], "2026-11-10")).toEqual({ daily: 600, weekly: null });
    const own: HoursRow[] = [{ effective_from: "2026-11-09", daily_minutes: 480, weekly_minutes: 2400 }];
    expect(limitAt(FIELD, own, "2026-11-08")).toEqual({ daily: 540, weekly: null });
    expect(limitAt(FIELD, own, "2026-11-09")).toEqual({ daily: 480, weekly: 2400 });
    expect(limitAt([], [], "2026-11-09")).toEqual({ daily: 540, weekly: null });
    expect(limitHours(540)).toBe("9");
    expect(limitHours(570)).toBe("9.5");
  });
  it("changes on the day the new group value starts", () => {
    const rows: HoursRow[] = [...FIELD, { effective_from: "2026-11-16", daily_minutes: 480, weekly_minutes: null }];
    expect(limitAt(rows, [], "2026-11-15").daily).toBe(540);
    expect(limitAt(rows, [], "2026-11-16").daily).toBe(480);
  });
});

describe("regular / overtime per day", () => {
  it("a day under the limit is all regular; over it, the rest is overtime", () => {
    const d = splitDays([shift("2026-11-09", 480), shift("2026-11-10", 600)], field);
    expect(d).toMatchObject([
      { day: "2026-11-09", regular: 480, overtime: 0 },
      { day: "2026-11-10", regular: 540, overtime: 60 },
    ]);
  });
  it("sums several shifts of a day before applying the limit", () => {
    const d = splitDays([shift("2026-11-10", 300), shift("2026-11-10", 300)], field);
    expect(d).toMatchObject([{ day: "2026-11-10", minutes: 600, regular: 540, overtime: 60 }]);
  });
  it("the Office limit is 10 h", () => {
    expect(splitDays([shift("2026-11-10", 600)], (day) => limitAt(OFFICE, [], day))[0]).toMatchObject({ regular: 600, overtime: 0 });
  });
  it("a shift over midnight stays on its clock-in day", () => {
    const shifts = shiftsOf([e("clock_in", "2026-11-10T16:00"), e("clock_out", "2026-11-11T02:30")], Date.parse(at("2026-11-12T12:00")), "2026-11-12");
    expect(shifts[0]).toMatchObject({ day: "2026-11-10", minutes: 630 });
    expect(splitDays(shifts, field)).toMatchObject([{ day: "2026-11-10", regular: 540, overtime: 90 }]);
  });
  it("a weekly limit turns the week's regular hours past it into overtime", () => {
    const weekly = (day: string) => limitAt([{ effective_from: "2000-01-01", daily_minutes: 540, weekly_minutes: 2400 }], [], day);
    // Monday to Friday, 9 h each = 45 h: the last 5 h of Friday are overtime; the next Monday starts afresh.
    const d = splitDays(["2026-11-09", "2026-11-10", "2026-11-11", "2026-11-12", "2026-11-13", "2026-11-16"].map((day) => shift(day, 540)), weekly);
    expect(d.map((x) => [x.regular, x.overtime])).toEqual([[540, 0], [540, 0], [540, 0], [540, 0], [240, 300], [540, 0]]);
  });
});

describe("pay per day", () => {
  it("pays regular at the pay rate and overtime at the overtime rate", () => {
    const [d] = payDays([shift("2026-11-10", 600)], rates, { overtimeRates: otRates, limitFor: field });
    expect(d).toMatchObject({ regular: 540, overtime: 60, rate: 20, overtimeRate: 30, missingOvertimeRate: false, base: 9 * 20 + 1 * 30, premium: 0 });
  });
  it("without an overtime rate the overtime is paid at the pay rate and flagged", () => {
    const line = payLine([shift("2026-11-10", 600)], rates, [], 0, { limitFor: field });
    expect(line).toMatchObject({ regularMinutes: 540, overtimeMinutes: 60, amount: 200, overtimeRateText: "$20.00", missingOvertimeRateDays: ["2026-11-10"] });
  });
  it("uses the rates in force on each day when they change mid-period", () => {
    const changing = [...rates, { employee_id: 1, hourly_rate: 22, effective_from: "2026-11-12" }];
    const changingOt = [...otRates, { employee_id: 1, hourly_rate: 33, effective_from: "2026-11-12" }];
    const line = payLine([shift("2026-11-10", 600), shift("2026-11-12", 600)], changing, [], 0, { overtimeRates: changingOt, limitFor: field });
    expect(line.amount).toBe(9 * 20 + 30 + 9 * 22 + 33);
    expect(line.rateText).toBe("$20.00 → $22.00");
    expect(line.overtimeRateText).toBe("$30.00 → $33.00");
    expect(line.missingOvertimeRateDays).toEqual([]);
  });
  it("a day inside a trip earns the premium on regular and overtime; a day outside does not", () => {
    const trips = [{ starts_on: "2026-11-10", ends_on: "2026-11-11", premium_pct: 20 }];
    expect(tripAt(trips, "2026-11-11")).toBe(trips[0]);
    expect(tripAt(trips, "2026-11-12")).toBeNull();
    const line = payLine([shift("2026-11-10", 600), shift("2026-11-12", 480)], rates, [], 0, { overtimeRates: otRates, limitFor: field, trips });
    const tripDay = 9 * 20 + 1 * 30; // 210, +20% = 252
    expect(line.premiumAmount).toBe(42);
    expect(line.tripDays).toBe(1);
    expect(line.amount).toBe(tripDay * 1.2 + 8 * 20);
  });
  it("PTO is paid at the pay rate, never as overtime and never with the premium", () => {
    const trips = [{ starts_on: "2026-11-10", ends_on: "2026-11-11", premium_pct: 20 }];
    const line = payLine([shift("2026-11-11", 120)], rates, [{ day: "2026-11-10", minutes: 480 }, { day: "2026-11-11", minutes: 480 }], 0, { overtimeRates: otRates, limitFor: field, trips });
    expect(line).toMatchObject({ minutes: 120, regularMinutes: 120, overtimeMinutes: 0, ptoMinutes: 960, premiumAmount: 8 });
    expect(line.amount).toBe(2 * 20 * 1.2 + 16 * 20);
  });
});
