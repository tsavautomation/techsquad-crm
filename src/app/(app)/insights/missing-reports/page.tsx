import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/session";
import { isOfficeUser } from "@/lib/auth/office";
import { formatDate, todayET } from "@/lib/dates";
import { dayStatuses, type DayStatusRow } from "@/lib/reports/rule-run";
import { addDays } from "@/lib/schedule/dates";
import { getTable } from "@/registry";
import { recordHref } from "@/registry/routes";
import { cn } from "@/lib/utils";
import { getT } from "@/i18n/server";

// F22-b (Fred 2026-10-07): the office's dashboard of the reports not sent for a day (yesterday by
// default), per technician, as the Visit = Report rule sees them.

export async function generateMetadata() {
  return { title: (await getT())("Missing reports") };
}

const TONE: Record<DayStatusRow["status"], string> = { missing: "bg-bad-bg text-bad-fg", late: "bg-warn-bg text-warn-fg", on_time: "bg-ok-bg text-ok-fg" };
const TEXT: Record<DayStatusRow["status"], string> = { missing: "Missing", late: "Late", on_time: "On time" };

export default async function MissingReportsPage(props: PageProps<"/insights/missing-reports">) {
  const user = await requireUser();
  if (!isOfficeUser(user)) notFound();
  const tr = await getT();
  const sp = (await props.searchParams) as { date?: string };
  const yesterday = addDays(todayET(), -1);
  const date = /^\d{4}-\d{2}-\d{2}$/.test(sp.date ?? "") ? sp.date! : yesterday;
  const rows = await dayStatuses(date);
  const missing = rows.filter((r) => r.status === "missing");
  const byPerson = Map.groupBy(rows, (r) => r.employee);
  const visitsT = getTable("visits");
  const reportsT = getTable("job_reports");
  const employeesT = getTable("employees");
  const nav = (d: string) => `/insights/missing-reports?date=${d}`;

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-[21px] font-semibold tracking-tight md:text-2xl">{tr("Missing reports")}</h1>
      <p className="mb-4 text-xs text-muted-foreground">{tr("Every visit that was attended owes one Job Report from each person who went. Reports filed after the day of the visit count as late.")}</p>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Link href={nav(addDays(date, -1))} className="inline-flex h-10 items-center rounded-lg border px-3 text-sm hover:bg-muted">
          ← {formatDate(addDays(date, -1))}
        </Link>
        <span className="text-sm font-semibold">
          {formatDate(date)}
          {date === yesterday ? ` (${tr("yesterday")})` : date === todayET() ? ` (${tr("today")})` : ""}
        </span>
        {date < todayET() && (
          <Link href={nav(addDays(date, 1))} className="inline-flex h-10 items-center rounded-lg border px-3 text-sm hover:bg-muted">
            {formatDate(addDays(date, 1))} →
          </Link>
        )}
        <span className={cn("ml-auto rounded-full px-3 py-1 text-sm font-semibold", missing.length ? "bg-bad-bg text-bad-fg" : "bg-ok-bg text-ok-fg")}>
          {missing.length === 1 ? tr("1 report missing") : tr("{n} reports missing", { n: missing.length })}
        </span>
      </div>

      {rows.length === 0 ? (
        <p className="rounded-2xl border bg-card px-[18px] py-4 text-sm text-muted-foreground shadow-card">{tr("No attended visits on this day.")}</p>
      ) : (
        <div className="flex flex-col gap-3">
          {[...byPerson.entries()]
            .sort((a, b) => b[1].filter((r) => r.status === "missing").length - a[1].filter((r) => r.status === "missing").length || a[0].localeCompare(b[0]))
            .map(([person, list]) => {
              const owed = list.filter((r) => r.status === "missing").length;
              return (
                <section key={person} className={cn("rounded-2xl border bg-card px-[18px] py-3 shadow-card", owed && "border-bad-fg/30")}>
                  <h2 className="mb-1 flex items-center justify-between text-[15px] font-semibold tracking-tight">
                    <Link href={recordHref(employeesT, list[0].employee_id)} className="hover:underline">
                      {person}
                    </Link>
                    <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", owed ? "bg-bad-bg text-bad-fg" : "bg-ok-bg text-ok-fg")}>{owed ? tr("{n} owed", { n: owed }) : tr("all sent")}</span>
                  </h2>
                  <ul className="divide-y text-sm">
                    {list.map((r) => (
                      <li key={`${r.visit_id}:${r.employee_id}`} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-0.5 py-1.5">
                        <Link href={recordHref(visitsT, r.visit_id)} className="min-w-0 flex-1 truncate hover:underline">
                          {r.project}
                        </Link>
                        <span className="flex items-center gap-2 text-xs">
                          {r.report_id && (
                            <Link href={recordHref(reportsT, r.report_id)} className="text-text-2 underline underline-offset-2">
                              {tr("Report")}
                              {r.filed_on ? ` · ${formatDate(r.filed_on)}` : ""}
                            </Link>
                          )}
                          <span className={cn("rounded-full px-2 py-0.5 font-medium", TONE[r.status])}>{tr(TEXT[r.status])}</span>
                        </span>
                      </li>
                    ))}
                  </ul>
                </section>
              );
            })}
        </div>
      )}
    </div>
  );
}
