import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { fromDateTimeLocalET, toDateTimeLocalET } from "@/lib/dates";
import { loadFieldDay } from "@/lib/field-day/return-card";
import { missingReportsFor } from "@/lib/reports/rule-run";
import { addDays } from "@/lib/schedule/dates";
import { adminDb, hasAdminKey } from "@/lib/supabase/admin";
import type { EntryKind } from "@/lib/time-clock/clock";
import { forgottenClockOutAt, openClockIns } from "@/lib/time-clock/timesheet";
import { autoCloseAt } from "./day";

// F20 Forgotten check-outs (SPEC §9.1 F20): after midnight, whoever is still "On site" is checked out at the
// day's cut-off (4 PM, 5 PM for the late list), an open time-clock day is clocked out the same way, and each
// of those, plus every Job Report still missing for the day, becomes a warning the person must acknowledge.

type WarningRow = { employee_id: number; user_id: string | null; kind: "forgot_checkout" | "forgot_clock_out" | "missing_report"; day: string; visit_id: number | null; project: string | null; closed_at: string | null };

async function loginsFor(db: SupabaseClient, employeeIds: number[]): Promise<Map<number, string | null>> {
  const ids = [...new Set(employeeIds)];
  if (!ids.length) return new Map();
  const { data: emp } = await db.from("employees").select("id, email").in("id", ids);
  const rows = (emp ?? []) as { id: number; email: string | null }[];
  const emails = rows.map((e) => e.email?.toLowerCase()).filter((x): x is string => Boolean(x));
  const { data: prof } = emails.length ? await db.from("profiles").select("id, email").in("email", emails) : { data: [] };
  const byEmail = new Map(((prof ?? []) as { id: string; email: string }[]).map((p) => [p.email.toLowerCase(), p.id]));
  return new Map(rows.map((e) => [e.id, e.email ? (byEmail.get(e.email.toLowerCase()) ?? null) : null]));
}

export async function closeForgottenDay(date: string): Promise<Record<string, unknown>> {
  if (!hasAdminKey()) return { skipped: "no admin key" };
  const db = adminDb();
  const settings = await loadFieldDay(db);
  const ac = settings.time_clock.auto_checkout;
  const cutoffFor = (employeeId: number | null) => (employeeId !== null && ac.late_employee_ids.includes(employeeId) ? ac.late_time : ac.time);
  const to = fromDateTimeLocalET(`${addDays(date, 1)}T00:00`);
  const warnings: WarningRow[] = [];

  // 1. People still on site (F29, per person: checked in up to the end of the day, never checked out). Each open
  //    attendance row is closed at that person's cut-off and the visit's team summary is recomputed.
  const { data: open } = await db
    .from("visit_attendance")
    .select("id, visit_id, employee_id, checked_in_at, visits!inner(deleted_at, status, projects(title))")
    .lt("checked_in_at", to)
    .is("checked_out_at", null)
    .is("visits.deleted_at", null)
    .neq("visits.status", "Cancelled");
  const openRows = (open ?? []) as unknown as { id: number; visit_id: number; employee_id: number; checked_in_at: string; visits: { projects: { title: string | null } | null } | null }[];
  const touched = new Set<number>();
  for (const a of openRows) {
    const day = toDateTimeLocalET(a.checked_in_at).slice(0, 10);
    const closedAt = autoCloseAt(a.checked_in_at, day, cutoffFor(a.employee_id));
    const { error } = await db.from("visit_attendance").update({ checked_out_at: closedAt, auto_closed_at: new Date().toISOString(), auto_closed_reason: "end_of_day", updated_at: new Date().toISOString() }).eq("id", a.id);
    if (error) throw new Error(`attendance #${a.id}: ${error.message}`);
    touched.add(a.visit_id);
    warnings.push({ employee_id: a.employee_id, user_id: null, kind: "forgot_checkout", day, visit_id: a.visit_id, project: a.visits?.projects?.title ?? null, closed_at: closedAt });
  }
  for (const id of touched) {
    const { error } = await db.rpc("visit_recompute", { p_id: id });
    if (error) throw new Error(`visit #${id}: ${error.message}`);
  }
  const visits = [...touched];

  // 2. Time clock (TC-d): a day whose last clock entry is a clock-in is clocked out at the person's last recorded
  //    activity after it (job arrival, leaving a job, On my way), else at the cut-off; marked auto_closed so the
  //    timesheet shows "Auto clock-out · Needs review" until the office reviews it.
  const from = fromDateTimeLocalET(`${date}T00:00`);
  const { data: entries } = await db.from("time_entries").select("id, employee_id, user_id, kind, at").gte("at", from).lt("at", to).is("deleted_at", null).order("at");
  const all = (entries ?? []) as { id: number; employee_id: number; user_id: string; kind: EntryKind; at: string }[];
  let clockOuts = 0;
  for (const [employeeId, e] of openClockIns(all)) {
    const activity = all.filter((x) => x.employee_id === employeeId && x.kind !== "clock_in" && x.kind !== "clock_out").map((x) => x.at);
    const closed = forgottenClockOutAt(e.at, activity, date, cutoffFor(employeeId));
    const note = closed.reason === "last_activity" ? "Auto clock-out – needs review: the day was never closed, clocked out at the last recorded activity (TC-d)" : "Auto clock-out – needs review: the day was never closed and nothing was recorded after the clock-in, clocked out at the cut-off (TC-d)";
    const { error } = await db.from("time_entries").insert({ employee_id: employeeId, user_id: e.user_id, kind: "clock_out", at: closed.at, place: "Unknown", note, auto_closed: true });
    if (error) throw new Error(`clock-out for employee #${employeeId}: ${error.message}`);
    clockOuts++;
    warnings.push({ employee_id: employeeId, user_id: e.user_id, kind: "forgot_clock_out", day: date, visit_id: null, project: null, closed_at: closed.at });
  }

  // 3. Job Reports still missing for the day (the F18 rule decides who owed one; nothing when the rule is off).
  const missing = await missingReportsFor(date);
  for (const m of missing) warnings.push({ employee_id: m.employee_id, user_id: null, kind: "missing_report", day: m.date, visit_id: m.visit_id, project: m.project, closed_at: null });

  // Warnings go to the person's login (same email as the Employee record); people without one keep the record anyway.
  const logins = await loginsFor(db, warnings.filter((w) => !w.user_id).map((w) => w.employee_id));
  const rows = warnings.map((w) => ({ ...w, user_id: w.user_id ?? logins.get(w.employee_id) ?? null }));
  if (rows.length) {
    const { error } = await db.from("field_warnings").upsert(rows, { onConflict: "employee_id,kind,day,visit_id", ignoreDuplicates: true });
    if (error) throw new Error(`warnings: ${error.message}`);
  }
  return { date, visits_closed: visits.length, clock_outs: clockOuts, missing_reports: missing.length, warnings: rows.length };
}
