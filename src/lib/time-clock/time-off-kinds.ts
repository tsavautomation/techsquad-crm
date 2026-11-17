// TO-a (Fred 2026-11-17): only two policies, paid and unpaid; the third kind is written by the system for a weekday
// with no clock-in and no time off. The rules live in time-off-rules.ts.
import { ABSENCE, POLICIES, type Policy } from "./time-off-rules";

export const TIME_OFF_KINDS = POLICIES;
export type TimeOffKind = Policy;
export { ABSENCE };

export type TimeOffRow = { id: number; employee_id: number; day: string; kind: TimeOffKind | typeof ABSENCE; paid: boolean; minutes: number; note: string | null };
