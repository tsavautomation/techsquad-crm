import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { fromDateTimeLocalET, todayET } from "@/lib/dates";
import { loadFieldDay } from "@/lib/field-day/return-card";
import { excessOf, limitAt, type HoursRow, type OvertimeState } from "@/lib/payroll/overtime";
import { scheduleInForce, type Assignment } from "@/lib/payroll/periods";
import { loginsByEmployee } from "@/lib/push/reminders";
import { notifyPush } from "@/lib/push/send";
import { addDays } from "@/lib/schedule/dates";
import { adminDb, hasAdminKey } from "@/lib/supabase/admin";
import { AUTO_REFUSAL_COMMENT, decidedMessage, justifyDueAt, justifyMessage, OPEN_STATUSES, reconcile, reviewCutoff, stateOf, weeklyMessage, type OvertimeDay } from "./overtime-rules";
import { personDays } from "./person-sheet";
import { closeOpenStaysSafely } from "./site-stays";
import { ABSENCE } from "./time-off-rules";
import type { SheetEntry } from "./timesheet";

// OT-b Overtime approval: the server side of the flow. Reads use the viewer's own access; the writes here run
// with the service role after the callers' own checks (the tables have no write policy for signed-in people).

const COLS = "id, employee_id, day, worked_minutes, excess_minutes, status, justification, justified_at, justify_due_at, decided_by, decided_at, decision_comment, auto_refused";

export type OvertimeSettings = { groups: string[]; since: string; justifyHours: number };
export async function overtimeSettings(db: SupabaseClient): Promise<OvertimeSettings> {
  const s = (await loadFieldDay(db)).overtime;
  return { groups: s.approval_groups, since: s.since, justifyHours: s.justify_hours };
}
export const overtimeNeedsApproval = (group: string | null | undefined, s: OvertimeSettings) => s.groups.includes(group ?? "Field");

/** The overtime days of some people in a range (void rows left out unless asked). */
export async function loadOvertimeDays(db: SupabaseClient, employeeIds: number[], from: string, to: string, withVoid = false): Promise<OvertimeDay[]> {
  if (!employeeIds.length) return [];
  let q = db.from("overtime_days").select(COLS).in("employee_id", employeeIds).gte("day", from).lte("day", to).order("day");
  if (!withVoid) q = q.neq("status", "void");
  const { data } = await q;
  return (data ?? []) as OvertimeDay[];
}

/**
 * What the pay line does with one person's overtime, day by day: null (paid, no approval) for a group that needs
 * none or a day before the flow started; else the row's state (no row yet = still waiting).
 */
export function overtimeStateFor(rows: OvertimeDay[], group: string | null | undefined, settings: OvertimeSettings): (day: string) => OvertimeState | null {
  const needs = overtimeNeedsApproval(group, settings);
  const byDay = new Map(rows.map((r) => [r.day, r]));
  return (day) => (!needs || day < settings.since ? null : stateOf(byDay.get(day)));
}

type EntryRow = SheetEntry & { employee_id: number };
type Person = { id: number; clock_group: string | null; must_clock_in: boolean };

export type SyncResult = { created: number; updated: number; reopened: number; voided: number; absencesCleared: number; awaiting: OvertimeDay[] };

/**
 * Bring the overtime days of `employeeIds` over [from, to] in line with their clock entries (idempotent): create a
 * day whose excess passes the tolerance, update or reopen one whose hours changed, void one that has none any more.
 * Only days whose shifts all have their real clock-out count. Also takes back an automatic absence (TO-a) on a day
 * that got a clock-in after all. Called after a clock-out, after the office edits a day, and from the hourly tick.
 */
export async function syncClockDays(employeeIds: number[], from: string, to: string, now: number = Date.now()): Promise<SyncResult> {
  const out: SyncResult = { created: 0, updated: 0, reopened: 0, voided: 0, absencesCleared: 0, awaiting: [] };
  if (!hasAdminKey() || !employeeIds.length || from > to) return out;
  // SS-a: first, every visit of these days nobody closed gets its "Left the job" (at the clock-out, the next job, or the end of a past day).
  await closeOpenStaysSafely(employeeIds, from, to);
  const db = adminDb();
  const settings = await overtimeSettings(db);
  const today = todayET(new Date(now));
  const { data: emp } = await db.from("employees").select("id, clock_group, must_clock_in").in("id", employeeIds).is("deleted_at", null);
  const people = (emp ?? []) as Person[];
  if (!people.length) return out;
  const ids = people.map((p) => p.id);

  const entries: EntryRow[] = [];
  for (let page = 0; ; page += 1000) {
    const { data } = await db
      .from("time_entries")
      .select("id, employee_id, kind, at, note, reviewed_at, auto_closed, needs_adjustment")
      .in("employee_id", ids)
      .in("kind", ["clock_in", "clock_out"])
      .gte("at", fromDateTimeLocalET(`${from}T00:00`))
      .lt("at", fromDateTimeLocalET(`${addDays(to, 1)}T06:00`))
      .is("deleted_at", null)
      .order("at")
      .order("id")
      .range(page, page + 999);
    entries.push(...((data ?? []) as EntryRow[]));
    if ((data ?? []).length < 1000) break;
  }
  const byPerson = Map.groupBy(entries, (e) => e.employee_id);

  // TO-a: an automatic absence on a day that now has a clock-in is taken back.
  const { data: absences } = await db.from("time_off_entries").select("id, employee_id, day").in("employee_id", ids).eq("kind", ABSENCE).eq("auto", true).gte("day", from).lte("day", to).is("deleted_at", null);
  for (const a of (absences ?? []) as { id: number; employee_id: number; day: string }[]) {
    const days = personDays(byPerson.get(a.employee_id) ?? [], a.day, a.day, [], now, today);
    if (days[0]?.shifts.length) {
      await db.from("time_off_entries").update({ deleted_at: new Date(now).toISOString() }).eq("id", a.id);
      out.absencesCleared++;
    }
  }

  const start = from < settings.since ? settings.since : from;
  // Only people paid through a pay schedule: someone on none (the owners) is out of the clock and of this flow.
  const { data: links } = await db.from("employee_pay_schedules").select("employee_id, schedule_id, effective_from").in("employee_id", ids);
  const flow = people.filter((p) => p.must_clock_in && overtimeNeedsApproval(p.clock_group, settings) && scheduleInForce((links ?? []) as Assignment[], p.id, to) !== null);
  if (!flow.length || start > to) return out;
  const flowIds = flow.map((p) => p.id);
  const [{ data: groupRows }, { data: ownRows }, existing] = await Promise.all([
    db.from("clock_group_hours").select("clock_group, daily_minutes, tolerance_minutes, effective_from"),
    db.from("employee_daily_hours").select("employee_id, daily_minutes, effective_from").in("employee_id", flowIds),
    loadOvertimeDays(db, flowIds, start, to, true),
  ]);
  const groupHours = Map.groupBy((groupRows ?? []) as (HoursRow & { clock_group: string })[], (g) => g.clock_group);
  const ownHours = Map.groupBy((ownRows ?? []) as (HoursRow & { employee_id: number })[], (r) => r.employee_id);
  const rowOf = new Map(existing.map((r) => [`${r.employee_id}|${r.day}`, r]));
  const stamp = new Date(now).toISOString();
  const toNotify: OvertimeDay[] = [];

  for (const p of flow) {
    const group = groupHours.get(p.clock_group ?? "Field") ?? [];
    const own = ownHours.get(p.id) ?? [];
    for (const d of personDays(byPerson.get(p.id) ?? [], start, to, [], now, today)) {
      const complete = d.shifts.every((s) => s.outAt !== null);
      const excess = excessOf(d.minutes, limitAt(group, own, d.date));
      const row = rowOf.get(`${p.id}|${d.date}`) ?? null;
      const r = reconcile(row, excess, complete);
      if (r.action === "none") {
        if (row && row.status === "awaiting_justification") out.awaiting.push(row);
        continue;
      }
      if (r.action === "create") {
        const { data, error } = await db.from("overtime_days").insert({ employee_id: p.id, day: d.date, worked_minutes: d.minutes, excess_minutes: excess, status: "awaiting_justification", justify_due_at: justifyDueAt(stamp, settings.justifyHours) }).select(COLS).single();
        if (error || !data) continue; // a parallel call created it
        const made = data as OvertimeDay;
        await db.from("overtime_day_events").insert({ overtime_day_id: made.id, employee_id: p.id, action: "created", minutes: excess });
        out.created++;
        out.awaiting.push(made);
        toNotify.push(made);
      } else if (r.action === "update" && row) {
        await db.from("overtime_days").update({ worked_minutes: d.minutes, excess_minutes: excess }).eq("id", row.id);
        await db.from("overtime_day_events").insert({ overtime_day_id: row.id, employee_id: p.id, action: "updated", minutes: excess, note: `Hours changed: +${row.excess_minutes} → +${excess} min` });
        out.updated++;
        if (row.status === "awaiting_justification") out.awaiting.push({ ...row, worked_minutes: d.minutes, excess_minutes: excess });
      } else if (r.action === "reopen" && row) {
        const patch = { worked_minutes: d.minutes, excess_minutes: excess, status: r.to, decided_by: null, decided_at: null, decision_comment: null, auto_refused: false, justify_due_at: r.to === "awaiting_justification" ? justifyDueAt(stamp, settings.justifyHours) : null };
        await db.from("overtime_days").update(patch).eq("id", row.id);
        await db.from("overtime_day_events").insert({ overtime_day_id: row.id, employee_id: p.id, action: "reopened", minutes: excess, note: row.status === "void" ? "The day has overtime again" : `Hours changed after the decision (${row.status}): +${row.excess_minutes} → +${excess} min` });
        out.reopened++;
        const next = { ...row, ...patch } as OvertimeDay;
        if (r.to === "awaiting_justification") {
          out.awaiting.push(next);
          toNotify.push(next);
        }
      } else if (r.action === "void" && row) {
        await db.from("overtime_days").update({ status: "void", worked_minutes: d.minutes, excess_minutes: 0, decided_by: null, decided_at: null, decision_comment: null, auto_refused: false, justify_due_at: null }).eq("id", row.id);
        await db.from("overtime_day_events").insert({ overtime_day_id: row.id, employee_id: p.id, action: "void", minutes: 0, note: "The day no longer has overtime" });
        out.voided++;
      }
    }
  }
  if (toNotify.length) {
    const logins = await loginsByEmployee(db, toNotify.map((r) => r.employee_id));
    for (const r of toNotify) {
      const userId = logins.get(r.employee_id);
      if (userId) await notifyPush("overtime_justify", justifyMessage({ day: r.day, excess: r.excess_minutes }), userId).catch(() => undefined);
    }
  }
  return out;
}

/** After an office edit of someone's clock entry: resync that person around the entry's day. Never throws. */
export async function syncAroundEntry(entryId: number): Promise<void> {
  try {
    if (!hasAdminKey()) return;
    const { data } = await adminDb().from("time_entries").select("employee_id, at").eq("id", entryId).maybeSingle();
    const e = data as { employee_id: number; at: string } | null;
    if (!e) return;
    const day = todayET(new Date(e.at));
    await syncClockDays([e.employee_id], addDays(day, -1), day);
  } catch (err) {
    console.error("overtime sync:", err);
  }
}

/** Hourly: everyone who clocks in, over the last two weeks; then refuse what was never justified in time. */
export async function overtimeHourly(now: number = Date.now()): Promise<Record<string, unknown>> {
  if (!hasAdminKey()) return { skipped: "no admin key" };
  const db = adminDb();
  const today = todayET(new Date(now));
  const { data: emp } = await db.from("employees").select("id").is("deleted_at", null).eq("must_clock_in", true).in("status", ["Active", "Reports"]);
  const sync = await syncClockDays(((emp ?? []) as { id: number }[]).map((e) => e.id), addDays(today, -14), today, now);
  const refused = await refuseOverdue(now);
  return { created: sync.created, updated: sync.updated, reopened: sync.reopened, voided: sync.voided, absencesCleared: sync.absencesCleared, autoRefused: refused };
}

/** Days still waiting for a justification past their 48 hours: refused, with the automatic comment. */
export async function refuseOverdue(now: number = Date.now()): Promise<number> {
  const db = adminDb();
  const stamp = new Date(now).toISOString();
  const { data } = await db.from("overtime_days").select(COLS).eq("status", "awaiting_justification").lt("justify_due_at", stamp);
  const rows = (data ?? []) as OvertimeDay[];
  if (!rows.length) return 0;
  const logins = await loginsByEmployee(db, rows.map((r) => r.employee_id));
  for (const r of rows) {
    await db.from("overtime_days").update({ status: "refused", auto_refused: true, decided_at: stamp, decided_by: null, decision_comment: AUTO_REFUSAL_COMMENT }).eq("id", r.id).eq("status", "awaiting_justification");
    await db.from("overtime_day_events").insert({ overtime_day_id: r.id, employee_id: r.employee_id, action: "auto_refused", minutes: r.excess_minutes, note: AUTO_REFUSAL_COMMENT });
    const userId = logins.get(r.employee_id);
    if (userId) await notifyPush("overtime_decided", decidedMessage({ day: r.day, excess: r.excess_minutes, approved: false, comment: AUTO_REFUSAL_COMMENT }), userId).catch(() => undefined);
  }
  return rows.length;
}

/**
 * Thursday morning: the single weekly notice to the approver with everything undecided up to Wednesday. With
 * `backup` (Friday morning): what is still undecided goes to the backup approvers, who may decide too.
 */
export async function weeklyOvertimeNotice(today: string, backup = false): Promise<Record<string, unknown>> {
  if (!hasAdminKey()) return { skipped: "no admin key" };
  const db = adminDb();
  const cutoff = backup ? addDays(reviewCutoff(today), -1) : reviewCutoff(today);
  const { data } = await db.from("overtime_days").select("id, employee_id, day, status").in("status", OPEN_STATUSES).lte("day", cutoff);
  const rows = ((data ?? []) as { id: number; employee_id: number; day: string; status: string }[]).filter((r) => !backup || r.status === "pending");
  if (!rows.length) return { days: 0, sent: 0 };
  const { data: names } = await db.from("employee_names").select("id, title").in("id", [...new Set(rows.map((r) => r.employee_id))]);
  const people = ((names ?? []) as { id: number; title: string | null }[]).map((n) => n.title ?? `#${n.id}`).sort();
  const r = await notifyPush(backup ? "overtime_backup" : "overtime_weekly", weeklyMessage({ days: rows.length, people, backup }));
  return { days: rows.length, people: people.length, sent: r.sent };
}
