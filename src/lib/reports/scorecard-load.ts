import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { fromDateTimeLocalET, toDateTimeLocalET, todayET } from "@/lib/dates";
import { loadFieldDay } from "@/lib/field-day/return-card";
import { addDays } from "@/lib/schedule/dates";
import { statusFor, visitCounts, type RuleReport, type RuleVisit } from "./rule";
import { inPeriod, periods, scorecard, type Period, type Scorecard, type ScoreReport } from "./scorecard";

// F19-e Tech scorecards: the rows behind one person's (or everyone's) scorecard, read with the
// viewer's client (RLS applies). One visit owed = one row; the Visit = Report rule gives its status.

type VisitRow = { id: number; project_id: number | null; status: string | null; starts_at: string; technician_id: number | null; checked_in_at: string | null; checked_out_at: string | null; visits_team: { target_id: number }[]; projects: { title: string | null } | null };
type ReportRow = { id: number; visit_id: number | null; project_id: number | null; date: string | null; created_at: string; report: string | null; result: string | null; materials_used: string | null; problems: string | null; reality_flags: { level: string }[] | null; team: { target_id: number }[] };

export type PersonScorecards = { employeeId: number; week: Scorecard; month: Scorecard; lastMonth: Scorecard };

/** Rows per person for every attended visit between `from` and `to` (dates), plus the reports that count for them. */
async function load(db: SupabaseClient, from: string, to: string, people: number[] | null) {
  const settings = await loadFieldDay(db);
  const since = settings.report_rule.since;
  const { data: vs } = await db
    .from("visits")
    .select("id, project_id, status, starts_at, technician_id, checked_in_at, checked_out_at, visits_team(target_id), projects(title)")
    .gte("starts_at", fromDateTimeLocalET(`${from}T00:00`))
    .lt("starts_at", fromDateTimeLocalET(`${addDays(to, 1)}T00:00`))
    .is("deleted_at", null)
    .is("archived_at", null)
    .limit(3000);
  const visits: RuleVisit[] = ((vs ?? []) as unknown as VisitRow[])
    .map((v) => ({
      id: v.id,
      project_id: v.project_id,
      project: v.projects?.title ?? "",
      date: toDateTimeLocalET(v.starts_at).slice(0, 10),
      people: [...new Set([v.technician_id, ...v.visits_team.map((t) => t.target_id)].filter((x): x is number => x !== null))],
      cancelled: v.status === "Cancelled",
      attended: Boolean(v.checked_in_at || v.checked_out_at || v.status === "Done"),
    }))
    .filter((v) => visitCounts(v, since) && (!people || v.people.some((p) => people.includes(p))));
  if (!visits.length) return { visits, reports: [] as ReportRow[], photos: new Set<number>() };
  const ids = visits.map((v) => v.id);
  const projects = [...new Set(visits.map((v) => v.project_id).filter((x): x is number => x !== null))];
  const or = [`visit_id.in.(${ids.join(",")})`, projects.length ? `and(project_id.in.(${projects.join(",")}),date.gte.${from},date.lte.${to})` : null].filter(Boolean).join(",");
  const { data: rs } = await db.from("job_reports").select("id, visit_id, project_id, date, created_at, report, result, materials_used, problems, reality_flags, team:job_reports_team(target_id)").or(or).is("deleted_at", null).limit(3000);
  const reports = (rs ?? []) as unknown as ReportRow[];
  const { data: att } = reports.length ? await db.from("attachments").select("record_id").eq("table_name", "job_reports").in("record_id", reports.map((r) => r.id)).like("mime_type", "image/%").is("deleted_at", null) : { data: [] };
  const photos = new Set(((att ?? []) as { record_id: number }[]).map((a) => a.record_id));
  return { visits, reports, photos };
}

function rowsFor(employeeId: number, visits: RuleVisit[], reports: ReportRow[], photos: Set<number>, p: Period): ScoreReport[] {
  const rule: RuleReport[] = reports.map((r) => ({ id: r.id, visit_id: r.visit_id, project_id: r.project_id, date: r.date, created_at: r.created_at, team: r.team.map((t) => t.target_id) }));
  const byId = new Map(reports.map((r) => [r.id, r]));
  const out: ScoreReport[] = [];
  for (const v of visits) {
    if (!v.people.includes(employeeId) || !inPeriod(v.date, p)) continue;
    const s = statusFor(v, rule).find((x) => x.employee_id === employeeId)!;
    const r = s.report_id ? byId.get(s.report_id) : undefined;
    out.push({
      date: v.date,
      status: s.status,
      completeness: r ? { text: (r.report?.trim().length ?? 0) >= 40, result: Boolean(r.result), materials: Boolean(r.materials_used?.trim()), problems: Boolean(r.problems?.trim()), photo: photos.has(r.id) } : null,
      result: r?.result ?? null,
      mismatches: (r?.reality_flags ?? []).filter((f) => f.level === "warn").length,
    });
  }
  return out;
}

async function openPendingFor(db: SupabaseClient, employeeIds: number[]): Promise<Map<number, number>> {
  const out = new Map<number, number>();
  if (!employeeIds.length) return out;
  const { data: team } = await db.from("job_reports_team").select("record_id, target_id").in("target_id", employeeIds);
  const links = (team ?? []) as { record_id: number; target_id: number }[];
  if (!links.length) return out;
  const { data: tasks } = await db.from("tasks").select("job_report_id").in("job_report_id", [...new Set(links.map((l) => l.record_id))]).neq("status", "Completed").is("deleted_at", null);
  const openReports = new Set(((tasks ?? []) as { job_report_id: number }[]).map((t) => t.job_report_id));
  for (const l of links) if (openReports.has(l.record_id)) out.set(l.target_id, (out.get(l.target_id) ?? 0) + 1);
  return out;
}

/** One person: this week, this month, last month. */
export async function loadScorecards(db: SupabaseClient, employeeId: number, today = todayET()): Promise<PersonScorecards> {
  const p = periods(today);
  const from = p.lastMonth.from < p.week.from ? p.lastMonth.from : p.week.from;
  const to = p.month.to > p.week.to ? p.month.to : p.week.to;
  const [{ visits, reports, photos }, pending] = await Promise.all([load(db, from, to, [employeeId]), openPendingFor(db, [employeeId])]);
  const open = pending.get(employeeId) ?? 0;
  const card = (per: Period) => scorecard(rowsFor(employeeId, visits, reports, photos, per), open);
  return { employeeId, week: card(p.week), month: card(p.month), lastMonth: card(p.lastMonth) };
}

/** Everyone with a visit in the period (Insights › Field work). */
export async function loadTeamScorecards(db: SupabaseClient, period: Period): Promise<{ employeeId: number; card: Scorecard }[]> {
  const { visits, reports, photos } = await load(db, period.from, period.to, null);
  const people = [...new Set(visits.flatMap((v) => v.people))];
  const pending = await openPendingFor(db, people);
  return people.map((id) => ({ employeeId: id, card: scorecard(rowsFor(id, visits, reports, photos, period), pending.get(id) ?? 0) })).filter((x) => x.card.visits > 0);
}
