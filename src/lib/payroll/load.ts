import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { loadPayRates, type PayRate } from "@/lib/costing/load";
import { fromDateTimeLocalET, todayET } from "@/lib/dates";
import { addDays } from "@/lib/schedule/dates";
import { approvalGroups, loadApprovalsAt } from "@/lib/time-clock/approval-status";
import { approvalStatusOf, needsApproval, type ApprovalStatus } from "@/lib/time-clock/period-approval";
import { shiftsOf, type SheetEntry, type Shift } from "@/lib/time-clock/timesheet";
import { payLine, type PayLine, type PtoDay } from "./engine";
import { isFrequency, parsePayDayRule, scheduleInForce, type Assignment, type Overrides, type Period, type Schedule } from "./periods";

// TC-f Pay periods: what the screen, the approval and the export read. Everything goes through the viewer's
// own permissions: pay rates and pay periods are only readable with the Job costing key (database policies).
// PS-a: periods come from pay schedules (groups), and each person is on a schedule from a date on.
// TS-c: a person of a group that needs the approval (the Field) enters the period only once their timesheet is approved.

type ScheduleRow = { id: number; name: string; frequency: string; anchor_on: string; pay_day_rule: unknown; active: boolean };
const toSchedule = (r: ScheduleRow): Schedule => ({ id: r.id, name: r.name, frequency: isFrequency(r.frequency) ? r.frequency : "Biweekly", anchor_on: r.anchor_on, pay_day_rule: parsePayDayRule(r.pay_day_rule), active: r.active });

/** Every schedule, active ones first, then by name. */
export async function loadSchedules(db: SupabaseClient): Promise<Schedule[]> {
  const { data } = await db.from("pay_schedules").select("id, name, frequency, anchor_on, pay_day_rule, active").order("active", { ascending: false }).order("name");
  return ((data ?? []) as ScheduleRow[]).map(toSchedule);
}

export async function loadSchedule(db: SupabaseClient, id: number): Promise<Schedule | null> {
  const { data } = await db.from("pay_schedules").select("id, name, frequency, anchor_on, pay_day_rule, active").eq("id", id).maybeSingle();
  return data ? toSchedule(data as ScheduleRow) : null;
}

/** Moved pay days of a schedule: period first day → pay day. */
export async function loadOverrides(db: SupabaseClient, scheduleId: number): Promise<Overrides> {
  const { data } = await db.from("pay_period_overrides").select("starts_on, pay_day").eq("schedule_id", scheduleId);
  return new Map(((data ?? []) as { starts_on: string; pay_day: string }[]).map((r) => [r.starts_on, r.pay_day]));
}

export type AssignmentRow = Assignment & { id: number; note: string | null; created_at: string };

/** The schedule links of some people (or everyone), newest first. */
export async function loadAssignments(db: SupabaseClient, employeeIds?: number[]): Promise<AssignmentRow[]> {
  let q = db.from("employee_pay_schedules").select("id, employee_id, schedule_id, effective_from, note, created_at").order("effective_from", { ascending: false });
  if (employeeIds) {
    if (!employeeIds.length) return [];
    q = q.in("employee_id", employeeIds);
  }
  const { data } = await q;
  return (data ?? []) as AssignmentRow[];
}

export type Person = { id: number; title: string; status: string | null; clock_group: string | null };
/** TS-c: the person's timesheet approval for this period. */
export type LineApproval = { required: boolean; status: ApprovalStatus; approver: string | null; approved_at: string | null };
export type LockedPeriod = { id: number; approved_by: string | null; approved_at: string; note: string | null; approver: string | null };
export type Adjustment = { id: number; period_id: number; employee_id: number; entry_id: number | null; reason: string; delta_minutes: number; delta_amount: number | null; created_at: string; applied_period_id: number | null; period_label?: string };

export type PersonLine = {
  person: Person;
  line: PayLine;
  shifts: Shift[];
  /** Flagged shifts still to review, for the links on the screen. */
  review: Shift[];
  /** Corrections of earlier locked periods paid in this one (pending ones for an open period). */
  adjustments: Adjustment[];
  /** Locked snapshot, when the period is approved. */
  snapshot?: { minutes: number; pto_minutes: number; rate_text: string | null; amount: number | null; adjustments: number; flagged: number };
  /** Corrections made to this person's entries after the lock (paid in a later period). */
  later: Adjustment[];
  approval: LineApproval;
};

export type PeriodData = {
  period: Period;
  locked: LockedPeriod | null;
  lines: PersonLine[];
  /** People who clocked hours in the period but are on no pay schedule on its first day. */
  unassigned: Person[];
  totals: { minutes: number; ptoMinutes: number; amount: number | null; adjustments: number; total: number | null; toReview: number; /** TS-c: lines that still wait for the timesheet approval. */ unapproved: number };
};

type EntryRow = SheetEntry & { employee_id: number };

/** Clock entries whose clock-in falls in the period (a shift belongs to its clock-in's day), per person. */
async function periodEntries(db: SupabaseClient, period: Pick<Period, "starts_on" | "ends_on">): Promise<Map<number, EntryRow[]>> {
  const { data } = await db
    .from("time_entries")
    .select("id, employee_id, kind, at, note, reviewed_at, auto_closed, needs_adjustment, project_id, manager_note")
    .in("kind", ["clock_in", "clock_out"])
    .gte("at", fromDateTimeLocalET(`${period.starts_on}T00:00`))
    .lt("at", fromDateTimeLocalET(`${addDays(period.ends_on, 1)}T06:00`)) // a shift may end after midnight
    .is("deleted_at", null)
    .order("at");
  return Map.groupBy((data ?? []) as EntryRow[], (e) => e.employee_id);
}

/** Shifts of the period only (an entry early on the day after the period may belong to a shift that started inside it). */
function periodShifts(entries: SheetEntry[], period: Pick<Period, "starts_on" | "ends_on">, now: number, today: string): Shift[] {
  return shiftsOf(entries, now, today).filter((s) => s.day >= period.starts_on && s.day <= period.ends_on);
}

export async function loadPeriod(db: SupabaseClient, period: Period, now = Date.now()): Promise<PeriodData> {
  const today = todayET(new Date(now));
  const [{ data: emp }, byPerson, links, { data: lockedRow }] = await Promise.all([
    db.from("employees").select("id, title, status, clock_group").is("deleted_at", null).order("title"),
    periodEntries(db, period),
    loadAssignments(db),
    db.from("pay_periods").select("id, approved_by, approved_at, note").eq("schedule_id", period.schedule_id).eq("starts_on", period.starts_on).maybeSingle(),
  ]);
  const people: Person[] = ((emp ?? []) as { id: number; title: string | null; status: string | null; clock_group: string | null }[]).map((p) => ({ ...p, title: p.title ?? `#${p.id}` }));
  const onSchedule = (p: Person) => scheduleInForce(links, p.id, period.starts_on);
  const inSchedule = people.filter((p) => onSchedule(p) === period.schedule_id && (byPerson.has(p.id) || p.status === "Active" || p.status === "Reports"));
  const unassigned = people.filter((p) => onSchedule(p) === null && byPerson.has(p.id) && periodShifts(byPerson.get(p.id)!, period, now, today).some((s) => s.minutes > 0));
  const locked = lockedRow ? ({ ...(lockedRow as Omit<LockedPeriod, "approver">), approver: null } as LockedPeriod) : null;

  const ids = inSchedule.map((p) => p.id);
  const [rates, { data: adj }, { data: snap }, names, { data: off }, approvals, groups] = await Promise.all([
    loadPayRates(db, ids),
    ids.length
      ? locked
        ? db.from("pay_period_adjustments").select("*").in("employee_id", ids).or(`applied_period_id.eq.${locked.id},period_id.eq.${locked.id}`).order("created_at")
        : db.from("pay_period_adjustments").select("*").in("employee_id", ids).is("applied_period_id", null).order("created_at")
      : Promise.resolve({ data: [] }),
    locked ? db.from("pay_period_lines").select("employee_id, minutes, pto_minutes, rate_text, amount, adjustments, flagged").eq("period_id", locked.id) : Promise.resolve({ data: [] }),
    locked?.approved_by ? db.from("profiles").select("id, first_name, last_name").eq("id", locked.approved_by).maybeSingle() : Promise.resolve({ data: null }),
    // TS-a: paid time off in the period, per person.
    ids.length ? db.from("time_off_entries").select("employee_id, day, minutes").in("employee_id", ids).eq("paid", true).gte("day", period.starts_on).lte("day", period.ends_on).is("deleted_at", null) : Promise.resolve({ data: [] }),
    // TS-c: the timesheet approvals of the period, per person.
    loadApprovalsAt(db, ids, period.starts_on),
    approvalGroups(db),
  ]);
  const ptoByPerson = Map.groupBy((off ?? []) as { employee_id: number; day: string; minutes: number }[], (r) => r.employee_id);
  if (locked && names.data) locked.approver = [(names.data as { first_name: string | null }).first_name, (names.data as { last_name: string | null }).last_name].filter(Boolean).join(" ") || null;
  const adjustments = ((adj ?? []) as Adjustment[]).map((a) => ({ ...a, delta_amount: a.delta_amount === null ? null : Number(a.delta_amount) }));
  const snapshots = new Map(((snap ?? []) as { employee_id: number; minutes: number; pto_minutes: number; rate_text: string | null; amount: number | string | null; adjustments: number | string; flagged: number }[]).map((s) => [s.employee_id, { ...s, amount: s.amount === null ? null : Number(s.amount), adjustments: Number(s.adjustments) }]));
  const periodLabels = await adjustmentPeriodLabels(db, adjustments);

  const lines: PersonLine[] = inSchedule.map((person) => {
    const shifts = periodShifts(byPerson.get(person.id) ?? [], period, now, today);
    const mine = adjustments.filter((a) => a.employee_id === person.id).map((a) => ({ ...a, period_label: periodLabels.get(a.period_id) }));
    // Open period: pending corrections of earlier periods are paid here. Locked: the ones this period paid, and the ones made after its lock.
    const paidHere = locked ? mine.filter((a) => a.applied_period_id === locked.id) : mine.filter((a) => a.applied_period_id === null);
    const later = locked ? mine.filter((a) => a.period_id === locked.id) : [];
    const pending = paidHere.reduce((n, a) => n + (a.delta_amount ?? 0), 0);
    const snapshot = snapshots.get(person.id);
    const line = snapshot
      ? ({ minutes: snapshot.minutes, ptoMinutes: snapshot.pto_minutes, amount: snapshot.amount, rateText: snapshot.rate_text ?? "", missingRateDays: [], toReview: 0, adjustments: snapshot.adjustments, total: snapshot.amount === null ? null : Math.round((snapshot.amount + snapshot.adjustments) * 100) / 100 } satisfies PayLine)
      : payLine(shifts, rates as PayRate[], (ptoByPerson.get(person.id) ?? []).map((r): PtoDay => ({ day: r.day, minutes: r.minutes })), pending);
    const row = approvals.get(person.id);
    const approval: LineApproval = { required: needsApproval(person.clock_group, groups), status: approvalStatusOf(row), approver: row?.approver ?? null, approved_at: row?.approved_at ?? null };
    return { person, line, shifts, review: shifts.filter((s) => s.needsReview), adjustments: paidHere, snapshot, later, approval };
  });
  const totals = {
    minutes: lines.reduce((n, l) => n + l.line.minutes, 0),
    ptoMinutes: lines.reduce((n, l) => n + l.line.ptoMinutes, 0),
    amount: lines.some((l) => l.line.amount === null) ? null : Math.round(lines.reduce((n, l) => n + (l.line.amount ?? 0), 0) * 100) / 100,
    adjustments: Math.round(lines.reduce((n, l) => n + l.line.adjustments, 0) * 100) / 100,
    total: lines.some((l) => l.line.total === null) ? null : Math.round(lines.reduce((n, l) => n + (l.line.total ?? 0), 0) * 100) / 100,
    toReview: lines.reduce((n, l) => n + l.line.toReview, 0),
    unapproved: lines.filter((l) => l.approval.required && l.approval.status !== "Approved").length,
  };
  return { period, locked, lines, unassigned, totals };
}

async function adjustmentPeriodLabels(db: SupabaseClient, adjustments: Adjustment[]): Promise<Map<number, string>> {
  const ids = [...new Set(adjustments.map((a) => a.period_id))];
  if (!ids.length) return new Map();
  const { data } = await db.from("pay_periods").select("id, starts_on, ends_on").in("id", ids);
  return new Map(((data ?? []) as { id: number; starts_on: string; ends_on: string }[]).map((p) => [p.id, `${p.starts_on} – ${p.ends_on}`]));
}

/** The locked period an entry belongs to, with that person's snapshot line, for the adjustment of a later correction. */
export async function lockedPeriodOf(db: SupabaseClient, entryId: number): Promise<{ period: Period & { id: number }; employeeId: number } | null> {
  const { data: e } = await db.from("time_entries").select("employee_id, pay_period_id").eq("id", entryId).maybeSingle();
  const row = e as { employee_id: number; pay_period_id: number | null } | null;
  if (!row?.pay_period_id) return null;
  const { data: p } = await db.from("pay_periods").select("id, schedule_id, frequency, starts_on, ends_on, pay_day").eq("id", row.pay_period_id).maybeSingle();
  if (!p) return null;
  const r = p as { id: number; schedule_id: number; frequency: string; starts_on: string; ends_on: string; pay_day: string };
  return { period: { id: r.id, schedule_id: r.schedule_id, frequency: isFrequency(r.frequency) ? r.frequency : "Biweekly", starts_on: r.starts_on, ends_on: r.ends_on, pay_day: r.pay_day, pay_day_moved: false }, employeeId: row.employee_id };
}

/** One person's current figures for a period (recomputed from the entries as they are now). */
export async function currentLine(db: SupabaseClient, period: Pick<Period, "starts_on" | "ends_on">, employeeId: number, now = Date.now()): Promise<PayLine> {
  const today = todayET(new Date(now));
  const [byPerson, rates] = await Promise.all([periodEntries(db, period), loadPayRates(db, [employeeId])]);
  return payLine(periodShifts(byPerson.get(employeeId) ?? [], period, now, today), rates as PayRate[]);
}
