import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { fromDateTimeLocalET, toDateTimeLocalET, formatDate } from "@/lib/dates";
import { loadFieldDay } from "@/lib/field-day/return-card";
import { buildTitle } from "@/lib/records/title";
import { joinTable } from "@/lib/records/relations";
import { addDays } from "@/lib/schedule/dates";
import { deliverQueuedSms, queueSms } from "@/lib/sms/twilio";
import { adminDb, hasAdminKey } from "@/lib/supabase/admin";
import { getTable } from "@/registry";
import { planLate, planMissing, planReminders, type LateFinding, type MissingDeficiency, type RuleEmployee, type RuleMode, type RuleReport, type RuleVisit, type Skipped } from "./rule";

// F18 Visit = Report rule (SPEC §9.1 F18): the server side. Loads a day's visits, reports and people,
// hands them to the pure engine (rule.ts) and acts on the plan: SMS through the outbox, deficiencies
// (+ a Negative Punctuality performance report each), or only a log line in Dry run. Everything runs
// with the service role and is logged in automation_runs under automation 900601 (900602 for Late).

export const RULE_AUTOMATION_ID = 900601;
export const LATE_AUTOMATION_ID = 900602;

type VisitRow = { id: number; project_id: number | null; status: string | null; starts_at: string; technician_id: number | null; checked_in_at: string | null; checked_out_at: string | null; visits_team: { target_id: number }[]; projects: { title: string | null } | null };
type ReportRow = { id: number; visit_id: number | null; project_id: number | null; date: string | null; created_at: string; team: { target_id: number }[] };

const REPORT_TEAM = joinTable(getTable("job_reports"), getTable("job_reports").fields.find((f) => f.name === "team_ids")!);

function toRuleVisit(v: VisitRow): RuleVisit {
  return {
    id: v.id,
    project_id: v.project_id,
    project: v.projects?.title ?? (v.project_id ? `Project #${v.project_id}` : `Visit #${v.id}`),
    date: toDateTimeLocalET(v.starts_at).slice(0, 10),
    people: [...new Set([v.technician_id, ...v.visits_team.map((t) => t.target_id)].filter((x): x is number => x !== null))],
    cancelled: v.status === "Cancelled",
    attended: Boolean(v.checked_in_at || v.checked_out_at || v.status === "Done"),
  };
}

const VISIT_COLS = "id, project_id, status, starts_at, technician_id, checked_in_at, checked_out_at, visits_team(target_id), projects(title)";

async function loadVisits(db: SupabaseClient, date: string): Promise<RuleVisit[]> {
  const { data } = await db.from("visits").select(VISIT_COLS).gte("starts_at", fromDateTimeLocalET(`${date}T00:00`)).lt("starts_at", fromDateTimeLocalET(`${addDays(date, 1)}T00:00`)).is("deleted_at", null).is("archived_at", null);
  return ((data ?? []) as unknown as VisitRow[]).map(toRuleVisit);
}

async function loadReports(db: SupabaseClient, visits: RuleVisit[], date: string): Promise<RuleReport[]> {
  if (!visits.length) return [];
  const ids = visits.map((v) => v.id);
  const projects = [...new Set(visits.map((v) => v.project_id).filter((x): x is number => x !== null))];
  const or = [`visit_id.in.(${ids.join(",")})`, projects.length ? `and(project_id.in.(${projects.join(",")}),date.eq.${date})` : null].filter(Boolean).join(",");
  const { data } = await db.from("job_reports").select(`id, visit_id, project_id, date, created_at, team:${REPORT_TEAM}(target_id)`).or(or).is("deleted_at", null);
  return ((data ?? []) as unknown as ReportRow[]).map((r) => ({ id: r.id, visit_id: r.visit_id, project_id: r.project_id, date: r.date, created_at: r.created_at, team: r.team.map((t) => t.target_id) }));
}

async function loadPeople(db: SupabaseClient, ids: number[]): Promise<RuleEmployee[]> {
  if (!ids.length) return [];
  const { data } = await db.from("employees").select("id, title, status, phone").in("id", ids);
  return ((data ?? []) as { id: number; title: string | null; status: string | null; phone: string | null }[]).map((e) => ({ id: e.id, name: e.title ?? `#${e.id}`, active: e.status !== "Inactive", phone: e.phone }));
}

async function log(db: SupabaseClient, automationId: number, recordId: number, event: string, status: "done" | "error", detail: Record<string, unknown>) {
  await db.from("automation_runs").insert({ automation_id: automationId, table_name: automationId === LATE_AUTOMATION_ID ? "job_reports" : "visits", record_id: recordId, event, status, detail });
}

/** Create a deficiency (or turn a Missing one into Late) with its Negative Punctuality performance report. */
async function recordDeficiency(db: SupabaseClient, d: { employee_id: number; visit_id: number; project_id: number | null; project: string; date: string; type: "Late" | "Missing"; report_id?: number | null }): Promise<string> {
  const { data: existing } = await db.from("report_deficiencies").select("id, type, status, performance_id").eq("employee_id", d.employee_id).eq("visit_id", d.visit_id).is("deleted_at", null).maybeSingle();
  const cur = existing as { id: number; type: string; status: string; performance_id: number | null } | null;
  const description = d.type === "Missing" ? `Job Report missing for the visit to ${d.project} on ${formatDate(d.date)} (F18 report rule).` : `Job Report for the visit to ${d.project} on ${formatDate(d.date)} was filed late (F18 report rule).`;
  if (cur) {
    if (cur.type === "Missing" && d.type === "Late") {
      const title = await buildTitle(getTable("report_deficiencies"), { employee_id: d.employee_id, type: "Late", date: d.date }, cur.id, db);
      await db.from("report_deficiencies").update({ type: "Late", report_id: d.report_id ?? null, title }).eq("id", cur.id);
      if (cur.performance_id) await db.from("staff_performance").update({ weight: "Minor", description }).eq("id", cur.performance_id);
      return `deficiency #${cur.id}: Missing → Late`;
    }
    return `deficiency #${cur.id} already recorded`;
  }
  const perfT = getTable("staff_performance");
  const perf: Record<string, unknown> = { employee_id: d.employee_id, date: d.date, type: "Negative", aspect: "Punctuality", weight: d.type === "Missing" ? "Normal" : "Minor", description, project_id: d.project_id, visit_id: d.visit_id };
  perf.title = await buildTitle(perfT, perf, null, db);
  const { data: p, error: pe } = await db.from("staff_performance").insert(perf).select("id").single();
  if (pe) throw new Error(`performance report: ${pe.message}`);
  const defT = getTable("report_deficiencies");
  const row: Record<string, unknown> = { employee_id: d.employee_id, date: d.date, project_id: d.project_id, visit_id: d.visit_id, type: d.type, status: "Open", report_id: d.report_id ?? null, performance_id: (p as { id: number }).id };
  row.title = await buildTitle(defT, row, null, db);
  const { data: r, error } = await db.from("report_deficiencies").insert(row).select("id").single();
  if (error) throw new Error(`deficiency: ${error.message}`);
  return `${d.type} deficiency #${(r as { id: number }).id} for employee #${d.employee_id}`;
}

async function dayInputs(db: SupabaseClient, date: string) {
  const [settings, visits] = await Promise.all([loadFieldDay(db), loadVisits(db, date)]);
  const reports = await loadReports(db, visits, date);
  const employees = await loadPeople(db, [...new Set(visits.flatMap((v) => v.people))]);
  return { mode: settings.report_rule.mode as RuleMode, since: settings.report_rule.since, visits, reports, employees };
}

/** 9 PM: one SMS per missing report (Live), or a log of who would get one (Dry run). */
export async function runReportReminders(date: string): Promise<Record<string, unknown>> {
  if (!hasAdminKey()) return { skipped: "no admin key" };
  const db = adminDb();
  const { mode, since, visits, reports, employees } = await dayInputs(db, date);
  if (mode === "off") return { mode };
  const { reminders, skipped } = planReminders({ visits, reports, employees, since });
  const names = new Map(employees.map((e) => [e.id, e.name]));
  const would = reminders.map((r) => ({ employee_id: r.employee_id, name: names.get(r.employee_id) ?? `#${r.employee_id}`, visit_id: r.visit_id, project: r.project, to: r.to }));
  try {
    if (mode === "dry_run") {
      await log(db, RULE_AUTOMATION_ID, 0, "reminders", "done", { date, dry_run: true, would_sms: would, skipped, actions: [`dry run: ${would.length} SMS would go out, ${skipped.length} skipped`] });
      return { mode, date, would_sms: would.length, skipped: skipped.length };
    }
    const queued: string[] = [];
    for (const r of reminders) queued.push(await queueSms(db, { to: r.to, body: r.body, employee_id: r.employee_id, visit_id: r.visit_id, kind: "report_reminder" }));
    const delivery = queued.length ? await deliverQueuedSms(db) : { sent: 0, failed: 0 };
    await log(db, RULE_AUTOMATION_ID, 0, "reminders", "done", { date, sms: would, skipped, delivery, actions: [`${queued.length} SMS queued (${delivery.sent} sent, ${delivery.failed} failed), ${skipped.length} skipped`] });
    return { mode, date, sms: queued.length, ...delivery, skipped: skipped.length };
  } catch (e) {
    await log(db, RULE_AUTOMATION_ID, 0, "reminders", "error", { date, error: e instanceof Error ? e.message : String(e) });
    throw e;
  }
}

/** After midnight: the day's missing reports become Missing deficiencies (Live) or a log line (Dry run). */
export async function runReportDayClose(date: string): Promise<Record<string, unknown>> {
  if (!hasAdminKey()) return { skipped: "no admin key" };
  const db = adminDb();
  const { mode, since, visits, reports, employees } = await dayInputs(db, date);
  if (mode === "off") return { mode };
  const missing: MissingDeficiency[] = planMissing({ visits, reports, employees, since });
  const names = new Map(employees.map((e) => [e.id, e.name]));
  const would = missing.map((m) => ({ ...m, name: names.get(m.employee_id) ?? `#${m.employee_id}` }));
  try {
    if (mode === "dry_run") {
      await log(db, RULE_AUTOMATION_ID, 0, "close", "done", { date, dry_run: true, would_missing: would, actions: [`dry run: ${would.length} Missing deficiencies would be recorded`] });
      return { mode, date, would_missing: would.length };
    }
    const did: string[] = [];
    for (const m of missing) did.push(await recordDeficiency(db, { ...m, type: "Missing" }));
    await log(db, RULE_AUTOMATION_ID, 0, "close", "done", { date, missing: would, actions: did.length ? did : ["nothing missing"] });
    return { mode, date, missing: did.length };
  } catch (e) {
    await log(db, RULE_AUTOMATION_ID, 0, "close", "error", { date, error: e instanceof Error ? e.message : String(e) });
    throw e;
  }
}

/** A Job Report was added: Late deficiencies for the visits it is late for (automation 900602, action report_rule). */
export async function lateCheckForReport(db: SupabaseClient, reportId: number): Promise<string[]> {
  const settings = await loadFieldDay(db);
  const mode = settings.report_rule.mode as RuleMode;
  if (mode === "off") return [];
  const { data } = await db.from("job_reports").select(`id, visit_id, project_id, date, created_at, team:${REPORT_TEAM}(target_id)`).eq("id", reportId).maybeSingle();
  const r = data as unknown as ReportRow | null;
  if (!r) return [];
  const report: RuleReport = { id: r.id, visit_id: r.visit_id, project_id: r.project_id, date: r.date, created_at: r.created_at, team: r.team.map((t) => t.target_id) };
  let q = db.from("visits").select(VISIT_COLS).is("deleted_at", null);
  if (report.visit_id) q = q.eq("id", report.visit_id);
  else if (report.project_id && report.date) q = q.eq("project_id", report.project_id).gte("starts_at", fromDateTimeLocalET(`${report.date}T00:00`)).lt("starts_at", fromDateTimeLocalET(`${addDays(report.date, 1)}T00:00`));
  else return [];
  const { data: vs } = await q;
  const visits = ((vs ?? []) as unknown as VisitRow[]).map(toRuleVisit);
  const late: LateFinding[] = planLate(report, visits, settings.report_rule.since);
  if (!late.length) return [];
  // Only active people (the rule ignores those who left).
  const people = await loadPeople(db, late.map((l) => l.employee_id));
  const active = new Set(people.filter((p) => p.active).map((p) => p.id));
  const findings = late.filter((l) => active.has(l.employee_id));
  if (!findings.length) return [];
  if (mode === "dry_run") {
    await log(db, LATE_AUTOMATION_ID, reportId, "late", "done", { dry_run: true, would_late: findings, actions: [`dry run: ${findings.length} Late deficienc${findings.length === 1 ? "y" : "ies"} would be recorded`] });
    return [];
  }
  const did: string[] = [];
  for (const f of findings) did.push(await recordDeficiency(db, { ...f, type: "Late", report_id: reportId }));
  return did;
}

export type SkippedPhone = Skipped;
