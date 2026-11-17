import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { fromDateTimeLocalET, toDateTimeLocalET } from "@/lib/dates";
import { loadFieldDay } from "@/lib/field-day/return-card";
import { limitAt, type HoursRow } from "@/lib/payroll/overtime";
import { addDays } from "@/lib/schedule/dates";
import { adminDb, hasAdminKey } from "@/lib/supabase/admin";
import { ABSENCE, bankBalance, isAbsence, requestDays, type BankRow, type OffRequest, type TakenRow } from "./time-off-rules";

// TO-a Time off: what the screens read (requests, the bank, who is out) and the engine parts (turning an approved
// request into one row per weekday; the nightly absences without a request). Reads use the caller's access.

export type OffEntry = { id: number; employee_id: number; day: string; kind: string; paid: boolean; minutes: number; note: string | null; request_id: number | null; auto: boolean };
export type BankEntry = BankRow & { id: number; employee_id: number; kind: "opening" | "adjustment"; reason: string; created_by: string | null; created_at: string };

const ENTRY_COLS = "id, employee_id, day, kind, paid, minutes, note, request_id, auto";
const REQUEST_COLS = "id, employee_id, policy, starts_on, ends_on, minutes_per_day, reason, status, direct, decided_by, decided_at, decision_comment, created_at";

export async function loadOffEntries(db: SupabaseClient, employeeIds: number[] | null, from: string, to: string): Promise<OffEntry[]> {
  if (employeeIds && !employeeIds.length) return [];
  let q = db.from("time_off_entries").select(ENTRY_COLS).gte("day", from).lte("day", to).is("deleted_at", null).order("day");
  if (employeeIds) q = q.in("employee_id", employeeIds);
  const { data } = await q;
  return (data ?? []) as OffEntry[];
}

export async function loadRequests(db: SupabaseClient, opts: { employeeIds?: number[]; status?: string; touching?: { from: string; to: string }; limit?: number }): Promise<OffRequest[]> {
  if (opts.employeeIds && !opts.employeeIds.length) return [];
  let q = db.from("time_off_requests").select(REQUEST_COLS).order("created_at", { ascending: false }).limit(opts.limit ?? 200);
  if (opts.employeeIds) q = q.in("employee_id", opts.employeeIds);
  if (opts.status) q = q.eq("status", opts.status);
  if (opts.touching) q = q.lte("starts_on", opts.touching.to).gte("ends_on", opts.touching.from);
  const { data } = await q;
  return (data ?? []) as OffRequest[];
}

export type Bank = { rows: BankEntry[]; taken: TakenRow[] };

/** Each person's bank: the hand-typed rows and every time-off day taken (the balance is computed from both). */
export async function loadBanks(db: SupabaseClient, employeeIds: number[]): Promise<Map<number, Bank>> {
  const out = new Map<number, Bank>(employeeIds.map((id) => [id, { rows: [], taken: [] }]));
  if (!employeeIds.length) return out;
  const [{ data: rows }, { data: taken }] = await Promise.all([
    db.from("time_off_bank_entries").select("id, employee_id, day, delta_minutes, kind, reason, created_by, created_at").in("employee_id", employeeIds).order("day").order("id"),
    db.from("time_off_entries").select("employee_id, day, minutes").in("employee_id", employeeIds).is("deleted_at", null).limit(5000),
  ]);
  for (const r of (rows ?? []) as BankEntry[]) out.get(r.employee_id)?.rows.push(r);
  for (const t of (taken ?? []) as (TakenRow & { employee_id: number })[]) out.get(t.employee_id)?.taken.push({ day: t.day, minutes: t.minutes });
  return out;
}

export const balanceOf = (bank: Bank | undefined, asOf: string) => (bank ? bankBalance(bank.rows, bank.taken, asOf) : null);

/** A person's full day in minutes on a date (their own hours, else their group's: Field 9 h, Office 10 h). */
export async function fullDayMinutes(db: SupabaseClient, employeeId: number, day: string): Promise<number> {
  const [{ data: emp }, { data: groups }, { data: own }] = await Promise.all([
    db.from("employee_names").select("clock_group").eq("id", employeeId).maybeSingle(),
    db.from("clock_group_hours").select("clock_group, daily_minutes, tolerance_minutes, effective_from"),
    db.from("employee_daily_hours").select("daily_minutes, effective_from").eq("employee_id", employeeId),
  ]);
  const group = (emp as { clock_group: string | null } | null)?.clock_group ?? "Field";
  return limitAt(((groups ?? []) as (HoursRow & { clock_group: string })[]).filter((g) => g.clock_group === group), (own ?? []) as HoursRow[], day).daily;
}

/**
 * An approved request becomes one time-off row per weekday of its range (holidays left out), each capped at the
 * person's full day. An automatic absence on one of those days is replaced; another time off there stops it.
 */
export async function materializeRequest(db: SupabaseClient, r: Pick<OffRequest, "id" | "employee_id" | "policy" | "starts_on" | "ends_on" | "minutes_per_day" | "reason">, byUser: string | null): Promise<{ ok: true; days: number } | { ok: false; message: string }> {
  const settings = await loadFieldDay(db);
  const days = requestDays(r.starts_on, r.ends_on, settings.time_off.holidays);
  if (!days.length) return { ok: false, message: "Those dates have no working day (Monday to Friday)." };
  const existing = await loadOffEntries(db, [r.employee_id], days[0], days[days.length - 1]);
  const clash = existing.find((e) => days.includes(e.day) && e.kind !== ABSENCE);
  if (clash) return { ok: false, message: `There is already time off on ${clash.day}.` };
  const replace = existing.filter((e) => days.includes(e.day) && e.kind === ABSENCE).map((e) => e.id);
  if (replace.length) await db.from("time_off_entries").update({ deleted_at: new Date().toISOString() }).in("id", replace);
  const full = await fullDayMinutes(db, r.employee_id, days[0]);
  const rows = days.map((day) => ({ employee_id: r.employee_id, day, kind: r.policy, paid: r.policy === "Paid absence", minutes: Math.min(r.minutes_per_day, full), note: r.reason.slice(0, 300), request_id: r.id, created_by: byUser }));
  const { error } = await db.from("time_off_entries").insert(rows);
  if (error) return { ok: false, message: error.message };
  return { ok: true, days: rows.length };
}

/**
 * The nightly check of one finished day (TO-a 4.4): each active person who must clock in, with no clock-in that
 * weekday and no time off, gets an absence without a request: their full day, unpaid, taken from the bank.
 * Runs once per day (the tick claims the slot), so an absence the office removes is not written again.
 */
export async function markAbsences(day: string): Promise<Record<string, unknown>> {
  if (!hasAdminKey()) return { skipped: "no admin key" };
  const db = adminDb();
  const settings = await loadFieldDay(db);
  if (day < settings.time_off.absences_since) return { skipped: "before the start date" };
  if (!isAbsence({ day, hasClockIn: false, hasTimeOff: false, holidays: settings.time_off.holidays })) return { skipped: "weekend or holiday" };
  const { data: emp } = await db.from("employees").select("id, clock_group").is("deleted_at", null).eq("must_clock_in", true).in("status", ["Active", "Reports"]);
  const people = (emp ?? []) as { id: number; clock_group: string | null }[];
  if (!people.length) return { marked: 0 };
  const ids = people.map((p) => p.id);
  const [{ data: ins }, off, { data: groups }, { data: own }] = await Promise.all([
    db.from("time_entries").select("employee_id, at").in("employee_id", ids).eq("kind", "clock_in").gte("at", fromDateTimeLocalET(`${day}T00:00`)).lt("at", fromDateTimeLocalET(`${addDays(day, 1)}T00:00`)).is("deleted_at", null),
    loadOffEntries(db, ids, day, day),
    db.from("clock_group_hours").select("clock_group, daily_minutes, tolerance_minutes, effective_from"),
    db.from("employee_daily_hours").select("employee_id, daily_minutes, effective_from").in("employee_id", ids),
  ]);
  const clocked = new Set(((ins ?? []) as { employee_id: number; at: string }[]).filter((e) => toDateTimeLocalET(e.at).slice(0, 10) === day).map((e) => e.employee_id));
  const hasOff = new Set(off.map((o) => o.employee_id));
  const groupHours = Map.groupBy((groups ?? []) as (HoursRow & { clock_group: string })[], (g) => g.clock_group);
  const ownHours = Map.groupBy((own ?? []) as (HoursRow & { employee_id: number })[], (r) => r.employee_id);
  const rows = people
    .filter((p) => isAbsence({ day, hasClockIn: clocked.has(p.id), hasTimeOff: hasOff.has(p.id), holidays: settings.time_off.holidays }))
    .map((p) => ({ employee_id: p.id, day, kind: ABSENCE, paid: false, auto: true, minutes: limitAt(groupHours.get(p.clock_group ?? "Field") ?? [], ownHours.get(p.id) ?? [], day).daily, note: "No clock-in and no time off that day (automatic)" }));
  if (!rows.length) return { marked: 0 };
  const { error } = await db.from("time_off_entries").insert(rows);
  if (error) return { error: error.message };
  return { marked: rows.length, people: rows.map((r) => r.employee_id) };
}
