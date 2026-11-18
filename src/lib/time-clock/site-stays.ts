import "server-only";
import { fromDateTimeLocalET, toDateTimeLocalET, todayET } from "@/lib/dates";
import { addDays } from "@/lib/schedule/dates";
import { adminDb, hasAdminKey } from "@/lib/supabase/admin";
import { LEFT_NOTE, leftPlan, type TimeEntry } from "./clock";

// SS-a (Fred 2026-11-18): every visit gets its "Left the job". When the person does not press it, the system
// writes one at the time of whatever ended the visit: "On my way" to another job, "Arrived" at another job, the
// clock-out (typed by the person, written by the system or corrected by the office) or, for a past day with none
// of those, the end of the day. The entry is marked "by the system" and stays editable. Runs after a clock-out,
// after a visit step, after the office changes a day, every hour for the last two weeks, and from the backfill
// script for the history. Idempotent.

type Row = TimeEntry & { employee_id: number; user_id: string };
export type LeftWritten = { employee_id: number; visit_id: number; at: string; reason: keyof typeof LEFT_NOTE; moved: boolean };

/**
 * Write (or, with `dryRun`, only list) the system "Left the job" entries missing for these people over [from, to].
 * `employeeIds` null = everyone with entries in the range.
 */
export async function closeOpenStays(employeeIds: number[] | null, from: string, to: string, opts: { dryRun?: boolean; now?: number } = {}): Promise<LeftWritten[]> {
  const out: LeftWritten[] = [];
  if (!hasAdminKey() || (employeeIds && !employeeIds.length) || from > to) return out;
  const db = adminDb();
  const now = opts.now ?? Date.now();
  const today = todayET(new Date(now));
  const rows: Row[] = [];
  for (let page = 0; ; page += 1000) {
    let q = db
      .from("time_entries")
      .select("id, employee_id, user_id, kind, at, visit_id, place, distance_m, lat, lng, needs_adjustment, auto_closed, corrected_at")
      .gte("at", fromDateTimeLocalET(`${from}T00:00`))
      .lt("at", fromDateTimeLocalET(`${addDays(to, 1)}T00:00`))
      .is("deleted_at", null)
      .order("at")
      .order("id")
      .range(page, page + 999);
    if (employeeIds) q = q.in("employee_id", employeeIds);
    const { data, error } = await q;
    if (error) throw new Error(`time entries: ${error.message}`);
    rows.push(...((data ?? []) as Row[]));
    if ((data ?? []).length < 1000) break;
  }
  // One person's day at a time (the Eastern day of each entry).
  const groups = Map.groupBy(rows, (r) => `${r.employee_id}|${toDateTimeLocalET(r.at).slice(0, 10)}`);
  for (const [key, entries] of groups) {
    if (!entries.some((e) => e.kind === "visit_in")) continue;
    const employeeId = Number(key.split("|")[0]);
    const plan = leftPlan(entries, now, today);
    for (const c of plan.create) {
      out.push({ employee_id: employeeId, visit_id: c.visitId, at: c.at, reason: c.reason, moved: false });
      if (opts.dryRun) continue;
      const userId = entries.find((e) => e.id === c.inId)?.user_id ?? entries[0].user_id;
      const { error } = await db.rpc("system_left_job_add", { p_employee: employeeId, p_user: userId, p_visit: c.visitId, p_at: c.at, p_note: LEFT_NOTE[c.reason] });
      if (error) throw new Error(`Left the job for employee #${employeeId}, visit #${c.visitId}: ${error.message}`);
    }
    for (const m of plan.move) {
      const visitId = entries.find((e) => e.id === m.id)?.visit_id ?? 0;
      out.push({ employee_id: employeeId, visit_id: visitId, at: m.at, reason: m.reason, moved: true });
      if (opts.dryRun) continue;
      const { error } = await db.rpc("system_left_job_move", { p_id: m.id, p_at: m.at, p_note: LEFT_NOTE[m.reason] });
      if (error) throw new Error(`Left the job #${m.id}: ${error.message}`);
    }
  }
  return out;
}

/** Never throws: a problem here must not break a clock-out or a visit step. */
export async function closeOpenStaysSafely(employeeIds: number[] | null, from: string, to: string): Promise<void> {
  try {
    await closeOpenStays(employeeIds, from, to);
  } catch (e) {
    console.error("site stays:", e);
  }
}
