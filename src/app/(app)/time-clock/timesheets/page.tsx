import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle, ChevronLeft, ChevronRight } from "lucide-react";
import { ClockTabs } from "@/components/time-clock/clock-tabs";
import { ManualEntry } from "@/components/time-clock/manual-entry";
import { PeriodPicker } from "@/components/time-clock/period-picker";
import { ApproveAll, WeekApproval } from "@/components/time-clock/week-approval";
import { requireUser } from "@/lib/auth/session";
import { formatDate, fromDateTimeLocalET, nowMs, toDateTimeLocalET, todayET } from "@/lib/dates";
import { recordsDb } from "@/lib/records/data";
import { addDays, clock } from "@/lib/schedule/dates";
import { CLOCK_GROUPS } from "@/lib/time-clock/clock";
import { DEPARTMENTS, inDepartment, periodSheet, type Department } from "@/lib/time-clock/period";
import { FLAG_TEXT, formatHours, mondayOf, weekSheet, type SheetEntry, type WeekSheet } from "@/lib/time-clock/timesheet";
import { weekBlockers, weekEnded, weekStatusOf, type Blocker, type WeekStatus } from "@/lib/time-clock/week-approval";
import { canApproveWeeks, loadWeekPending, loadWeekRows, type WeekRowWithNames } from "@/lib/time-clock/week-status";
import { getTable } from "@/registry";
import { recordHref } from "@/registry/routes";
import { cn } from "@/lib/utils";
import { getT } from "@/i18n/server";

export async function generateMetadata() {
  return { title: (await getT())("Timesheets") };
}

// TC-a Timesheets (Jessica via Fred 2026-10-21, "only the basics", Connecteam style): one week per person,
// Monday to Sunday, hours per day and the week total, from the clock-in → clock-out intervals only.
// TC-b: shifts under 5 minutes, in / out / in within the same minute, over 14 hours, never closed, or closed
// by the system are listed under "Needs a look" until the office reviews them on the day view.
// Jessica's third round (2026-10-26): J-u only people who must clock in; J-v a department filter
// (Low Voltage / Electrical / all); J-w any period (from – to, both days included); J-s Add a clock entry.
// TC-h (Jessica via Fred 2026-10-29): each week is Open / Approved / Reopened per person; approving locks its
// entries; a status filter and Approve all for the approvers (administrative.timesheets.approve).

type Person = { id: number; title: string | null; clock_group: string | null; status: string | null; departments: string[] | null; must_clock_in: boolean };
type EntryRow = SheetEntry & { employee_id: number };

const DAY = /^\d{4}-\d{2}-\d{2}$/;

export default async function TimesheetsPage(props: PageProps<"/time-clock/timesheets">) {
  const tr = await getT();
  const user = await requireUser();
  if (!user.permissions.has("administrative.employees.view_all")) notFound();
  const canFix = user.permissions.has("administrative.employees.modify");
  const sp = (await props.searchParams) as { week?: string; group?: string; dept?: string; from?: string; to?: string; status?: string };
  const today = todayET();
  const monday = mondayOf(sp.week && DAY.test(sp.week) ? sp.week : today);
  const thisMonday = mondayOf(today);
  const group = (CLOCK_GROUPS as readonly string[]).includes(sp.group ?? "") ? sp.group! : "";
  const dept: Department | "" = (DEPARTMENTS as readonly string[]).includes(sp.dept ?? "") ? (sp.dept as Department) : "";
  // J-w: a period of any length replaces the week when both days are given (and in order).
  const period = sp.from && sp.to && DAY.test(sp.from) && DAY.test(sp.to) && sp.from <= sp.to ? { from: sp.from, to: sp.to } : null;
  const statusFilter: "" | "open" | "approved" = sp.status === "open" || sp.status === "approved" ? sp.status : "";
  const canApprove = canApproveWeeks(user);
  const rangeFrom = period ? period.from : monday;
  const rangeTo = period ? period.to : addDays(monday, 6);
  const sunday = addDays(monday, 6);
  const db = await recordsDb();

  const [{ data: emp }, { data: ent }] = await Promise.all([
    db.from("employees").select("id, title, clock_group, status, departments, must_clock_in").is("deleted_at", null).order("title"),
    db
      .from("time_entries")
      .select("id, employee_id, kind, at, note, reviewed_at, auto_closed")
      .in("kind", ["clock_in", "clock_out"])
      .gte("at", fromDateTimeLocalET(`${rangeFrom}T00:00`))
      .lt("at", fromDateTimeLocalET(`${addDays(rangeTo, 1)}T00:00`))
      .is("deleted_at", null)
      .order("at"),
  ]);
  const entries = (ent ?? []) as EntryRow[];
  const byPerson = Map.groupBy(entries, (e) => e.employee_id);
  const everyone = (emp ?? []) as Person[];
  // Everyone of the group and department who must clock in and is still working, plus anyone who clocked in the range.
  const people = everyone.filter((p) => (!group || (p.clock_group ?? "Field") === group) && inDepartment(p.departments, dept) && (byPerson.has(p.id) || (p.must_clock_in && (p.status === "Active" || p.status === "Reports"))));
  const now = nowMs();
  // TC-h: the week's approval per person (rows + what still blocks it), then the status filter.
  const ids = people.map((p) => p.id);
  const [weekRows, weekPending] = period ? [new Map<number, WeekRowWithNames>(), new Map<number, { corrections: number; overtime: boolean }>()] : await Promise.all([loadWeekRows(db, monday, ids), loadWeekPending(db, monday, ids)]);
  const allSheets = people.map((p) => {
    const sheet = weekSheet(byPerson.get(p.id) ?? [], monday, now, today);
    const row = weekRows.get(p.id);
    const pend = weekPending.get(p.id) ?? { corrections: 0, overtime: false };
    const status: WeekStatus = weekStatusOf(row);
    const blockers: Blocker[] = status === "Approved" ? [] : weekBlockers({ sheet, pendingCorrections: pend.corrections, pendingOvertime: pend.overtime, monday, today });
    return { person: p, sheet, status, blockers, approver: row?.approver ?? null };
  });
  const sheets = allSheets.filter((s) => (statusFilter === "open" ? s.status !== "Approved" : statusFilter === "approved" ? s.status === "Approved" : true));
  const approvable = allSheets.filter((s) => s.status !== "Approved" && s.blockers.length === 0).map((s) => s.person.id);
  const openCount = allSheets.filter((s) => s.status !== "Approved").length;
  const periods = period ? people.map((p) => ({ person: p, sheet: periodSheet(byPerson.get(p.id) ?? [], period.from, period.to, now, today) })) : [];
  const toReview = (period ? periods.flatMap(({ person, sheet }) => sheet.days.flatMap((d) => d.shifts.filter((s) => s.needsReview).map((s) => ({ person, day: d.date, shift: s })))) : sheets.flatMap(({ person, sheet }) => sheet.days.flatMap((d) => d.shifts.filter((s) => s.needsReview).map((s) => ({ person, day: d.date, shift: s })))));
  const grand = sheets.reduce((n, s) => n + s.sheet.totalMinutes, 0);

  const employeesT = getTable("employees");
  const dayHref = (employeeId: number, day: string) => `/time-clock?day=${day}&employee=${employeeId}`;
  const q = (o: { week?: string; group?: string; dept?: string; from?: string; to?: string; status?: string }) => {
    const p = new URLSearchParams();
    const merged = { week: period ? "" : monday, group, dept, from: period?.from ?? "", to: period?.to ?? "", status: statusFilter, ...o };
    for (const [k, v] of Object.entries(merged)) if (v) p.set(k, v);
    return `/time-clock/timesheets${p.size ? `?${p}` : ""}`;
  };
  const weekHref = (m: string, g: string = group) => q({ week: m, group: g, from: "", to: "" });
  const time = (iso: string) => clock(toDateTimeLocalET(iso).slice(11));
  const dow = (date: string) => new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", weekday: "short" }).format(new Date(`${date}T12:00:00Z`));
  const dayLabels = sheets[0]?.sheet.days.map((d) => d.date) ?? Array.from({ length: 7 }, (_, i) => addDays(monday, i));
  const manualPeople = everyone.filter((p) => p.status === "Active" || p.status === "Reports" || p.status === "Freelance").map((p) => ({ id: p.id, name: p.title ?? `#${p.id}` }));

  return (
    <div className="mx-auto max-w-[1300px]">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[21px] font-semibold tracking-tight md:text-2xl">{tr("Time clock")}</h1>
          <p className="text-xs text-muted-foreground">{tr("Hours per day and per week from the clock-ins and clock-outs. On my way and job arrivals never change the total.")}</p>
        </div>
        <ClockTabs current="timesheets" />
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        {!period && (
          <nav className="flex items-center gap-1 rounded-[10px] border bg-card p-0.5 text-[13px]" aria-label={tr("Week")}>
            <Link href={weekHref(addDays(monday, -7))} className="inline-flex size-10 items-center justify-center rounded-lg hover:bg-muted" aria-label={tr("Previous week")}>
              <ChevronLeft className="size-4" aria-hidden />
            </Link>
            <span className="px-2 font-semibold tabular-nums">
              {formatDate(monday)} – {formatDate(sunday)}
            </span>
            <Link href={weekHref(addDays(monday, 7))} className="inline-flex size-10 items-center justify-center rounded-lg hover:bg-muted" aria-label={tr("Next week")}>
              <ChevronRight className="size-4" aria-hidden />
            </Link>
            {monday !== thisMonday && (
              <Link href={weekHref(thisMonday)} className="px-2 text-primary hover:underline">
                {tr("This week")}
              </Link>
            )}
          </nav>
        )}
        <PeriodPicker from={period?.from ?? ""} to={period?.to ?? ""} base={{ group, dept }} />
        <div className="flex rounded-[10px] border bg-muted p-0.5 text-[13px]" role="tablist" aria-label={tr("Time clock group")}>
          {[{ key: "", label: tr("Everyone") }, ...CLOCK_GROUPS.map((g) => ({ key: g, label: tr(g) }))].map((g) => (
            <Link key={g.key} href={q({ group: g.key })} role="tab" aria-selected={g.key === group} className={cn("rounded-lg px-3 py-2", g.key === group ? "bg-card font-semibold shadow-card" : "text-text-2")}>
              {g.label}
            </Link>
          ))}
        </div>
        <div className="flex rounded-[10px] border bg-muted p-0.5 text-[13px]" role="tablist" aria-label={tr("Department")}>
          {[{ key: "", label: tr("All departments") }, ...DEPARTMENTS.map((d) => ({ key: d, label: tr(d) }))].map((d) => (
            <Link key={d.key} href={q({ dept: d.key })} role="tab" aria-selected={d.key === dept} className={cn("rounded-lg px-3 py-2", d.key === dept ? "bg-card font-semibold shadow-card" : "text-text-2")}>
              {d.label}
            </Link>
          ))}
        </div>
        {!period && (
          <div className="flex rounded-[10px] border bg-muted p-0.5 text-[13px]" role="tablist" aria-label={tr("Approval status")}>
            {[{ key: "", label: tr("All") }, { key: "open", label: tr("Open ({n})", { n: openCount }) }, { key: "approved", label: tr("Approved ({n})", { n: allSheets.length - openCount }) }].map((s) => (
              <Link key={s.key} href={q({ status: s.key })} role="tab" aria-selected={s.key === statusFilter} className={cn("rounded-lg px-3 py-2", s.key === statusFilter ? "bg-card font-semibold shadow-card" : "text-text-2")}>
                {s.label}
              </Link>
            ))}
          </div>
        )}
        {canFix && <ManualEntry people={manualPeople} defaultDay={period ? period.to : today} />}
        {canApprove && !period && weekEnded(monday, today) && <ApproveAll monday={monday} employeeIds={approvable} />}
      </div>
      {!period && canApprove && !weekEnded(monday, today) && <p className="mb-3 text-xs text-text-2">{tr("A week can be approved from the Monday after it ends. Approving locks that person's clock entries for the week; Reopen (with a reason) unlocks them.")}</p>}

      {toReview.length > 0 && (
        <section className="mb-4 rounded-2xl border border-warn-fg/30 bg-warn-bg px-[18px] py-3 shadow-card">
          <h2 className="mb-1 flex items-center gap-1.5 text-[15px] font-semibold tracking-tight text-warn-fg">
            <AlertTriangle className="size-4" aria-hidden />
            {tr("Needs a look ({n})", { n: toReview.length })}
          </h2>
          <ul className="divide-y divide-warn-fg/20 text-[13px]">
            {toReview.map(({ person, day, shift }) => (
              <li key={shift.inId} className="flex flex-wrap items-baseline gap-x-2 py-1.5">
                <Link href={dayHref(person.id, day)} className="font-medium hover:underline">
                  {person.title ?? `#${person.id}`}
                </Link>
                <span className="tabular-nums text-text-2">
                  {dow(day)} {formatDate(day)} · {time(shift.inAt)}
                  {shift.outAt ? ` – ${time(shift.outAt)}` : ""}
                </span>
                <span>{shift.flags.map((f) => tr(FLAG_TEXT[f])).join(" · ")}</span>
              </li>
            ))}
          </ul>
          <p className="mt-1 text-xs text-text-2">{tr("Open the day to correct the times or mark the shift as reviewed. These shifts stay listed until then.")}</p>
        </section>
      )}

      {period ? (
        // J-w: any period, one block per person with their days and the total.
        periods.length === 0 ? (
          <p className="rounded-2xl border border-dashed bg-card px-6 py-10 text-center text-text-2">{tr("Nobody in this group.")}</p>
        ) : (
          <div className="grid gap-3">
            <p className="text-[13px] text-text-2">
              {tr("{from} to {to}, both days included", { from: formatDate(period.from), to: formatDate(period.to) })} · {tr("{n} people", { n: periods.length })} · <span className="font-semibold text-foreground tabular-nums">{formatHours(periods.reduce((n, p) => n + p.sheet.totalMinutes, 0))} h</span>
            </p>
            {periods.map(({ person, sheet }) => (
              <section key={person.id} className="rounded-2xl border bg-card px-[18px] py-3 shadow-card">
                <div className="flex items-baseline justify-between gap-2">
                  <Link href={recordHref(employeesT, person.id)} className="font-semibold tracking-tight hover:underline">
                    {person.title ?? `#${person.id}`}
                  </Link>
                  <span className="font-semibold tabular-nums">{formatHours(sheet.totalMinutes)} h</span>
                </div>
                <p className="text-xs text-text-2">{tr("{n} days worked", { n: sheet.days.filter((d) => d.minutes > 0).length })}</p>
                <ul className="mt-1 flex flex-wrap gap-1.5 text-[13px]">
                  {sheet.days
                    .filter((d) => d.minutes > 0 || d.toReview > 0)
                    .map((d) => (
                      <li key={d.date}>
                        <Link href={dayHref(person.id, d.date)} className={cn("inline-flex min-h-9 items-center gap-1 rounded-lg border px-2 tabular-nums hover:bg-muted", d.toReview > 0 && "border-warn-fg/30 bg-warn-bg text-warn-fg")}>
                          {dow(d.date)} {formatDate(d.date).replace(/\/\d{4}$/, "")} · {formatHours(d.minutes)}
                          {d.toReview > 0 && <AlertTriangle className="size-3.5" aria-hidden />}
                        </Link>
                      </li>
                    ))}
                </ul>
              </section>
            ))}
          </div>
        )
      ) : sheets.length === 0 ? (
        <p className="rounded-2xl border border-dashed bg-card px-6 py-10 text-center text-text-2">{tr("Nobody in this group.")}</p>
      ) : (
        <>
          {/* Phones: one card per person with the seven days in a row. */}
          <div className="grid gap-3 md:hidden">
            {sheets.map(({ person, sheet, status, blockers, approver }) => (
              <section key={person.id} className="rounded-2xl border bg-card px-3 py-3 shadow-card">
                <div className="mb-2 flex items-baseline justify-between gap-2 px-1">
                  <Link href={recordHref(employeesT, person.id)} className="truncate text-[15px] font-semibold tracking-tight hover:underline">
                    {person.title ?? `#${person.id}`}
                  </Link>
                  <span className="shrink-0 text-sm font-semibold tabular-nums">{formatHours(sheet.totalMinutes)}</span>
                </div>
                <WeekRow sheet={sheet} employeeId={person.id} dayHref={dayHref} dow={dow} compact />
                <div className="mt-2 flex items-center justify-end px-1">
                  <WeekApproval employeeId={person.id} monday={monday} status={status} blockers={blockers} canApprove={canApprove} approver={approver} />
                </div>
              </section>
            ))}
          </div>

          {/* Computers: one table, a row per person. */}
          <div className="hidden overflow-x-auto rounded-2xl border bg-card shadow-card md:block">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-b text-left text-xs text-text-2">
                  <th className="px-4 py-2.5 font-medium">{tr("Person")}</th>
                  {dayLabels.map((d) => (
                    <th key={d} className={cn("px-2 py-2.5 text-center font-medium tabular-nums", d === today && "text-primary")}>
                      {dow(d)}
                      <br />
                      {formatDate(d).replace(/\/\d{4}$/, "")}
                    </th>
                  ))}
                  <th className="px-4 py-2.5 text-right font-medium">{tr("Week")}</th>
                  <th className="px-4 py-2.5 text-right font-medium">{tr("Status")}</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {sheets.map(({ person, sheet, status, blockers, approver }) => (
                  <tr key={person.id}>
                    <td className="px-4 py-2">
                      <Link href={recordHref(employeesT, person.id)} className="font-medium hover:underline">
                        {person.title ?? `#${person.id}`}
                      </Link>
                      {group === "" && <span className="ml-1.5 text-xs text-text-2">{tr(person.clock_group ?? "Field")}</span>}
                    </td>
                    {sheet.days.map((d) => (
                      <td key={d.date} className="px-1 py-1 text-center">
                        <DayCell minutes={d.minutes} toReview={d.toReview} open={d.shifts.some((s) => !s.outAt && !s.flags.includes("open"))} href={dayHref(person.id, d.date)} title={tr("Open this day")} />
                      </td>
                    ))}
                    <td className="px-4 py-2 text-right font-semibold tabular-nums">{formatHours(sheet.totalMinutes)}</td>
                    <td className="px-4 py-2 text-right">
                      <WeekApproval employeeId={person.id} monday={monday} status={status} blockers={blockers} canApprove={canApprove} approver={approver} />
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t text-xs text-text-2">
                  <td className="px-4 py-2">{tr("{n} people", { n: sheets.length })}</td>
                  {dayLabels.map((d, i) => (
                    <td key={d} className="px-2 py-2 text-center tabular-nums">
                      {formatHours(sheets.reduce((n, s) => n + s.sheet.days[i].minutes, 0))}
                    </td>
                  ))}
                  <td className="px-4 py-2 text-right font-semibold tabular-nums">{formatHours(grand)}</td>
                  <td className="px-4 py-2" />
                </tr>
              </tfoot>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

function WeekRow({ sheet, employeeId, dayHref, dow, compact }: { sheet: WeekSheet; employeeId: number; dayHref: (id: number, day: string) => string; dow: (d: string) => string; compact?: boolean }) {
  return (
    <div className={cn("grid grid-cols-7 gap-1", compact && "text-xs")}>
      {sheet.days.map((d) => (
        <div key={d.date} className="min-w-0 text-center">
          <div className="text-[11px] text-text-2">
            {dow(d.date).slice(0, 1)} {d.date.slice(8).replace(/^0/, "")}
          </div>
          <DayCell minutes={d.minutes} toReview={d.toReview} open={d.shifts.some((s) => !s.outAt && !s.flags.includes("open"))} href={dayHref(employeeId, d.date)} />
        </div>
      ))}
    </div>
  );
}

/** One day's hours, linking to that day's entries; a warning mark when a shift wants a look. */
function DayCell({ minutes, toReview, open, href, title }: { minutes: number; toReview: number; open: boolean; href: string; title?: string }) {
  return (
    <Link
      href={href}
      title={title}
      className={cn(
        "inline-flex h-11 w-full min-w-[44px] items-center justify-center gap-0.5 rounded-lg tabular-nums hover:bg-muted",
        minutes === 0 && toReview === 0 ? "text-muted-foreground" : "font-medium",
        toReview > 0 && "bg-warn-bg text-warn-fg",
        open && "text-ok-fg",
      )}
    >
      {minutes === 0 && toReview === 0 ? "–" : formatHours(minutes)}
      {toReview > 0 && <AlertTriangle className="size-3.5 shrink-0" aria-hidden />}
    </Link>
  );
}
