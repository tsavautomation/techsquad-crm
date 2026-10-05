import Link from "next/link";
import type { CurrentUser } from "@/lib/auth/session";
import { formatDate, todayET } from "@/lib/dates";
import { myEmployeeIds } from "@/lib/field-day/load";
import { recordsDb } from "@/lib/records/data";
import { addDays } from "@/lib/schedule/dates";
import { getTable } from "@/registry";
import { recordHref } from "@/registry/routes";
import { getT } from "@/i18n/server";

// F18-b: the employee's report deficiencies (last 90 days) on their page, for the people who may see
// the list. As with performance (P2-d), nobody but an administrator sees their own.

type Row = { id: number; date: string; type: string; status: string; project_id: number | null; projects: { title: string | null } | null };

export async function EmployeeDeficiencies({ employeeId, user }: { employeeId: number; user: CurrentUser }) {
  if (!user.isSysadmin && !user.permissions.has("administrative.report-deficiencies.view_all")) return null;
  const db = await recordsDb();
  if (!user.isSysadmin && (await myEmployeeIds(db, user)).includes(employeeId)) return null;
  const tr = await getT();
  const since = addDays(todayET(), -90);
  const { data } = await db.from("report_deficiencies").select("id, date, type, status, project_id, projects(title)").eq("employee_id", employeeId).gte("date", since).is("deleted_at", null).order("date", { ascending: false }).limit(50);
  const rows = (data ?? []) as unknown as Row[];
  // F19-b: reports of this person with report-vs-reality mismatches in the same window.
  const { data: team } = await db.from("job_reports_team").select("record_id").eq("target_id", employeeId);
  const reportIds = ((team ?? []) as { record_id: number }[]).map((t) => t.record_id);
  const { data: flagged } = reportIds.length ? await db.from("job_reports").select("id, reality_flags").in("id", reportIds).gte("date", since).is("deleted_at", null).not("reality_flags", "is", null) : { data: [] };
  const mismatches = ((flagged ?? []) as { reality_flags: { level: string }[] | null }[]).filter((r) => (r.reality_flags ?? []).some((f) => f.level === "warn")).length;
  const open = rows.filter((r) => r.status === "Open");
  const late = open.filter((r) => r.type === "Late").length;
  const missing = open.filter((r) => r.type === "Missing").length;
  const t = getTable("report_deficiencies");
  return (
    <section id="deficiencies" className="mb-3.5 scroll-mt-20 rounded-2xl border bg-card px-[18px] py-4 shadow-card">
      <h2 className="mb-1 text-[15px] font-semibold tracking-tight">{tr("Report deficiencies")}</h2>
      <p className="mb-2 text-[13px] text-text-2">
        {tr("Last 90 days: {late} late, {missing} missing, {excused} excused.", { late, missing, excused: rows.length - open.length })}
        {mismatches > 0 ? ` ${tr(mismatches === 1 ? "1 report with a report vs. reality mismatch." : "{n} reports with report vs. reality mismatches.", { n: mismatches })}` : ""}{" "}
        <Link href={`/administrative/report-deficiencies?employee_id=${employeeId}`} className="underline underline-offset-2">
          {tr("All")}
        </Link>
      </p>
      {open.length ? (
        <ul className="divide-y text-sm">
          {open.slice(0, 8).map((r) => (
            <li key={r.id} className="flex items-baseline justify-between gap-3 py-1.5">
              <Link href={recordHref(t, r.id)} className="min-w-0 truncate hover:underline">
                {r.projects?.title ?? (r.project_id ? `Project #${r.project_id}` : tr("No project"))}
              </Link>
              <span className={`shrink-0 text-xs ${r.type === "Missing" ? "text-bad-fg" : "text-warn-fg"}`}>
                {tr(r.type)} · {formatDate(r.date)}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">{tr("No open deficiency.")}</p>
      )}
    </section>
  );
}
