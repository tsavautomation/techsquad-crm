import { toDateTimeLocalET } from "@/lib/dates";
import { toE164 } from "@/lib/sms/phone";

// F18 Visit = Report rule (SPEC §9.1 F18-a): the pure engine. Every visit that was attended
// (someone checked in or out, or it was marked Done) owes one Job Report from each person going.
// A report counts for a person when it is linked to the visit, or to the same project on the same
// day, and the person is on its Team. No database here: tested in tests/f18-report-rule.test.ts.

export type RuleVisit = {
  id: number;
  project_id: number | null;
  project: string;
  /** The visit's Eastern date, YYYY-MM-DD. */
  date: string;
  /** Technician + Also going. */
  people: number[];
  cancelled: boolean;
  /** Checked in or out, or status Done (Fred 2026-10-05: "no check-in or check-out means he was never there"). */
  attended: boolean;
};

export type RuleReport = {
  id: number;
  visit_id: number | null;
  project_id: number | null;
  /** The report's Date field. */
  date: string | null;
  team: number[];
  created_at: string;
};

export type RuleEmployee = { id: number; name: string; active: boolean; phone: string | null };

export type ReportStatus = "on_time" | "late" | "missing";
export type PersonStatus = { employee_id: number; status: ReportStatus; report_id: number | null; filed_on: string | null };

export type RuleMode = "off" | "dry_run" | "live";

/** The Eastern date a report was filed on. */
export const filedOn = (createdAt: string) => toDateTimeLocalET(createdAt).slice(0, 10);

/** Does this visit fall under the rule? Not cancelled, attended, and on or after the start date. */
export function visitCounts(v: RuleVisit, since: string | null): boolean {
  return !v.cancelled && v.attended && (!since || v.date >= since);
}

/**
 * The reports that belong to a visit: linked to it, or on the same project on the same day — linked
 * to another visit or not (F24-c, Fred 2026-10-07: two visits of the same project at the same hour
 * carry the same title, and Fabio's report was linked to the other one).
 */
export function reportsForVisit(v: RuleVisit, reports: RuleReport[]): RuleReport[] {
  return reports.filter((r) => r.visit_id === v.id || (r.project_id !== null && r.project_id === v.project_id && r.date === v.date));
}

/** Status per person going: On time (filed on the visit's day, Eastern), Late (after it), Missing. */
export function statusFor(v: RuleVisit, reports: RuleReport[]): PersonStatus[] {
  const mine = reportsForVisit(v, reports);
  return [...new Set(v.people)].map((employee_id) => {
    const filed = mine.filter((r) => r.team.includes(employee_id)).sort((a, b) => a.created_at.localeCompare(b.created_at));
    const first = filed[0];
    if (!first) return { employee_id, status: "missing", report_id: null, filed_on: null };
    const on = filedOn(first.created_at);
    return { employee_id, status: on <= v.date ? "on_time" : "late", report_id: first.id, filed_on: on };
  });
}

/** The 9 PM text (Fred 2026-10-05, Portuguese for the whole crew). */
export const smsBody = (project: string) => `Tech Squad Reports - Seu report do trabalho "${project}" não foi recebido hoje.`;

export type PlanInput = {
  visits: RuleVisit[];
  reports: RuleReport[];
  employees: RuleEmployee[];
  since: string | null;
};

export type Reminder = { employee_id: number; visit_id: number; project_id: number | null; project: string; to: string; body: string };
export type Skipped = { employee_id: number; name: string; visit_id: number; project: string; reason: "inactive" | "no_phone" | "bad_phone" | "unknown_employee"; phone: string | null };

/** The 9 PM job: one SMS per missing report, to active people with a usable phone; the rest is listed for the admin. */
export function planReminders(input: PlanInput): { reminders: Reminder[]; skipped: Skipped[] } {
  const byId = new Map(input.employees.map((e) => [e.id, e]));
  const reminders: Reminder[] = [];
  const skipped: Skipped[] = [];
  for (const v of input.visits) {
    if (!visitCounts(v, input.since)) continue;
    for (const s of statusFor(v, input.reports)) {
      if (s.status !== "missing") continue;
      const e = byId.get(s.employee_id);
      const base = { employee_id: s.employee_id, visit_id: v.id, project: v.project };
      if (!e) {
        skipped.push({ ...base, name: `#${s.employee_id}`, reason: "unknown_employee", phone: null });
        continue;
      }
      if (!e.active) {
        skipped.push({ ...base, name: e.name, reason: "inactive", phone: e.phone });
        continue;
      }
      if (!e.phone?.trim()) {
        skipped.push({ ...base, name: e.name, reason: "no_phone", phone: null });
        continue;
      }
      const to = toE164(e.phone);
      if (!to) {
        skipped.push({ ...base, name: e.name, reason: "bad_phone", phone: e.phone });
        continue;
      }
      reminders.push({ ...base, project_id: v.project_id, to, body: smsBody(v.project) });
    }
  }
  return { reminders, skipped };
}

export type MissingDeficiency = { employee_id: number; visit_id: number; project_id: number | null; project: string; date: string };

/** After midnight: the reports still missing for the day become Missing deficiencies (inactive people excluded). */
export function planMissing(input: PlanInput): MissingDeficiency[] {
  const active = new Set(input.employees.filter((e) => e.active).map((e) => e.id));
  const out: MissingDeficiency[] = [];
  for (const v of input.visits) {
    if (!visitCounts(v, input.since)) continue;
    for (const s of statusFor(v, input.reports)) if (s.status === "missing" && active.has(s.employee_id)) out.push({ employee_id: s.employee_id, visit_id: v.id, project_id: v.project_id, project: v.project, date: v.date });
  }
  return out;
}

export type LateFinding = { employee_id: number; visit_id: number; project_id: number | null; project: string; date: string; filed_on: string };

/** When a report arrives: for each of its team members, the visits it is late for (filed after the visit's day). */
export function planLate(report: RuleReport, visits: RuleVisit[], since: string | null): LateFinding[] {
  const on = filedOn(report.created_at);
  const out: LateFinding[] = [];
  for (const v of visits) {
    if (!visitCounts(v, since) || on <= v.date) continue;
    if (!reportsForVisit(v, [report]).length) continue;
    for (const employee_id of report.team) if (v.people.includes(employee_id)) out.push({ employee_id, visit_id: v.id, project_id: v.project_id, project: v.project, date: v.date, filed_on: on });
  }
  return out;
}
