import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, ChevronRight, MapPin } from "lucide-react";
import { EntryTools } from "@/components/time-clock/entry-tools";
import { requireUser } from "@/lib/auth/session";
import { formatDate, fromDateTimeLocalET, nowMs, toDateTimeLocalET, todayET } from "@/lib/dates";
import { formatMinutes } from "@/lib/field-day/day";
import { recordsDb } from "@/lib/records/data";
import { addDays, clock } from "@/lib/schedule/dates";
import { clockDay, formatDistance, type EntryKind, type Place, type TimeEntry } from "@/lib/time-clock/clock";
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

type Row = TimeEntry & { employee_id: number; corrected_at: string | null; original_at: string | null; employees: { title: string | null } | null; visits: { projects: { title: string | null } | null } | null };

export default async function TimeClockPage(props: PageProps<"/time-clock">) {
  const tr = await getT();
  const user = await requireUser();
  if (!user.permissions.has("administrative.employees.view_all")) notFound();
  const canFix = user.permissions.has("administrative.employees.modify");
  const { day: dayParam } = (await props.searchParams) as { day?: string };
  const day = dayParam && /^\d{4}-\d{2}-\d{2}$/.test(dayParam) ? dayParam : todayET();
  const db = await recordsDb();
  const { data } = await db
    .from("time_entries")
    .select("id, employee_id, kind, at, visit_id, place, distance_m, lat, lng, corrected_at, original_at, employees:employee_id(title), visits:visit_id(projects(title))")
    .gte("at", fromDateTimeLocalET(`${day}T00:00`))
    .lt("at", fromDateTimeLocalET(`${addDays(day, 1)}T00:00`))
    .is("deleted_at", null)
    .order("at");
  const rows = (data ?? []) as unknown as Row[];
  const byPerson = Map.groupBy(rows, (r) => r.employee_id);
  const employeesT = getTable("employees");
  const now = nowMs();
  const time = (iso: string) => clock(toDateTimeLocalET(iso).slice(11));

  return (
    <div className="mx-auto max-w-[1300px]">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[21px] font-semibold tracking-tight md:text-2xl">{tr("Time clock")}</h1>
          <p className="text-[12.5px] text-muted-foreground">{tr("Clock-ins, clock-outs and job arrivals with where the phone was. Corrections are signed and keep the original time.")}</p>
        </div>
        <nav className="flex items-center gap-1 rounded-[10px] border bg-card p-0.5 text-[13px]" aria-label={tr("Day")}>
          <Link href={`/time-clock?day=${addDays(day, -1)}`} className="inline-flex size-10 items-center justify-center rounded-lg hover:bg-muted" aria-label={tr("Previous day")}>
            <ChevronLeft className="size-4" aria-hidden />
          </Link>
          <span className="px-2 font-semibold tabular-nums">{formatDate(day)}</span>
          <Link href={`/time-clock?day=${addDays(day, 1)}`} className="inline-flex size-10 items-center justify-center rounded-lg hover:bg-muted" aria-label={tr("Next day")}>
            <ChevronRight className="size-4" aria-hidden />
          </Link>
          {day !== todayET() && (
            <Link href="/time-clock" className="px-2 text-primary hover:underline">
              {tr("Today")}
            </Link>
          )}
        </nav>
      </div>

      {byPerson.size === 0 ? (
        <p className="rounded-2xl border border-dashed bg-card px-6 py-10 text-center text-text-2">{tr("No clock entries on this day.")}</p>
      ) : (
        <div className="grid gap-3.5">
          {[...byPerson.entries()].map(([employeeId, entries]) => {
            const sum = clockDay(entries, now);
            return (
              <section key={employeeId} className="rounded-2xl border bg-card px-[18px] py-4 shadow-card">
                <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
                  <Link href={recordHref(employeesT, employeeId)} className="text-[15px] font-semibold tracking-tight hover:underline">
                    {entries[0].employees?.title ?? `#${employeeId}`}
                  </Link>
                  <span className="text-[12.5px] text-text-2">
                    {sum.openSince ? tr("Still clocked in · {clocked}", { clocked: formatMinutes(sum.clockedMin) }) : tr("Clocked {clocked}", { clocked: formatMinutes(sum.clockedMin) })}
                    {sum.onSiteMin > 0 && ` · ${tr("on site {time}", { time: formatMinutes(sum.onSiteMin) })}`}
                  </span>
                </div>
                <ol className="divide-y text-[13.5px]">
                  {entries.map((e) => (
                    <li key={e.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
                      <span className="w-[76px] shrink-0 font-medium tabular-nums">{time(e.at)}</span>
                      <span className="min-w-0 flex-1">
                        {tr(KIND_LABEL[e.kind])}
                        {e.visits?.projects?.title && <span className="text-text-2"> · {e.visits.projects.title}</span>}
                        {e.corrected_at && e.original_at && <span className="ml-1 rounded bg-muted px-1.5 text-[11px] text-muted-foreground">{tr("corrected from {time}", { time: time(e.original_at) })}</span>}
                      </span>
                      <span className={cn("flex shrink-0 items-center gap-1 text-[12.5px]", PLACE_TONE[e.place])}>
                        <MapPin className="size-3.5" aria-hidden />
                        {e.lat !== null && e.lng !== null ? (
                          <a href={`https://www.google.com/maps/search/?api=1&query=${e.lat},${e.lng}`} target="_blank" rel="noopener noreferrer" className="hover:underline">
                            {tr(e.place)}
                            {e.place !== "Office" && e.place !== "On site" && e.distance_m !== null && ` · ${formatDistance(e.distance_m)}`}
                          </a>
                        ) : (
                          tr("no location")
                        )}
                      </span>
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
