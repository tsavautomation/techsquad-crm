import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { ClockTabs } from "@/components/time-clock/clock-tabs";
import { OvertimeQueue, type OvertimePersonView, type OvertimeRowView } from "@/components/time-clock/overtime-queue";
import { requireUser } from "@/lib/auth/session";
import { formatDate, formatDateTime, fromDateTimeLocalET, nowMs, toDateTimeLocalET, todayET } from "@/lib/dates";
import { projectLabel } from "@/lib/projects/label";
import { recordsDb } from "@/lib/records/data";
import { addDays, clock } from "@/lib/schedule/dates";
import { canApproveTimesheets } from "@/lib/time-clock/approval-status";
import { overtimeSettings } from "@/lib/time-clock/overtime-flow";
import { OPEN_STATUSES, type OvertimeDay } from "@/lib/time-clock/overtime-rules";
import { personDays } from "@/lib/time-clock/person-sheet";
import { formatHours, type SheetEntry } from "@/lib/time-clock/timesheet";
import { getT } from "@/i18n/server";

export async function generateMetadata() {
  return { title: (await getT())("Overtime") };
}

// OT-b "Overtime of the week" (Fred 2026-11-17): the Field's overtime days waiting for a decision, by person and
// day (job, times, excess, the technician's justification), and what was decided in a review week (Thursday to
// Wednesday). The approver gets one notice on Thursday morning with everything up to Wednesday; the days are here
// all week for whoever wants to decide earlier. Jessica and Fred are told on Friday about what is still undecided.

const COLS = "id, employee_id, day, worked_minutes, excess_minutes, status, justification, justified_at, justify_due_at, decided_by, decided_at, decision_comment, auto_refused";
const DAY = /^\d{4}-\d{2}-\d{2}$/;
/** The Thursday on or before `date` (review weeks run Thursday to Wednesday). */
const thursdayOf = (date: string) => addDays(date, -((new Date(`${date}T12:00:00Z`).getUTCDay() + 3) % 7));
type EntryRow = SheetEntry & { employee_id: number; visit_id: number | null; visits: { projects: { id: number; title: string | null } | null } | null };

export default async function OvertimePage(props: PageProps<"/time-clock/overtime">) {
  const tr = await getT();
  const user = await requireUser();
  if (!user.permissions.has("administrative.employees.view_all")) notFound();
  const canDecide = canApproveTimesheets(user);
  const sp = (await props.searchParams) as { week?: string };
  const today = todayET();
  const thursday = thursdayOf(sp.week && DAY.test(sp.week) ? sp.week : today);
  const wednesday = addDays(thursday, 6);
  const db = await recordsDb();

  const [{ data: openRows }, { data: decidedRows }, settings] = await Promise.all([
    db.from("overtime_days").select(COLS).in("status", OPEN_STATUSES).order("day"),
    db.from("overtime_days").select(COLS).in("status", ["approved", "refused"]).gte("day", thursday).lte("day", wednesday).order("day"),
    overtimeSettings(db),
  ]);
  const open = (openRows ?? []) as OvertimeDay[];
  const decided = (decidedRows ?? []) as OvertimeDay[];
  const rows = [...open, ...decided];
  const ids = [...new Set(rows.map((r) => r.employee_id))];
  const from = rows.reduce((a, r) => (r.day < a ? r.day : a), today);
  const to = rows.reduce((a, r) => (r.day > a ? r.day : a), from);

  const entries: EntryRow[] = [];
  if (ids.length) {
    for (let page = 0; ; page += 1000) {
      const { data } = await db
        .from("time_entries")
        .select("id, employee_id, kind, at, note, reviewed_at, auto_closed, needs_adjustment, project_id, visit_id, visits:visit_id(projects(id, title))")
        .in("employee_id", ids)
        .gte("at", fromDateTimeLocalET(`${from}T00:00`))
        .lt("at", fromDateTimeLocalET(`${addDays(to, 1)}T06:00`))
        .is("deleted_at", null)
        .order("at")
        .order("id")
        .range(page, page + 999);
      entries.push(...((data ?? []) as unknown as EntryRow[]));
      if ((data ?? []).length < 1000) break;
    }
  }
  const deciders = [...new Set(decided.map((r) => r.decided_by).filter((x): x is string => Boolean(x)))];
  const projectIds = [...new Set(entries.map((e) => e.project_id).filter((x): x is number => typeof x === "number"))];
  const [{ data: names }, { data: profiles }, { data: projects }] = await Promise.all([
    ids.length ? db.from("employee_names").select("id, title").in("id", ids) : Promise.resolve({ data: [] }),
    deciders.length ? db.from("profiles").select("id, first_name, last_name").in("id", deciders) : Promise.resolve({ data: [] }),
    projectIds.length ? db.from("projects").select("id, title").in("id", projectIds) : Promise.resolve({ data: [] }),
  ]);
  const nameOf = new Map(((names ?? []) as { id: number; title: string | null }[]).map((n) => [n.id, n.title ?? `#${n.id}`]));
  const whoOf = new Map(((profiles ?? []) as { id: string; first_name: string | null; last_name: string | null }[]).map((p) => [p.id, [p.first_name, p.last_name].filter(Boolean).join(" ")]));
  const projectOf = new Map(((projects ?? []) as { id: number; title: string | null }[]).map((p) => [p.id, projectLabel(p.title, p.id)]));
  const byPerson = Map.groupBy(entries, (e) => e.employee_id);
  const now = nowMs();
  const time = (iso: string) => clock(toDateTimeLocalET(iso).slice(11));
  const dow = (date: string) => new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", weekday: "short" }).format(new Date(`${date}T12:00:00Z`));

  const view = (r: OvertimeDay): OvertimeRowView => {
    const mine = byPerson.get(r.employee_id) ?? [];
    const day = personDays(mine, r.day, r.day, [], now, today)[0];
    const jobs = new Set<string>();
    for (const s of day?.shifts ?? []) if (s.projectId !== null) jobs.add(projectOf.get(s.projectId) ?? `#${s.projectId}`);
    for (const e of mine) if (e.visits?.projects && toDateTimeLocalET(e.at).slice(0, 10) === r.day) jobs.add(projectLabel(e.visits.projects.title, e.visits.projects.id));
    const who = r.decided_by ? whoOf.get(r.decided_by) : null;
    return {
      id: r.id,
      day: r.day,
      dayLabel: `${tr(dow(r.day))} ${formatDate(r.day).replace(/\/\d{4}$/, "")}`,
      href: `/time-clock/people/${r.employee_id}?day=${r.day}#d-${r.day}`,
      job: [...jobs].join(" · "),
      times: (day?.shifts ?? []).map((s) => `${time(s.inAt)} – ${s.outAt ? time(s.outAt) : "?"}`).join(" · "),
      worked: formatHours(r.worked_minutes),
      excess: formatHours(r.excess_minutes),
      status: r.status,
      justification: r.justification,
      due: r.status === "awaiting_justification" && r.justify_due_at ? tr("refused by itself on {when}", { when: formatDateTime(r.justify_due_at) }) : null,
      decision: r.decided_at ? (r.auto_refused ? tr("Refused automatically on {when}", { when: formatDateTime(r.decided_at) }) : tr("{status} by {who} on {when}", { status: r.status === "approved" ? tr("Approved") : tr("Refused"), who: who || tr("Someone"), when: formatDateTime(r.decided_at) })) : null,
      comment: r.auto_refused ? null : r.decision_comment,
    };
  };
  const group = (list: OvertimeDay[]): OvertimePersonView[] =>
    [...Map.groupBy(list, (r) => r.employee_id)]
      .map(([employeeId, mine]) => ({ employeeId, name: nameOf.get(employeeId) ?? `#${employeeId}`, rows: mine.map(view) }))
      .sort((a, b) => a.name.localeCompare(b.name));
  const href = (w: string) => `/time-clock/overtime?week=${w}`;

  return (
    <div className="mx-auto max-w-[1100px]">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[21px] font-semibold tracking-tight md:text-2xl">{tr("Time clock")}</h1>
          <p className="text-xs text-muted-foreground">{tr("Overtime of the {groups}: past the daily limit and its tolerance, the whole excess waits here for the technician's justification and the approver's decision. Refused hours are not paid.", { groups: settings.groups.map((g) => tr(g)).join(" / ") })}</p>
        </div>
        <ClockTabs current="overtime" />
      </div>

      <h2 className="mb-2 text-[15px] font-semibold tracking-tight">{tr("To decide ({n})", { n: open.length })}</h2>
      <p className="mb-3 text-xs text-text-2">{tr("One notice goes to the approver every Thursday morning with everything up to Wednesday. A day with no justification after {h} hours is refused by itself. Changing a decided day's hours sends it back here.", { h: settings.justifyHours })}</p>
      <OvertimeQueue people={group(open)} canDecide={canDecide} />

      <div className="mt-6 mb-2 flex flex-wrap items-center gap-2">
        <h2 className="text-[15px] font-semibold tracking-tight">{tr("Decided")}</h2>
        <nav className="flex items-center gap-1 rounded-[10px] border bg-card p-0.5 text-[13px]" aria-label={tr("Week")}>
          <Link href={href(addDays(thursday, -7))} className="inline-flex size-10 items-center justify-center rounded-lg hover:bg-muted" aria-label={tr("Previous week")}>
            <ChevronLeft className="size-4" aria-hidden />
          </Link>
          <span className="px-2 font-semibold tabular-nums">
            {formatDate(thursday)} – {formatDate(wednesday)}
          </span>
          <Link href={href(addDays(thursday, 7))} className="inline-flex size-10 items-center justify-center rounded-lg hover:bg-muted" aria-label={tr("Next week")}>
            <ChevronRight className="size-4" aria-hidden />
          </Link>
        </nav>
      </div>
      <OvertimeQueue people={group(decided)} canDecide={canDecide} decided />
    </div>
  );
}
