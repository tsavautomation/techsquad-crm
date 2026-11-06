import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle, ChevronLeft, ChevronRight, Lock } from "lucide-react";
import { ClockTabs } from "@/components/time-clock/clock-tabs";
import { ManualEntry } from "@/components/time-clock/manual-entry";
import { PeriodApproval } from "@/components/time-clock/period-approval";
import { DayRow } from "@/components/time-clock/person/day-row";
import type { DayView, EventView, Loc, ShiftView } from "@/components/time-clock/person/types";
import { requireUser } from "@/lib/auth/session";
import { formatDate, nowMs, toDateTimeLocalET, todayET } from "@/lib/dates";
import { recordsDb } from "@/lib/records/data";
import { limitHours, splitDays, tripAt } from "@/lib/payroll/overtime";
import { addDays } from "@/lib/schedule/dates";
import { formatDistance } from "@/lib/time-clock/clock";
import { approvalGroups, canApproveTimesheets, loadPendingCorrections } from "@/lib/time-clock/approval-status";
import { approvalBlockers, approvalStatusOf, needsApproval } from "@/lib/time-clock/period-approval";
import { loadPanel, panelPeople, panelRange, type EntryRow } from "@/lib/time-clock/person-load";
import { personTotals, weekBlocks } from "@/lib/time-clock/person-sheet";
import { formatHours, mondayOf, type Shift } from "@/lib/time-clock/timesheet";
import { getTable } from "@/registry";
import { recordHref } from "@/registry/routes";
import { cn } from "@/lib/utils";
import { getT } from "@/i18n/server";

export async function generateMetadata() {
  return { title: (await getT())("Timesheet") };
}

// TS-b Person panel (Fred 2026-11-04, Part 3 of the Pay periods / Time clock brief, Connecteam style): one
// person's timesheet over their pay-schedule period (PS-a; the week when they are on no schedule), one row
// per day grouped by week with a subtotal, inline edits, the totals at the top and Previous / Next person.
// TS-c (Part 4): the approval of the period by department sits at the top: Approve / Reopen for the Field's approvers.

const DAY = /^\d{4}-\d{2}-\d{2}$/;

export default async function PersonPanelPage(props: PageProps<"/time-clock/people/[id]">) {
  const tr = await getT();
  const user = await requireUser();
  if (!user.permissions.has("administrative.employees.view_all")) notFound();
  const canFix = user.permissions.has("administrative.employees.modify");
  const { id } = await props.params;
  const sp = (await props.searchParams) as { day?: string; group?: string };
  if (!/^\d+$/.test(id)) notFound();
  const employeeId = Number(id);
  const today = todayET();
  const day = sp.day && DAY.test(sp.day) ? sp.day : today;
  const group = sp.group === "Field" || sp.group === "Office" ? sp.group : "";
  const db = await recordsDb();

  const { data: emp } = await db.from("employees").select("id, title, clock_group, status").eq("id", employeeId).is("deleted_at", null).maybeSingle();
  if (!emp) notFound();
  const person = emp as { id: number; title: string | null; clock_group: string | null; status: string | null };
  const name = person.title ?? `#${person.id}`;
  const now = nowMs();
  // TS-c: Previous / Next walk the person's own group (an approver walks the Field).
  const [range, people, groups] = await Promise.all([panelRange(db, employeeId, day), panelPeople(db, group || (person.clock_group ?? "Field")), approvalGroups(db)]);
  const [data, corrections] = await Promise.all([loadPanel(db, employeeId, range, now, today, person.clock_group), loadPendingCorrections(db, [employeeId], range.from, range.to)]);
  const required = needsApproval(person.clock_group, groups);
  const status = approvalStatusOf(data.approval);
  const locked = status === "Approved";
  const canApprove = canApproveTimesheets(user);
  const totals = personTotals(data.days, data.limitFor);
  const blocks = weekBlocks(data.days);
  // OT: the limit shown is the one in force on the period's last day (or today inside it); each day uses its own.
  const limitDay = today >= range.from && today <= range.to ? today : range.to;
  const limit = data.limitFor(limitDay);
  const overtimeByDay = new Map(splitDays(data.days.map((d) => ({ day: d.date, minutes: d.minutes })), data.limitFor).map((d) => [d.day, d.overtime]));
  const tripTag = (date: string) => {
    const trip = tripAt(data.trips, date);
    return trip ? `+${Number(trip.premium_pct)}%` : null;
  };
  const employeesT = getTable("employees");

  const here = (d: string, other = employeeId) => `/time-clock/people/${other}?day=${d}${group ? `&group=${group}` : ""}`;
  const idx = people.findIndex((p) => p.id === employeeId);
  const prevPerson = idx > 0 ? people[idx - 1] : null;
  const nextPerson = idx >= 0 && idx < people.length - 1 ? people[idx + 1] : null;
  const local = (iso: string) => toDateTimeLocalET(iso);
  const hhmm = (iso: string) => local(iso).slice(11, 16);
  const dow = (date: string) => new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", weekday: "short" }).format(new Date(`${date}T12:00:00Z`));
  const loc = (e: EntryRow | undefined): Loc => ({ place: e?.place ?? "Unknown", lat: e?.lat ?? null, lng: e?.lng ?? null, distance: e && e.place !== "Office" && e.place !== "On site" ? formatDistance(e.distance_m) : "" });
  const periodLocked = (s: Shift) => Boolean(data.entries.get(s.inId)?.pay_period_id || (s.outId !== null && data.entries.get(s.outId)?.pay_period_id));
  const toView = (s: Shift): ShiftView => {
    const inE = data.entries.get(s.inId);
    const outE = s.outId === null ? undefined : data.entries.get(s.outId);
    return {
      inId: s.inId,
      outId: s.outId,
      day: s.day,
      minutes: s.minutes,
      flags: s.flags,
      needsReview: s.needsReview,
      start: hhmm(s.inAt),
      end: s.outAt ? hhmm(s.outAt) : null,
      endNextDay: s.outAt ? local(s.outAt).slice(0, 10) !== s.day : false,
      suggestedEnd: s.suggestedOutAt ? hhmm(s.suggestedOutAt) : null,
      startLoc: loc(inE),
      endLoc: outE ? loc(outE) : null,
      startCorrectedFrom: inE?.corrected_at && inE.original_at ? hhmm(inE.original_at) : null,
      endCorrectedFrom: outE?.corrected_at && outE.original_at ? hhmm(outE.original_at) : null,
      notes: [inE?.note, outE?.note].filter((n): n is string => Boolean(n)),
      projectId: s.projectId,
      projectTitle: s.projectId !== null ? (data.projectTitles.get(s.projectId) ?? `#${s.projectId}`) : null,
      managerNote: s.managerNote,
      lock: locked ? "approved" : periodLocked(s) ? "period" : null,
      openNow: s.outAt === null && s.suggestedOutAt === null && !s.flags.includes("open"),
    };
  };
  const views: DayView[] = data.days.map((d) => {
    const events: EventView[] = (data.events.get(d.date) ?? []).map((e) => ({ id: e.id, kind: e.kind, time: hhmm(e.at), project: e.project, loc: { place: e.place, lat: e.lat, lng: e.lng, distance: e.place !== "Office" && e.place !== "On site" ? formatDistance(e.distance_m) : "" } }));
    return { date: d.date, dow: dow(d.date), label: formatDate(d.date).replace(/\/\d{4}$/, ""), minutes: d.minutes, shifts: d.shifts.map(toView), timeOff: d.timeOff, events, locked, isToday: d.date === today, isFuture: d.date > today, overtime: overtimeByDay.get(d.date) ?? 0, trip: tripTag(d.date) };
  });
  const totalsAfter = personTotals(data.days, data.limitFor);
  const blockers = !required || locked ? [] : approvalBlockers({ toReview: totalsAfter.toReview, pendingCorrections: corrections.get(employeeId) ?? 0, endsOn: range.period?.ends_on ?? null, today });
  const addDay = today >= range.from && today <= range.to ? today : range.to < today ? range.to : range.from;

  return (
    <div className="mx-auto max-w-[1100px]">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[21px] font-semibold tracking-tight md:text-2xl">{tr("Time clock")}</h1>
          <p className="text-xs text-muted-foreground">{tr("One person's timesheet: a row per day of their pay period, edited in place.")}</p>
        </div>
        <ClockTabs current="timesheets" />
      </div>

      {/* Who: the person, with Previous / Next through the people who clock in (brief item 6). */}
      <div className="mb-3 flex items-center gap-1 rounded-2xl border bg-card px-2 py-2 shadow-card">
        {prevPerson ? (
          <Link href={here(day, prevPerson.id)} className="inline-flex size-11 shrink-0 items-center justify-center rounded-lg hover:bg-muted" aria-label={tr("Previous person: {name}", { name: prevPerson.title })} title={prevPerson.title}>
            <ChevronLeft className="size-5" aria-hidden />
          </Link>
        ) : (
          <span className="size-11 shrink-0" />
        )}
        <div className="min-w-0 flex-1 text-center">
          <Link href={recordHref(employeesT, person.id)} className="block truncate text-[17px] font-semibold tracking-tight hover:underline">
            {name}
          </Link>
          <p className="text-xs text-text-2">
            {tr(person.clock_group ?? "Field")}
            {idx >= 0 && ` · ${tr("{i} of {n}", { i: idx + 1, n: people.length })}`}
          </p>
        </div>
        {nextPerson ? (
          <Link href={here(day, nextPerson.id)} className="inline-flex size-11 shrink-0 items-center justify-center rounded-lg hover:bg-muted" aria-label={tr("Next person: {name}", { name: nextPerson.title })} title={nextPerson.title}>
            <ChevronRight className="size-5" aria-hidden />
          </Link>
        ) : (
          <span className="size-11 shrink-0" />
        )}
      </div>

      {/* When: the pay period (or the week), previous / next. */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <nav className="flex items-center gap-1 rounded-[10px] border bg-card p-0.5 text-[13px]" aria-label={tr("Period")}>
          <Link href={here(range.prevDay)} className="inline-flex size-10 items-center justify-center rounded-lg hover:bg-muted" aria-label={tr("Previous period")}>
            <ChevronLeft className="size-4" aria-hidden />
          </Link>
          <span className="px-2 font-semibold tabular-nums">
            {formatDate(range.from)} – {formatDate(range.to)}
          </span>
          <Link href={here(range.nextDay)} className="inline-flex size-10 items-center justify-center rounded-lg hover:bg-muted" aria-label={tr("Next period")}>
            <ChevronRight className="size-4" aria-hidden />
          </Link>
          {(today < range.from || today > range.to) && (
            <Link href={here(today)} className="px-2 text-primary hover:underline">
              {tr("Today")}
            </Link>
          )}
        </nav>
        <span className="text-[13px] text-text-2">
          {range.schedule && range.period ? tr("{schedule}: pay day {date}", { schedule: range.schedule.name, date: formatDate(range.period.pay_day) }) : tr("Week (no pay schedule yet)")}
          {!range.schedule && canFix && (
            <>
              {" · "}
              <Link href={`${recordHref(employeesT, person.id)}#pay-schedule`} className="text-primary hover:underline">
                {tr("Set one on the Employee page")}
              </Link>
            </>
          )}
        </span>
        {canFix && <ManualEntry people={[{ id: person.id, name }]} defaultDay={addDay} />}
      </div>

      {/* Totals (brief item 6). */}
      <dl className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-5">
        {[
          { k: tr("Regular"), v: formatHours(totals.regular) },
          { k: limit.weekly === null ? tr("Overtime (over {h} h/day)", { h: limitHours(limit.daily) }) : tr("Overtime (over {h} h/day, {w} h/week)", { h: limitHours(limit.daily), w: limitHours(limit.weekly) }), v: formatHours(totals.overtime), warn: totals.overtime > 0 },
          { k: tr("PTO"), v: formatHours(totals.pto) },
          { k: tr("Days worked"), v: String(totals.daysWorked) },
          { k: tr("Needs a look"), v: String(totals.toReview), warn: totals.toReview > 0 },
        ].map((x) => (
          <div key={x.k} className={cn("rounded-2xl border bg-card px-3 py-2 shadow-card", x.warn && "border-warn-fg/30 bg-warn-bg")}>
            <dt className="text-[11px] text-text-2">{x.k}</dt>
            <dd className={cn("text-lg font-semibold tabular-nums", x.warn && "text-warn-fg")}>{x.v}</dd>
          </div>
        ))}
      </dl>
      {/* TS-c: the approval of this period (the Field's approvers; the Office needs none). */}
      <div className={cn("mb-3 flex flex-wrap items-center justify-between gap-2 rounded-2xl border px-3 py-2 shadow-card", locked ? "border-ok-fg/30 bg-ok-bg" : "bg-card")}>
        <div className="min-w-0 text-[13px]">
          {required ? (
            locked ? (
              <span className="flex items-center gap-1.5 text-ok-fg">
                <Lock className="size-4 shrink-0" aria-hidden />
                {tr("Timesheet approved by {who} on {when}: the period is locked.", { who: data.approval?.approver ?? tr("Someone"), when: data.approval?.approved_at ? formatDate(data.approval.approved_at) : "" })}
              </span>
            ) : status === "Reopened" ? (
              <span>{tr("Reopened by {who}: {reason}", { who: data.approval?.reopener ?? tr("Someone"), reason: data.approval?.reopen_reason ?? "" })}</span>
            ) : (
              <span className="text-text-2">{tr("Timesheet approval for this period: once it ends and nothing is left to look at, an approver approves it here; Pay periods take the hours after that.")}</span>
            )
          ) : (
            <span className="text-text-2">{tr("No approval needed for the {group}: Pay periods take these hours directly.", { group: tr(person.clock_group ?? "Field") })}</span>
          )}
        </div>
        {required && range.period && <PeriodApproval employeeId={person.id} startsOn={range.period.starts_on} status={status} blockers={blockers} canApprove={canApprove} approver={data.approval?.approver ?? null} big />}
      </div>
      {totals.toReview > 0 && (
        <p className="mb-3 flex items-center gap-1.5 rounded-lg bg-warn-bg px-2.5 py-1.5 text-[13px] text-warn-fg">
          <AlertTriangle className="size-4 shrink-0" aria-hidden />
          {tr("{n} shifts need a look: the yellow rows below. A missing clock-out counts 0 until the real time is typed or the suggestion accepted.", { n: totals.toReview })}
        </p>
      )}

      {/* The days, by week. */}
      <div className="grid gap-3">
        {blocks.map((b) => (
          <section key={b.monday} className="overflow-hidden rounded-2xl border bg-card shadow-card">
            <header className="flex items-center justify-between gap-2 border-b bg-muted/50 px-3 py-2 text-[13px] md:px-4">
              <span className="font-semibold">
                {tr("Week of {date}", { date: formatDate(b.monday) })}
              </span>
              <span className="tabular-nums text-text-2">
                {b.ptoMinutes > 0 && `${tr("PTO")} ${formatHours(b.ptoMinutes)} · `}
                <span className="font-semibold text-foreground">{formatHours(b.minutes)}</span>
              </span>
            </header>
            <div className="hidden border-b px-4 py-1.5 text-[11px] text-text-2 md:grid md:grid-cols-[88px_minmax(0,1fr)] md:gap-x-3">
              <span>{tr("Day")}</span>
              <div className="md:grid md:grid-cols-[64px_minmax(0,1fr)_140px_140px_64px_auto] md:gap-x-3">
                <span>{tr("Type")}</span>
                <span>{tr("Job")}</span>
                <span>{tr("Start")}</span>
                <span>{tr("End")}</span>
                <span className="text-right">{tr("Total")}</span>
                <span />
              </div>
            </div>
            <ul className="divide-y">
              {views
                .filter((v) => mondayOf(v.date) === b.monday)
                .map((v) => (
                  <DayRow key={v.date} employeeId={person.id} day={v} canFix={canFix} admin={user.isSysadmin} />
                ))}
            </ul>
          </section>
        ))}
      </div>
      <p className="mt-3 text-xs text-text-2">
        {tr("Days run from the clock-in; a shift that ends after midnight stays on the day it started.")}{" "}
        <Link href={`/time-clock?day=${addDay}&employee=${person.id}`} className="text-primary hover:underline">
          {tr("Day view")}
        </Link>
        {" · "}
        <Link href={`/time-clock/timesheets?week=${mondayOf(addDays(range.to, 0))}${group ? `&group=${group}` : ""}`} className="text-primary hover:underline">
          {tr("Everyone's week")}
        </Link>
      </p>
    </div>
  );
}
