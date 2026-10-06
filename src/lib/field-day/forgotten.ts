import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { fromDateTimeLocalET, toDateTimeLocalET } from "@/lib/dates";
import { loadFieldDay } from "@/lib/field-day/return-card";
import { missingReportsFor } from "@/lib/reports/rule-run";
import { addDays } from "@/lib/schedule/dates";
import { adminDb, hasAdminKey } from "@/lib/supabase/admin";
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

  // 1. Visits still on site (checked in up to the end of the day, never checked out).
  const { data: open } = await db
    .from("visits")
    .select("id, technician_id, checked_in_at, projects(title)")
    .lt("checked_in_at", to)
    .is("checked_out_at", null)
    .is("deleted_at", null)
    .neq("status", "Cancelled");
  const visits = (open ?? []) as unknown as { id: number; technician_id: number | null; checked_in_at: string; projects: { title: string | null } | null }[];
  for (const v of visits) {
    const day = toDateTimeLocalET(v.checked_in_at).slice(0, 10);
    const closedAt = autoCloseAt(v.checked_in_at, day, cutoffFor(v.technician_id));
    const { error } = await db.from("visits").update({ status: "Done", checked_out_at: closedAt, auto_closed_at: new Date().toISOString(), auto_closed_reason: "end_of_day" }).eq("id", v.id);
    if (error) throw new Error(`visit #${v.id}: ${error.message}`);
    if (v.technician_id !== null) warnings.push({ employee_id: v.technician_id, user_id: null, kind: "forgot_checkout", day, visit_id: v.id, project: v.projects?.title ?? null, closed_at: closedAt });
  }

  // 2. Time clock: a day whose last entry is a clock-in gets its clock-out at the cut-off.
  const from = fromDateTimeLocalET(`${date}T00:00`);
  const { data: entries } = await db.from("time_entries").select("id, employee_id, user_id, kind, at").in("kind", ["clock_in", "clock_out"]).gte("at", from).lt("at", to).order("at");
  const last = new Map<number, { user_id: string; kind: string; at: string }>();
  for (const e of (entries ?? []) as { employee_id: number; user_id: string; kind: string; at: string }[]) last.set(e.employee_id, e);
  let clockOuts = 0;
  for (const [employeeId, e] of last) {
    if (e.kind !== "clock_in") continue;
    const closedAt = autoCloseAt(e.at, date, cutoffFor(employeeId));
    const { error } = await db.from("time_entries").insert({ employee_id: employeeId, user_id: e.user_id, kind: "clock_out", at: closedAt, place: "Unknown", note: "Automatic clock-out: the day was never closed (F20)" });
    if (error) throw new Error(`clock-out for employee #${employeeId}: ${error.message}`);
    clockOuts++;
    warnings.push({ employee_id: employeeId, user_id: e.user_id, kind: "forgot_clock_out", day: date, visit_id: null, project: null, closed_at: closedAt });
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
