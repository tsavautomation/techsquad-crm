import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { loadPayRates, type PayRate } from "@/lib/costing/load";
import { fromDateTimeLocalET, todayET } from "@/lib/dates";
import { addDays } from "@/lib/schedule/dates";
import { shiftsOf, type SheetEntry, type Shift } from "@/lib/time-clock/timesheet";
import { payLine, type PayLine } from "./engine";
import { parsePayrollSettings, type Frequency, type PayrollSettings, type Period } from "./periods";

// TC-f Pay periods: what the screen, the approval and the export read. Everything goes through the viewer's
// own permissions: pay rates and pay periods are only readable with the Job costing key (database policies).

export async function loadPayrollSettings(db: SupabaseClient): Promise<PayrollSettings> {
  const { data } = await db.from("app_settings").select("value").eq("key", "payroll").maybeSingle();
  return parsePayrollSettings((data as { value: unknown } | null)?.value);
}

export type Person = { id: number; title: string; pay_frequency: Frequency | null; status: string | null };
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
};

export type PeriodData = {
  period: Period;
  locked: LockedPeriod | null;
  lines: PersonLine[];
  /** People who clocked hours in the period but have no pay frequency yet. */
  unassigned: Person[];
  totals: { minutes: number; ptoMinutes: number; amount: number | null; adjustments: number; total: number | null; toReview: number };
};

type EntryRow = SheetEntry & { employee_id: number };

/** Clock entries whose clock-in falls in the period (a shift belongs to its clock-in's day), per person. */
async function periodEntries(db: SupabaseClient, period: Period): Promise<Map<number, EntryRow[]>> {
  const { data } = await db
    .from("time_entries")
    .select("id, employee_id, kind, at, note, reviewed_at, auto_closed")
    .in("kind", ["clock_in", "clock_out"])
    .gte("at", fromDateTimeLocalET(`${period.starts_on}T00:00`))
    .lt("at", fromDateTimeLocalET(`${addDays(period.ends_on, 1)}T06:00`)) // a shift may end after midnight
    .is("deleted_at", null)
    .order("at");
  return Map.groupBy((data ?? []) as EntryRow[], (e) => e.employee_id);
}

/** Shifts of the period only (an entry early on the day after the period may belong to a shift that started inside it). */
function periodShifts(entries: SheetEntry[], period: Period, now: number, today: string): Shift[] {
  return shiftsOf(entries, now, today).filter((s) => s.day >= period.starts_on && s.day <= period.ends_on);
}

export async function loadPeriod(db: SupabaseClient, period: Period, now = Date.now()): Promise<PeriodData> {
  const today = todayET(new Date(now));
  const [{ data: emp }, byPerson, { data: lockedRow }] = await Promise.all([
    db.from("employees").select("id, title, pay_frequency, status").is("deleted_at", null).order("title"),
    periodEntries(db, period),
    db.from("pay_periods").select("id, approved_by, approved_at, note").eq("frequency", period.frequency).eq("starts_on", period.starts_on).maybeSingle(),
  ]);
  const people = ((emp ?? []) as { id: number; title: string | null; pay_frequency: Frequency | null; status: string | null }[]).map((p) => ({ ...p, title: p.title ?? `#${p.id}` }));
  const inFrequency = people.filter((p) => p.pay_frequency === period.frequency && (byPerson.has(p.id) || p.status === "Active" || p.status === "Reports"));
  const unassigned = people.filter((p) => !p.pay_frequency && byPerson.has(p.id) && periodShifts(byPerson.get(p.id)!, period, now, today).some((s) => s.minutes > 0));
  const locked = lockedRow ? ({ ...(lockedRow as Omit<LockedPeriod, "approver">), approver: null } as LockedPeriod) : null;

  const ids = inFrequency.map((p) => p.id);
  const [rates, { data: adj }, { data: snap }, names] = await Promise.all([
    loadPayRates(db, ids),
    ids.length
      ? locked
        ? db.from("pay_period_adjustments").select("*").in("employee_id", ids).or(`applied_period_id.eq.${locked.id},period_id.eq.${locked.id}`).order("created_at")
        : db.from("pay_period_adjustments").select("*").in("employee_id", ids).is("applied_period_id", null).order("created_at")
      : Promise.resolve({ data: [] }),
    locked ? db.from("pay_period_lines").select("employee_id, minutes, pto_minutes, rate_text, amount, adjustments, flagged").eq("period_id", locked.id) : Promise.resolve({ data: [] }),
    locked?.approved_by ? db.from("profiles").select("id, first_name, last_name").eq("id", locked.approved_by).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  if (locked && names.data) locked.approver = [(names.data as { first_name: string | null }).first_name, (names.data as { last_name: string | null }).last_name].filter(Boolean).join(" ") || null;
  const adjustments = ((adj ?? []) as Adjustment[]).map((a) => ({ ...a, delta_amount: a.delta_amount === null ? null : Number(a.delta_amount) }));
  const snapshots = new Map(((snap ?? []) as { employee_id: number; minutes: number; pto_minutes: number; rate_text: string | null; amount: number | string | null; adjustments: number | string; flagged: number }[]).map((s) => [s.employee_id, { ...s, amount: s.amount === null ? null : Number(s.amount), adjustments: Number(s.adjustments) }]));
  const periodLabels = await adjustmentPeriodLabels(db, adjustments);

  const lines: PersonLine[] = inFrequency.map((person) => {
    const shifts = periodShifts(byPerson.get(person.id) ?? [], period, now, today);
    const mine = adjustments.filter((a) => a.employee_id === person.id).map((a) => ({ ...a, period_label: periodLabels.get(a.period_id) }));
    // Open period: pending corrections of earlier periods are paid here. Locked: the ones this period paid, and the ones made after its lock.
    const paidHere = locked ? mine.filter((a) => a.applied_period_id === locked.id) : mine.filter((a) => a.applied_period_id === null);
    const later = locked ? mine.filter((a) => a.period_id === locked.id) : [];
    const pending = paidHere.reduce((n, a) => n + (a.delta_amount ?? 0), 0);
    const snapshot = snapshots.get(person.id);
    const line = snapshot
      ? ({ minutes: snapshot.minutes, ptoMinutes: snapshot.pto_minutes, amount: snapshot.amount, rateText: snapshot.rate_text ?? "", missingRateDays: [], toReview: 0, adjustments: snapshot.adjustments, total: snapshot.amount === null ? null : Math.round((snapshot.amount + snapshot.adjustments) * 100) / 100 } satisfies PayLine)
      : payLine(shifts, rates as PayRate[], [], pending);
    return { person, line, shifts, review: shifts.filter((s) => s.needsReview), adjustments: paidHere, snapshot, later };
  });
  const totals = {
    minutes: lines.reduce((n, l) => n + l.line.minutes, 0),
    ptoMinutes: lines.reduce((n, l) => n + l.line.ptoMinutes, 0),
    amount: lines.some((l) => l.line.amount === null) ? null : Math.round(lines.reduce((n, l) => n + (l.line.amount ?? 0), 0) * 100) / 100,
    adjustments: Math.round(lines.reduce((n, l) => n + l.line.adjustments, 0) * 100) / 100,
    total: lines.some((l) => l.line.total === null) ? null : Math.round(lines.reduce((n, l) => n + (l.line.total ?? 0), 0) * 100) / 100,
    toReview: lines.reduce((n, l) => n + l.line.toReview, 0),
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
  const { data: p } = await db.from("pay_periods").select("id, frequency, starts_on, ends_on, pay_day").eq("id", row.pay_period_id).maybeSingle();
  if (!p) return null;
  return { period: p as Period & { id: number }, employeeId: row.employee_id };
}

/** One person's current figures for a period (recomputed from the entries as they are now). */
export async function currentLine(db: SupabaseClient, period: Period, employeeId: number, now = Date.now()): Promise<PayLine> {
  const today = todayET(new Date(now));
  const [byPerson, rates] = await Promise.all([periodEntries(db, period), loadPayRates(db, [employeeId])]);
  return payLine(periodShifts(byPerson.get(employeeId) ?? [], period, now, today), rates as PayRate[]);
}
