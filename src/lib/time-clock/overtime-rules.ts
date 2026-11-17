// OT-b Overtime approval (Fred 2026-11-17): the pure rules of the flow. A Field day whose excess passes the
// tolerance becomes an "overtime day": the technician justifies it (48 h, else refused automatically), the
// approver decides it in a weekly review (Thursday), and a later change of the day's hours reopens the decision.
// No database here; tests in tests/ot-flow.test.ts.
import type { OvertimeState } from "@/lib/payroll/overtime";
import { addDays } from "@/lib/schedule/dates";
import type { PushMessage } from "@/lib/push/engine";
import { formatHours } from "./timesheet";

export type OvertimeStatus = "awaiting_justification" | "pending" | "approved" | "refused" | "void";
export const OPEN_STATUSES: OvertimeStatus[] = ["awaiting_justification", "pending"];

export type OvertimeDay = {
  id: number;
  employee_id: number;
  day: string;
  worked_minutes: number;
  excess_minutes: number;
  status: OvertimeStatus;
  justification: string | null;
  justified_at: string | null;
  justify_due_at: string | null;
  decided_by: string | null;
  decided_at: string | null;
  decision_comment: string | null;
  auto_refused: boolean;
};

export const STATUS_TEXT: Record<OvertimeStatus, string> = {
  awaiting_justification: "Waiting for the justification",
  pending: "Pending",
  approved: "Approved",
  refused: "Refused",
  void: "No overtime",
};

/** Hours the technician has to justify before the day is refused by itself. */
export const JUSTIFY_HOURS = 48;
export const justifyDueAt = (fromIso: string, hours = JUSTIFY_HOURS) => new Date(Date.parse(fromIso) + hours * 3_600_000).toISOString();
export const AUTO_REFUSAL_COMMENT = "Refused automatically: no justification within 48 hours.";

/** What the pay line does with a day's overtime, from its row (no row yet = still waiting). */
export function stateOf(row: Pick<OvertimeDay, "status"> | null | undefined): OvertimeState {
  if (!row) return "awaiting";
  if (row.status === "approved") return "approved";
  if (row.status === "refused") return "refused";
  if (row.status === "pending") return "pending";
  return "awaiting";
}

export type Reconcile = { action: "none" } | { action: "create" } | { action: "update" } | { action: "reopen"; to: "awaiting_justification" | "pending" } | { action: "void" };

/**
 * What to do with a day's row given the day as it is now. `complete` = every shift of the day has its real
 * clock-out (a shift with none raises no overtime, only the "clock-out missing" alert). `excess` is 0 when the day
 * is within the limit plus the tolerance.
 *  - no overtime any more → the row is voided (kept for the history);
 *  - overtime and no row → created, waiting for the justification;
 *  - the minutes changed on a decided day → the decision is reopened (pending when a justification exists);
 *  - the minutes changed on an undecided day → updated.
 */
export function reconcile(existing: Pick<OvertimeDay, "status" | "excess_minutes" | "justification"> | null, excess: number, complete: boolean): Reconcile {
  if (!complete) return { action: "none" };
  if (excess <= 0) return existing && existing.status !== "void" ? { action: "void" } : { action: "none" };
  if (!existing) return { action: "create" };
  if (existing.status === "void") return { action: "reopen", to: existing.justification ? "pending" : "awaiting_justification" };
  if (existing.excess_minutes === excess) return { action: "none" };
  if (existing.status === "approved" || existing.status === "refused") return { action: "reopen", to: existing.justification ? "pending" : "awaiting_justification" };
  return { action: "update" };
}

/** Thursday review: everything still undecided up to the Wednesday before (inclusive). */
export const reviewCutoff = (thursday: string) => addDays(thursday, -1);

const dayText = (date: string) => `${Number(date.slice(5, 7))}/${Number(date.slice(8, 10))}`;

export const justifyMessage = (p: { day: string; excess: number }): PushMessage => ({
  title: "Overtime: tell us why",
  body: `${dayText(p.day)}: +${formatHours(p.excess)} over your day. Write the reason within ${JUSTIFY_HOURS} hours, or it is refused.`,
  url: "/my-time",
  tag: `overtime-justify-${p.day}`,
});

export const decidedMessage = (p: { day: string; excess: number; approved: boolean; comment: string | null }): PushMessage => ({
  title: p.approved ? "Overtime approved" : "Overtime refused",
  body: `${dayText(p.day)}: +${formatHours(p.excess)}${p.comment ? ` · ${p.comment}` : ""}`,
  url: "/my-time",
  tag: `overtime-decided-${p.day}`,
});

/** The single weekly notice to the approver (Thursday morning), or the reminder to the backups (when nothing was decided). */
export function weeklyMessage(p: { days: number; people: string[]; backup?: boolean }): PushMessage {
  const names = p.people.slice(0, 6).join(", ") + (p.people.length > 6 ? ` +${p.people.length - 6}` : "");
  return {
    title: p.backup ? `Overtime still undecided: ${p.days} ${p.days === 1 ? "day" : "days"}` : `Overtime of the week: ${p.days} ${p.days === 1 ? "day" : "days"} to decide`,
    body: names,
    url: "/time-clock/overtime",
    tag: p.backup ? "overtime-backup" : "overtime-weekly",
  };
}
