// OT Overtime (Fred 2026-11-05; corrected 2026-11-17, OT-b): the per-day rules: daily only (no weekly limit), the
// Field's 20-minute tolerance, the Office's none, several shifts, a shift over midnight, approved / refused /
// waiting overtime, a rate change mid-period, a day inside / outside a trip, PTO.
import { describe, expect, it } from "vitest";
import { fromDateTimeLocalET } from "@/lib/dates";
import { payDays, payLine } from "@/lib/payroll/engine";
import { excessOf, limitAt, limitHours, splitDays, tripAt, type HoursRow, type OvertimeState } from "@/lib/payroll/overtime";
import { shiftsOf, type SheetEntry, type Shift } from "@/lib/time-clock/timesheet";

const at = (local: string) => fromDateTimeLocalET(local);
let n = 0;
const e = (kind: SheetEntry["kind"], local: string): SheetEntry => ({ id: ++n, kind, at: at(local) });
const shift = (day: string, minutes: number): Shift => ({ inId: ++n, outId: ++n, inAt: `${day}T11:00:00Z`, outAt: `${day}T20:00:00Z`, suggestedOutAt: null, projectId: null, managerNote: null, day, minutes, flags: [], needsReview: false });

const FIELD: HoursRow[] = [{ effective_from: "2000-01-01", daily_minutes: 540, tolerance_minutes: 20 }];
const OFFICE: HoursRow[] = [{ effective_from: "2000-01-01", daily_minutes: 600, tolerance_minutes: 0 }];
const rates = [{ employee_id: 1, hourly_rate: 20, effective_from: "2026-01-01" }];
const otRates = [{ employee_id: 1, hourly_rate: 30, effective_from: "2026-01-01" }];
const field = (day: string) => limitAt(FIELD, [], day);
const office = (day: string) => limitAt(OFFICE, [], day);
const state = (s: OvertimeState) => () => s;

describe("the limit in force", () => {
  it("is the group's (Field 9 h + 20 min tolerance, Office 10 h, none) unless the person has their own hours", () => {
    expect(limitAt(FIELD, [], "2026-11-10")).toEqual({ daily: 540, tolerance: 20 });
    expect(limitAt(OFFICE, [], "2026-11-10")).toEqual({ daily: 600, tolerance: 0 });
    const own: HoursRow[] = [{ effective_from: "2026-11-09", daily_minutes: 480 }];
    expect(limitAt(FIELD, own, "2026-11-08")).toEqual({ daily: 540, tolerance: 20 });
    expect(limitAt(FIELD, own, "2026-11-09")).toEqual({ daily: 480, tolerance: 20 }); // the tolerance stays the group's
    expect(limitAt([], [], "2026-11-09")).toEqual({ daily: 540, tolerance: 0 });
    expect(limitHours(540)).toBe("9");
    expect(limitHours(570)).toBe("9.5");
  });
  it("changes on the day the new group value starts", () => {
    const rows: HoursRow[] = [...FIELD, { effective_from: "2026-11-16", daily_minutes: 480, tolerance_minutes: 10 }];
    expect(limitAt(rows, [], "2026-11-15")).toEqual({ daily: 540, tolerance: 20 });
    expect(limitAt(rows, [], "2026-11-16")).toEqual({ daily: 480, tolerance: 10 });
  });
});

describe("regular / overtime per day", () => {
  it("Field: up to 20 minutes over, the day is paid as 9 h and the extra minutes are dropped", () => {
    expect(excessOf(540, field("2026-11-10"))).toBe(0);
    expect(excessOf(560, field("2026-11-10"))).toBe(0);
    expect(splitDays([shift("2026-11-10", 560)], field)[0]).toMatchObject({ regular: 540, excess: 0, overtime: 0, dropped: 20, state: null });
  });
  it("Field: past 20 minutes the whole excess is overtime", () => {
    expect(excessOf(561, field("2026-11-10"))).toBe(21);
    expect(splitDays([shift("2026-11-10", 600)], field)[0]).toMatchObject({ regular: 540, excess: 60, overtime: 60, dropped: 0, state: "paid" });
  });
  it("Office: no tolerance, any minute past 10 h is overtime", () => {
    expect(splitDays([shift("2026-11-10", 600)], office)[0]).toMatchObject({ regular: 600, excess: 0 });
    expect(splitDays([shift("2026-11-10", 601)], office)[0]).toMatchObject({ regular: 600, excess: 1, overtime: 1 });
  });
  it("a day under the limit is all regular", () => {
    expect(splitDays([shift("2026-11-09", 480)], field)[0]).toMatchObject({ regular: 480, excess: 0, dropped: 0 });
  });
  it("sums several shifts of a day before applying the limit", () => {
    expect(splitDays([shift("2026-11-10", 300), shift("2026-11-10", 300)], field)).toMatchObject([{ day: "2026-11-10", minutes: 600, regular: 540, excess: 60 }]);
  });
  it("a shift over midnight stays on its clock-in day", () => {
    const shifts = shiftsOf([e("clock_in", "2026-11-10T16:00"), e("clock_out", "2026-11-11T02:30")], Date.parse(at("2026-11-12T12:00")), "2026-11-12");
    expect(shifts[0]).toMatchObject({ day: "2026-11-10", minutes: 630 });
    expect(splitDays(shifts, field)).toMatchObject([{ day: "2026-11-10", regular: 540, excess: 90 }]);
  });
  it("is daily only: a week of 9-hour days, weekend included, has no overtime", () => {
    const d = splitDays(["2026-11-09", "2026-11-10", "2026-11-11", "2026-11-12", "2026-11-13", "2026-11-14", "2026-11-15"].map((day) => shift(day, 540)), field);
    expect(d.every((x) => x.excess === 0 && x.regular === 540)).toBe(true);
  });
  it("splits the excess by what was decided: approved is paid, refused and waiting are not", () => {
    expect(splitDays([shift("2026-11-10", 600)], field, state("approved"))[0]).toMatchObject({ overtime: 60, refused: 0, pending: 0 });
    expect(splitDays([shift("2026-11-10", 600)], field, state("refused"))[0]).toMatchObject({ overtime: 0, refused: 60, pending: 0 });
    expect(splitDays([shift("2026-11-10", 600)], field, state("pending"))[0]).toMatchObject({ overtime: 0, refused: 0, pending: 60 });
    expect(splitDays([shift("2026-11-10", 600)], field, state("awaiting"))[0]).toMatchObject({ overtime: 0, pending: 60 });
    expect(splitDays([shift("2026-11-10", 600)], field, () => null)[0]).toMatchObject({ overtime: 60, state: "paid" }); // no approval needed
  });
});

describe("pay per day", () => {
  it("pays regular at the pay rate and overtime at the overtime rate", () => {
    const [d] = payDays([shift("2026-11-10", 600)], rates, { overtimeRates: otRates, limitFor: field });
    expect(d).toMatchObject({ regular: 540, overtime: 60, rate: 20, overtimeRate: 30, missingOvertimeRate: false, base: 9 * 20 + 1 * 30, premiumRegular: 0, premiumOvertime: 0 });
  });
  it("refused overtime is not paid and shows apart; waiting overtime is not paid yet", () => {
    const refused = payLine([shift("2026-11-10", 600)], rates, [], 0, { overtimeRates: otRates, limitFor: field, stateFor: state("refused") });
    expect(refused).toMatchObject({ regularMinutes: 540, overtimeMinutes: 0, refusedMinutes: 60, pendingMinutes: 0, amount: 180, overtimeRateText: "" });
    const waiting = payLine([shift("2026-11-10", 600)], rates, [], 0, { overtimeRates: otRates, limitFor: field, stateFor: state("pending") });
    expect(waiting).toMatchObject({ overtimeMinutes: 0, pendingMinutes: 60, pendingDays: ["2026-11-10"], amount: 180 });
    const approved = payLine([shift("2026-11-10", 600)], rates, [], 0, { overtimeRates: otRates, limitFor: field, stateFor: state("approved") });
    expect(approved).toMatchObject({ overtimeMinutes: 60, refusedMinutes: 0, amount: 210 });
  });
  it("the minutes inside the tolerance are not paid", () => {
    const line = payLine([shift("2026-11-10", 555)], rates, [], 0, { limitFor: field });
    expect(line).toMatchObject({ minutes: 555, regularMinutes: 540, overtimeMinutes: 0, droppedMinutes: 15, amount: 180 });
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
  it("a day inside a trip earns the premium on regular and on overtime, kept apart; a day outside does not", () => {
    const trips = [{ starts_on: "2026-11-10", ends_on: "2026-11-11", premium_pct: 20 }];
    expect(tripAt(trips, "2026-11-11")).toBe(trips[0]);
    expect(tripAt(trips, "2026-11-12")).toBeNull();
    const line = payLine([shift("2026-11-10", 600), shift("2026-11-12", 480)], rates, [], 0, { overtimeRates: otRates, limitFor: field, trips });
    expect(line).toMatchObject({ premiumRegular: 36, premiumOvertime: 6, premiumAmount: 42, tripDays: 1 });
    expect(line.amount).toBe((9 * 20 + 1 * 30) * 1.2 + 8 * 20);
  });
  it("PTO is paid at the pay rate, never as overtime and never with the premium", () => {
    const trips = [{ starts_on: "2026-11-10", ends_on: "2026-11-11", premium_pct: 20 }];
    const line = payLine([shift("2026-11-11", 120)], rates, [{ day: "2026-11-10", minutes: 480 }, { day: "2026-11-11", minutes: 480 }], 0, { overtimeRates: otRates, limitFor: field, trips });
    expect(line).toMatchObject({ minutes: 120, regularMinutes: 120, overtimeMinutes: 0, ptoMinutes: 960, premiumAmount: 8 });
    expect(line.amount).toBe(2 * 20 * 1.2 + 16 * 20);
  });
});
