// TS-a: the kinds of time off (Jessica's 2026-10-29 brief, item 4; the basics built 2026-11-04).
export const TIME_OFF_KINDS = ["Day off", "Vacation", "Sick", "Holiday", "Personal", "Unpaid"] as const;
export type TimeOffKind = (typeof TIME_OFF_KINDS)[number];

export type TimeOffRow = { id: number; employee_id: number; day: string; kind: TimeOffKind; paid: boolean; minutes: number; note: string | null };
