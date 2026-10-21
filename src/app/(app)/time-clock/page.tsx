import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, ChevronRight, MapPin } from "lucide-react";
import { AlertTriangle } from "lucide-react";
import { ClockTabs } from "@/components/time-clock/clock-tabs";
import { EntryTools } from "@/components/time-clock/entry-tools";
import { ReviewButton } from "@/components/time-clock/review-button";
import { requireUser } from "@/lib/auth/session";
import { formatDate, fromDateTimeLocalET, nowMs, toDateTimeLocalET, todayET } from "@/lib/dates";
import { formatMinutes } from "@/lib/field-day/day";
import { recordsDb } from "@/lib/records/data";
import { addDays, clock } from "@/lib/schedule/dates";
import { clockDay, formatDistance, type EntryKind, type Place, type TimeEntry } from "@/lib/time-clock/clock";
import { FLAG_TEXT, mondayOf, shiftsOf } from "@/lib/time-clock/timesheet";
import { getTable } from "@/registry";
import { recordHref } from "@/registry/routes";
import { cn } from "@/lib/utils";
import { getT } from "@/i18n/server";

export async function generateMetadata() {
  return { title: (await getT())("Time clock") };
}

// P2: the office's view of the time clock, one day at a time, per person; corrections for employee editors.

const KIND_LABEL: Record<EntryKind, string> = { clock_in: "Clocked in", clock_out: "Clocked out", on_way: "On my way", visit_in: "Arrived at the job", visit_out: "Left the job" };
const PLACE_TONE: Record<Place, string> = { Office: "text-info-fg", "On site": "text-ok-fg", Elsewhere: "text-warn-fg", Unknown: "text-muted-foreground" };

type Row = TimeEntry & { employee_id: number; note: string | null; reviewed_at: string | null; auto_closed: boolean; corrected_at: string | null; original_at: string | null; employees: { title: string | null } | null; visits: { projects: { title: string | null } | null } | null };

export default async function TimeClockPage(props: PageProps<"/time-clock">) {
  const tr = await getT();
  const user = await requireUser();
  if (!user.permissions.has("administrative.employees.view_all")) notFound();
  const canFix = user.permissions.has("administrative.employees.modify");
  const { day: dayParam, employee: employeeParam } = (await props.searchParams) as { day?: string; employee?: string };
  const day = dayParam && /^\d{4}-\d{2}-\d{2}$/.test(dayParam) ? dayParam : todayET();
  // TC-a: a day cell on the timesheet opens this page for one person; "Everyone" widens it again.
  const onlyEmployee = employeeParam && /^\d+$/.test(employeeParam) ? Number(employeeParam) : null;
  const db = await recordsDb();
  let q = db
    .from("time_entries")
    .select("id, employee_id, kind, at, visit_id, place, distance_m, lat, lng, note, reviewed_at, auto_closed, corrected_at, original_at, employees:employee_id(title), visits:visit_id(projects(title))")
    .gte("at", fromDateTimeLocalET(`${day}T00:00`))
    .lt("at", fromDateTimeLocalET(`${addDays(day, 1)}T00:00`))
    .is("deleted_at", null);
  if (onlyEmployee !== null) q = q.eq("employee_id", onlyEmployee);
  const { data } = await q.order("at");
  const rows = (data ?? []) as unknown as Row[];
  const byPerson = Map.groupBy(rows, (r) => r.employee_id);
  const employeesT = getTable("employees");
  const now = nowMs();
  const today = todayET();
  const time = (iso: string) => clock(toDateTimeLocalET(iso).slice(11));
  const dayHref = (d: string) => `/time-clock?day=${d}${onlyEmployee !== null ? `&employee=${onlyEmployee}` : ""}`;
  const onlyName = onlyEmployee !== null ? (rows[0]?.employees?.title ?? `#${onlyEmployee}`) : null;

  return (
    <div className="mx-auto max-w-[1300px]">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[21px] font-semibold tracking-tight md:text-2xl">{tr("Time clock")}</h1>
          <p className="text-xs text-muted-foreground">{tr("Clock-ins, clock-outs and job arrivals with where the phone was. Corrections are signed and keep the original time.")}</p>
        </div>
        <ClockTabs current="day" />
      </div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <nav className="flex items-center gap-1 rounded-[10px] border bg-card p-0.5 text-[13px]" aria-label={tr("Day")}>
          <Link href={dayHref(addDays(day, -1))} className="inline-flex size-10 items-center justify-center rounded-lg hover:bg-muted" aria-label={tr("Previous day")}>
            <ChevronLeft className="size-4" aria-hidden />
          </Link>
          <span className="px-2 font-semibold tabular-nums">{formatDate(day)}</span>
          <Link href={dayHref(addDays(day, 1))} className="inline-flex size-10 items-center justify-center rounded-lg hover:bg-muted" aria-label={tr("Next day")}>
            <ChevronRight className="size-4" aria-hidden />
          </Link>
          {day !== today && (
            <Link href={dayHref(today)} className="px-2 text-primary hover:underline">
              {tr("Today")}
            </Link>
          )}
        </nav>
        {onlyEmployee !== null && (
          <span className="flex items-center gap-2 rounded-[10px] border bg-card px-3 py-2 text-[13px]">
            {tr("Only {name}", { name: onlyName ?? "" })}
            <Link href={`/time-clock?day=${day}`} className="text-primary hover:underline">
              {tr("Everyone")}
            </Link>
          </span>
        )}
        <Link href={`/time-clock/timesheets?week=${mondayOf(day)}`} className="text-[13px] text-primary hover:underline">
          {tr("This week's timesheet")}
        </Link>
      </div>

      {byPerson.size === 0 ? (
        <p className="rounded-2xl border border-dashed bg-card px-6 py-10 text-center text-text-2">{tr("No clock entries on this day.")}</p>
      ) : (
        <div className="grid gap-3.5">
          {[...byPerson.entries()].map(([employeeId, entries]) => {
            const sum = clockDay(entries, now);
            // TC-b: the shifts of this day that want a look (the flags live on the shift, the mark on its clock-in).
            const flagged = shiftsOf(entries, now, today).filter((s) => s.flags.length > 0);
            return (
              <section key={employeeId} className="rounded-2xl border bg-card px-[18px] py-4 shadow-card">
                <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
                  <Link href={recordHref(employeesT, employeeId)} className="text-[15px] font-semibold tracking-tight hover:underline">
                    {entries[0].employees?.title ?? `#${employeeId}`}
                  </Link>
                  <span className="text-xs text-text-2">
                    {sum.openSince ? tr("Still clocked in · {clocked}", { clocked: formatMinutes(sum.clockedMin) }) : tr("Clocked {clocked}", { clocked: formatMinutes(sum.clockedMin) })}
                    {sum.onSiteMin > 0 && ` · ${tr("on site {time}", { time: formatMinutes(sum.onSiteMin) })}`}
                  </span>
                </div>
                {flagged.length > 0 && (
                  <ul className="mb-2 grid gap-1">
                    {flagged.map((s) => (
                      <li key={s.inId} className={cn("flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg px-2.5 py-1.5 text-[13px]", s.needsReview ? "bg-warn-bg text-warn-fg" : "bg-muted text-text-2")}>
                        <AlertTriangle className="size-4 shrink-0" aria-hidden />
                        <span className="min-w-0 flex-1">
                          <span className="tabular-nums">
                            {time(s.inAt)}
                            {s.outAt ? ` – ${time(s.outAt)}` : ""}
                          </span>
                          {" · "}
                          {s.flags.map((f) => tr(FLAG_TEXT[f])).join(" · ")}
                          {` · ${s.needsReview ? tr("Needs review") : tr("Reviewed")}`}
                        </span>
                        {canFix && <ReviewButton entryId={s.inId} reviewed={!s.needsReview} />}
                      </li>
                    ))}
                  </ul>
                )}
                <ol className="divide-y text-[13px]">
                  {entries.map((e) => (
                    // Time | what happened (place under it) | tools. The place sits under the text so a long project
                    // name never gets squeezed into one word per line on a phone with large text (Fred 2026-10-11).
                    <li key={e.id} className="flex items-start gap-x-3 py-2">
                      <span className="w-[64px] shrink-0 pt-px font-medium tabular-nums">{time(e.at)}</span>
                      <div className="min-w-0 flex-1">
                        <p>
                          {tr(KIND_LABEL[e.kind])}
                          {e.visits?.projects?.title && <span className="text-text-2"> · {e.visits.projects.title}</span>}
                          {e.auto_closed && <span className="ml-1 rounded bg-warn-bg px-1.5 text-[11px] text-warn-fg">{tr("by the system")}</span>}
                          {e.corrected_at && e.original_at && <span className="ml-1 rounded bg-muted px-1.5 text-[11px] text-muted-foreground">{tr("corrected from {time}", { time: time(e.original_at) })}</span>}
                        </p>
                        <span className={cn("mt-0.5 flex items-center gap-1 text-xs", PLACE_TONE[e.place])}>
                          <MapPin className="size-3.5 shrink-0" aria-hidden />
                          {e.lat !== null && e.lng !== null ? (
                            <a href={`https://www.google.com/maps/search/?api=1&query=${e.lat},${e.lng}`} target="_blank" rel="noopener noreferrer" className="hover:underline">
                              {tr(e.place)}
                              {e.place !== "Office" && e.place !== "On site" && e.distance_m !== null && ` · ${formatDistance(e.distance_m)}`}
                            </a>
                          ) : (
                            tr("no location")
                          )}
                        </span>
                      </div>
                      {canFix && <EntryTools id={e.id} time={toDateTimeLocalET(e.at).slice(11, 16)} />}
                    </li>
                  ))}
                </ol>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
