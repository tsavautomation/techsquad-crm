import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { bouncieConfigured, fetchVehicles, isConnected } from "@/lib/bouncie/client";
import { digits, normalizeVin } from "@/lib/bouncie/match";
import { fromDateTimeLocalET, toDateTimeLocalET, todayET } from "@/lib/dates";
import { loadFieldDay } from "@/lib/field-day/return-card";
import { dayStatuses } from "@/lib/reports/rule-run";
import { addDays } from "@/lib/schedule/dates";
import { clockDay, distanceM, pastTime, type TimeEntry } from "@/lib/time-clock/clock";
import { visitSite } from "@/lib/time-clock/record";
import { adminDb } from "@/lib/supabase/admin";
import { ARRIVAL_RADIUS_M, ARRIVAL_WAIT_MIN, arrivalMessage, clockOutMessage, missingReportMessage, reportReminderTime, type PushKind } from "./engine";
import { notifyPush } from "./send";

// F27-b (Fred 2026-10-21): three reminders pushed to the person themselves, checked every five
// minutes by pg_cron (crm-push → /api/cron/push):
//   1. the van (Bouncie) has been within 500 m of the job for 45 minutes and the visit has no check-in;
//   2. still clocked in past the group's reminder time (Field 5 PM, Office 6 PM; Admin › Field day);
//   3. no job report for an attended visit, at a minute that changes every day between 7:00 and 7:30 PM.
// Each fires once per person per day (push_log is the memory); people who turned the event off or
// have no device on simply get nothing.

export type ReminderRun = { arrival: number; clockOut: number; reports: number; skipped?: string };

/** Logins by employee id: the Employee record's email is the login (users:sync keeps them equal). */
async function loginsByEmployee(db: SupabaseClient, employeeIds: number[]): Promise<Map<number, string>> {
  const ids = [...new Set(employeeIds)];
  if (!ids.length) return new Map();
  const { data: emps } = await db.from("employees").select("id, email").in("id", ids).is("deleted_at", null);
  const emails = ((emps ?? []) as { id: number; email: string | null }[]).filter((e) => e.email);
  const { data: profiles } = emails.length ? await db.from("profiles").select("id, email").in("email", emails.map((e) => e.email!.toLowerCase())).eq("active", true) : { data: [] };
  const byEmail = new Map(((profiles ?? []) as { id: string; email: string }[]).map((p) => [p.email.toLowerCase(), p.id]));
  return new Map(emails.flatMap((e) => (byEmail.has(e.email!.toLowerCase()) ? [[e.id, byEmail.get(e.email!.toLowerCase())!] as const] : [])));
}

/** True when this login already got this kind of reminder today. */
async function sentToday(db: SupabaseClient, userId: string, kind: PushKind, today: string): Promise<boolean> {
  const { count } = await db.from("push_log").select("id", { count: "exact", head: true }).eq("user_id", userId).eq("kind", kind).gte("created_at", fromDateTimeLocalET(`${today}T00:00`)).not("sent_at", "is", null);
  return (count ?? 0) > 0;
}

export async function runPushReminders(now = Date.now()): Promise<ReminderRun> {
  const db = adminDb();
  const today = todayET(new Date(now));
  const local = toDateTimeLocalET(new Date(now).toISOString()).slice(11, 16);
  const out: ReminderRun = { arrival: 0, clockOut: 0, reports: 0 };
  // The three parts are independent; one failing must not stop the others.
  const results = await Promise.allSettled([arrivalReminders(db, today, now), clockOutReminders(db, today, local, now), reportReminders(db, today, local)]);
  const [a, c, r] = results.map((x) => (x.status === "fulfilled" ? x.value : 0));
  out.arrival = a; out.clockOut = c; out.reports = r;
  const failed = results.filter((x): x is PromiseRejectedResult => x.status === "rejected").map((x) => String(x.reason?.message ?? x.reason));
  if (failed.length) out.skipped = failed.join(" | ");
  return out;
}

// 1. Arrived at the job (van within 500 m) but no check-in after 45 minutes.
async function arrivalReminders(db: SupabaseClient, today: string, now: number): Promise<number> {
  if (!bouncieConfigured() || !(await isConnected())) return 0;
  type V = { id: number; technician_id: number | null; vehicle_id: number | null; project_id: number | null; projects: { title: string | null } | null };
  const { data: visits } = await db
    .from("visits")
    .select("id, technician_id, vehicle_id, project_id, projects(title)")
    .gte("starts_at", fromDateTimeLocalET(`${today}T00:00`))
    .lt("starts_at", fromDateTimeLocalET(`${addDays(today, 1)}T00:00`))
    .is("checked_in_at", null)
    .not("vehicle_id", "is", null)
    .not("project_id", "is", null)
    .not("status", "in", "(Done,Cancelled)")
    .is("deleted_at", null);
  const open = ((visits ?? []) as unknown as V[]).filter((v) => v.technician_id && v.vehicle_id);
  // Visits checked in since the last pass leave the watch list.
  await db.from("arrival_watch").delete().not("visit_id", "in", `(${open.length ? open.map((v) => v.id).join(",") : "0"})`);
  if (!open.length) return 0;
  const live = await fetchVehicles();
  const { data: fleet } = await db.from("vehicles").select("id, vin, bouncie_imei").in("id", [...new Set(open.map((v) => v.vehicle_id!))]);
  const posOf = new Map<number, { lat: number; lng: number }>();
  for (const f of (fleet ?? []) as { id: number; vin: string | null; bouncie_imei: string | null }[]) {
    const hit = live.find((l) => (f.bouncie_imei && digits(l.imei) === digits(f.bouncie_imei)) || (f.vin && normalizeVin(l.vin) === normalizeVin(f.vin)));
    if (hit && hit.lat !== null && hit.lng !== null) posOf.set(f.id, { lat: hit.lat, lng: hit.lng });
  }
  const { data: watch } = await db.from("arrival_watch").select("visit_id, first_seen_at, notified_at");
  const seen = new Map(((watch ?? []) as { visit_id: number; first_seen_at: string; notified_at: string | null }[]).map((w) => [w.visit_id, w]));
  const logins = await loginsByEmployee(db, open.map((v) => v.technician_id!));
  let sent = 0;
  for (const v of open) {
    const van = posOf.get(v.vehicle_id!);
    if (!van) continue;
    const site = await visitSite(db, v.id);
    if (!site) continue;
    const near = distanceM(van, site) <= ARRIVAL_RADIUS_M;
    const w = seen.get(v.id);
    if (!near) {
      if (w && !w.notified_at) await db.from("arrival_watch").delete().eq("visit_id", v.id);
      continue;
    }
    if (!w) { await db.from("arrival_watch").upsert({ visit_id: v.id, first_seen_at: new Date(now).toISOString() }); continue; }
    if (w.notified_at || now - Date.parse(w.first_seen_at) < ARRIVAL_WAIT_MIN * 60_000) continue;
    const userId = logins.get(v.technician_id!);
    if (!userId) continue;
    const r = await notifyPush("arrived_no_check_in", arrivalMessage({ project: v.projects?.title ?? null, visitId: v.id }), userId);
    await db.from("arrival_watch").update({ notified_at: new Date(now).toISOString() }).eq("visit_id", v.id);
    sent += r.sent;
  }
  return sent;
}

// 2. Still clocked in past the group's reminder time.
async function clockOutReminders(db: SupabaseClient, today: string, local: string, now: number): Promise<number> {
  const settings = await loadFieldDay(db);
  const reminder = settings.time_clock.reminder;
  const due = { Field: pastTime(local, reminder.Field), Office: pastTime(local, reminder.Office) };
  if (!due.Field && !due.Office) return 0;
  const { data: rows } = await db
    .from("time_entries")
    .select("id, kind, at, visit_id, place, distance_m, lat, lng, employee_id")
    .gte("at", fromDateTimeLocalET(`${today}T00:00`))
    .lt("at", fromDateTimeLocalET(`${addDays(today, 1)}T00:00`))
    .is("deleted_at", null)
    .order("at");
  const byEmp = new Map<number, TimeEntry[]>();
  for (const e of (rows ?? []) as (TimeEntry & { employee_id: number })[]) byEmp.set(e.employee_id, [...(byEmp.get(e.employee_id) ?? []), e]);
  if (!byEmp.size) return 0;
  const { data: emps } = await db.from("employee_names").select("id, clock_group").in("id", [...byEmp.keys()]);
  const group = new Map(((emps ?? []) as { id: number; clock_group: string | null }[]).map((e) => [e.id, (e.clock_group ?? "Field") as "Field" | "Office"]));
  const logins = await loginsByEmployee(db, [...byEmp.keys()]);
  let sent = 0;
  for (const [empId, entries] of byEmp) {
    const day = clockDay(entries, now);
    if (!day.openSince || !due[group.get(empId) ?? "Field"]) continue;
    const userId = logins.get(empId);
    if (!userId || (await sentToday(db, userId, "forgot_clock_out", today))) continue;
    sent += (await notifyPush("forgot_clock_out", clockOutMessage({ since: day.openSince }), userId)).sent;
  }
  return sent;
}

// 3. No report for an attended visit, once per evening at a minute that changes with the date.
async function reportReminders(db: SupabaseClient, today: string, local: string): Promise<number> {
  if (!pastTime(local, reportReminderTime(today))) return 0;
  const missing = (await dayStatuses(today)).filter((r) => r.status === "missing");
  if (!missing.length) return 0;
  const byEmp = new Map<number, string[]>();
  for (const m of missing) byEmp.set(m.employee_id, [...new Set([...(byEmp.get(m.employee_id) ?? []), m.project])]);
  const logins = await loginsByEmployee(db, [...byEmp.keys()]);
  let sent = 0;
  for (const [empId, projects] of byEmp) {
    const userId = logins.get(empId);
    if (!userId || (await sentToday(db, userId, "missing_report", today))) continue;
    sent += (await notifyPush("missing_report", missingReportMessage({ projects }), userId)).sent;
  }
  return sent;
}
