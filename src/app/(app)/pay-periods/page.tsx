import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle, ChevronLeft, ChevronRight, Download, Lock } from "lucide-react";
import { ApproveButton } from "@/components/payroll/approve-button";
import { PayDayEditor } from "@/components/payroll/pay-day-editor";
import { SchedulesPanel } from "@/components/payroll/schedules-panel";
import { requireUser } from "@/lib/auth/session";
import { canSeeCosting } from "@/lib/costing/load";
import { formatDate, formatDateTime, nowMs, todayET } from "@/lib/dates";
import { money } from "@/lib/payroll/engine";
import { loadOverrides, loadPeriod, loadSchedules, type LineApproval } from "@/lib/payroll/load";
import { describeRule, nextPeriod, payDayOf, periodEnded, periodFor, previousPeriod, recentPeriods } from "@/lib/payroll/periods";
import { recordsDb } from "@/lib/records/data";
import { formatHours } from "@/lib/time-clock/timesheet";
import { getTable } from "@/registry";
import { recordHref } from "@/registry/routes";
import { cn } from "@/lib/utils";
import { getT } from "@/i18n/server";

export async function generateMetadata() {
  return { title: (await getT())("Pay periods") };
}

// TC-f Pay periods (Jessica via Fred 2026-10-21, Stage 3; the brief's "Payroll screen", named Pay periods because
// Administrative › Payroll already holds the payment records): pick a pay schedule and a period, see each person's
// hours, paid PTO, the rate(s) in force, adjustments and the total; approve & lock; export CSV / Excel.
// PS-a (Fred 2026-11-04): periods come from pay schedules (groups with their own anchor), not from fixed frequencies.
// Only the Job costing permission (the rule that protects pay rates) may open it. Nothing here goes to OneDrive.

export default async function PayPeriodsPage(props: PageProps<"/pay-periods">) {
  const tr = await getT();
  const user = await requireUser();
  if (!canSeeCosting(user)) notFound();
  const { schedule: sParam, period: pParam } = (await props.searchParams) as { schedule?: string; period?: string };
  const today = todayET();
  const db = await recordsDb();
  const schedules = await loadSchedules(db);
  const active = schedules.filter((s) => s.active);
  const schedule = (sParam && /^\d+$/.test(sParam) ? schedules.find((s) => s.id === Number(sParam)) : null) ?? active[0] ?? null;

  if (!schedule) {
    return (
      <div className="mx-auto max-w-[1300px]">
        <h1 className="mb-1 text-[21px] font-semibold tracking-tight md:text-2xl">{tr("Pay periods")}</h1>
        <p className="mb-4 text-xs text-muted-foreground">{tr("Set up a pay schedule first: the group's cycle, anchor date and pay day.")}</p>
        <div className="flex">
          <SchedulesPanel schedules={schedules} open />
        </div>
      </div>
    );
  }

  const overrides = await loadOverrides(db, schedule.id);
  const period = periodFor(schedule, pParam && /^\d{4}-\d{2}-\d{2}$/.test(pParam) ? pParam : today, overrides);
  const data = await loadPeriod(db, period, nowMs());
  const employeesT = getTable("employees");
  const href = (scheduleId: number, startsOn: string) => `/pay-periods?schedule=${scheduleId}&period=${startsOn}`;
  const label = `${formatDate(period.starts_on)} – ${formatDate(period.ends_on)}`;
  const current = periodFor(schedule, today, overrides);
  const ended = periodEnded(period, today);
  const disabledReason = data.locked ? null : !ended ? tr("Ends {date}: approve it after that", { date: formatDate(period.ends_on) }) : data.totals.toReview > 0 ? tr("{n} shifts still need a review", { n: data.totals.toReview }) : data.totals.unapproved > 0 ? tr("{n} timesheets not approved yet", { n: data.totals.unapproved }) : data.lines.length === 0 ? tr("Nobody on this pay schedule") : null;
  const amount = (v: number | null) => (v === null ? "—" : money.format(v));
  const exportHref = (format: "csv" | "xlsx") => `/api/pay-periods/export?schedule=${schedule.id}&period=${period.starts_on}&format=${format}`;

  return (
    <div className="mx-auto max-w-[1300px]">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[21px] font-semibold tracking-tight md:text-2xl">{tr("Pay periods")}</h1>
          <p className="text-xs text-muted-foreground">{tr("Hours × the pay rate in force each day, per person and period. Only people with the Job costing permission see this; nothing here goes to OneDrive.")}</p>
        </div>
        <div className="flex flex-wrap rounded-[10px] border bg-muted p-0.5 text-[13px]" role="tablist" aria-label={tr("Pay schedule")}>
          {(active.includes(schedule) ? active : [schedule, ...active]).map((s) => (
            <Link key={s.id} href={href(s.id, s.id === schedule.id ? period.starts_on : periodFor(s, period.starts_on).starts_on)} role="tab" aria-selected={s.id === schedule.id} className={cn("rounded-lg px-3 py-2", s.id === schedule.id ? "bg-card font-semibold shadow-card" : "text-text-2")}>
              {s.name}
            </Link>
          ))}
        </div>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <nav className="flex items-center gap-1 rounded-[10px] border bg-card p-0.5 text-[13px]" aria-label={tr("Period")}>
          <Link href={href(schedule.id, previousPeriod(period, schedule, overrides).starts_on)} className="inline-flex size-10 items-center justify-center rounded-lg hover:bg-muted" aria-label={tr("Previous period")}>
            <ChevronLeft className="size-4" aria-hidden />
          </Link>
          <span className="px-2 font-semibold tabular-nums">{label}</span>
          <Link href={href(schedule.id, nextPeriod(period, schedule, overrides).starts_on)} className="inline-flex size-10 items-center justify-center rounded-lg hover:bg-muted" aria-label={tr("Next period")}>
            <ChevronRight className="size-4" aria-hidden />
          </Link>
          {period.starts_on !== current.starts_on && (
            <Link href={href(schedule.id, current.starts_on)} className="px-2 text-primary hover:underline">
              {tr("This period")}
            </Link>
          )}
        </nav>
        <PayDayEditor scheduleId={schedule.id} startsOn={period.starts_on} payDay={period.pay_day} moved={period.pay_day_moved} cycleDay={payDayOf(period.ends_on, schedule.pay_day_rule)} />
        <details className="relative text-[13px]">
          <summary className="cursor-pointer list-none rounded-lg border bg-card px-3 py-2 hover:bg-muted">{tr("Other periods")}</summary>
          <ul className="absolute left-0 z-10 mt-1 w-80 rounded-xl border bg-card p-1 shadow-card">
            {recentPeriods(schedule, today, 12, overrides).map((p) => (
              <li key={p.starts_on}>
                <Link href={href(schedule.id, p.starts_on)} className={cn("flex justify-between gap-2 rounded-lg px-2 py-1.5 tabular-nums hover:bg-muted", p.starts_on === period.starts_on && "font-semibold")}>
                  <span>
                    {formatDate(p.starts_on)} – {formatDate(p.ends_on)}
                  </span>
                  <span className={cn("text-text-2", p.pay_day_moved && "text-warn-fg")}>{tr("pay {date}", { date: formatDate(p.pay_day) })}</span>
                </Link>
              </li>
            ))}
          </ul>
        </details>
        <span className="flex-1" />
        <a href={exportHref("csv")} className="inline-flex h-11 items-center gap-1.5 rounded-lg border px-3 text-sm hover:bg-muted">
          <Download className="size-4" aria-hidden />
          CSV
        </a>
        <a href={exportHref("xlsx")} className="inline-flex h-11 items-center gap-1.5 rounded-lg border px-3 text-sm hover:bg-muted">
          <Download className="size-4" aria-hidden />
          Excel
        </a>
        <SchedulesPanel schedules={schedules} />
      </div>
      <p className="mb-4 text-xs text-text-2">{tr("{name}: {frequency}, paid {rule}.", { name: schedule.name, frequency: tr(schedule.frequency), rule: describeRule(schedule.pay_day_rule, tr) })}</p>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        {data.locked ? (
          <span className="inline-flex items-center gap-2 rounded-lg bg-ok-bg px-3 py-2 text-sm text-ok-fg">
            <Lock className="size-4" aria-hidden />
            {tr("Approved and locked by {who} on {when}", { who: data.locked.approver ?? tr("Someone"), when: formatDateTime(data.locked.approved_at) })}
            {data.locked.note && <span className="text-text-2"> · {data.locked.note}</span>}
          </span>
        ) : (
          <ApproveButton scheduleId={schedule.id} startsOn={period.starts_on} disabledReason={disabledReason} />
        )}
      </div>

      {data.totals.toReview > 0 && !data.locked && (
        <section className="mb-4 rounded-2xl border border-warn-fg/30 bg-warn-bg px-[18px] py-3 shadow-card">
          <h2 className="mb-1 flex items-center gap-1.5 text-[15px] font-semibold tracking-tight text-warn-fg">
            <AlertTriangle className="size-4" aria-hidden />
            {tr("Shifts to review before approving ({n})", { n: data.totals.toReview })}
          </h2>
          <ul className="divide-y divide-warn-fg/20 text-[13px]">
            {data.lines.flatMap((l) =>
              l.review.map((s) => (
                <li key={s.inId} className="flex flex-wrap items-baseline gap-x-2 py-1.5">
                  <Link href={`/time-clock?day=${s.day}&employee=${l.person.id}`} className="font-medium hover:underline">
                    {l.person.title}
                  </Link>
                  <span className="tabular-nums text-text-2">{formatDate(s.day)}</span>
                  <span>{tr("{n} h", { n: formatHours(s.minutes) })}</span>
                </li>
              )),
            )}
          </ul>
        </section>
      )}

      {data.unassigned.length > 0 && (
        <p className="mb-4 rounded-2xl border bg-card px-[18px] py-3 text-[13px] shadow-card">
          {tr("Clocked hours in this period but no pay schedule yet (set it on the Employee page):")}{" "}
          {data.unassigned.map((p, i) => (
            <span key={p.id}>
              {i > 0 && ", "}
              <Link href={`${recordHref(employeesT, p.id)}#pay-schedule`} className="text-primary hover:underline">
                {p.title}
              </Link>
            </span>
          ))}
        </p>
      )}

      {data.lines.length === 0 ? (
        <p className="rounded-2xl border border-dashed bg-card px-6 py-10 text-center text-text-2">{tr("Nobody is on the {name} pay schedule. Set it on each Employee page.", { name: schedule.name })}</p>
      ) : (
        <>
          {/* Phones: one card per person. */}
          <div className="grid gap-3 md:hidden">
            {data.lines.map((l) => (
              <section key={l.person.id} className="rounded-2xl border bg-card px-[18px] py-3 shadow-card">
                <div className="flex items-baseline justify-between gap-2">
                  <Link href={recordHref(employeesT, l.person.id)} className="font-semibold tracking-tight hover:underline">
                    {l.person.title}
                  </Link>
                  <span className="font-semibold tabular-nums">{amount(l.line.total)}</span>
                </div>
                <p className="mt-1 text-[13px] text-text-2">
                  {tr("{n} h", { n: formatHours(l.line.minutes) })}
                  {l.line.ptoMinutes > 0 && ` · ${tr("PTO {n} h", { n: formatHours(l.line.ptoMinutes) })}`}
                  {l.line.rateText && ` · ${l.line.rateText}`}
                  {l.line.adjustments !== 0 && ` · ${tr("adjustments {amount}", { amount: money.format(l.line.adjustments) })}`}
                </p>
                <p className="mt-1">
                  <TimesheetCell approval={l.approval} tr={tr} />
                </p>
                <LineNotes line={l} tr={tr} />
              </section>
            ))}
          </div>

          {/* Computers: one table. */}
          <div className="hidden overflow-x-auto rounded-2xl border bg-card shadow-card md:block">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-b text-left text-xs text-text-2">
                  <th className="px-4 py-2.5 font-medium">{tr("Person")}</th>
                  <th className="px-3 py-2.5 font-medium">{tr("Timesheet")}</th>
                  <th className="px-3 py-2.5 text-right font-medium">{tr("Hours")}</th>
                  <th className="px-3 py-2.5 text-right font-medium">{tr("PTO")}</th>
                  <th className="px-3 py-2.5 text-right font-medium">{tr("Rate")}</th>
                  <th className="px-3 py-2.5 text-right font-medium">{tr("Amount")}</th>
                  <th className="px-3 py-2.5 text-right font-medium">{tr("Adjustments")}</th>
                  <th className="px-4 py-2.5 text-right font-medium">{tr("Total")}</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {data.lines.map((l) => (
                  <tr key={l.person.id} className="align-top">
                    <td className="px-4 py-2">
                      <Link href={recordHref(employeesT, l.person.id)} className="font-medium hover:underline">
                        {l.person.title}
                      </Link>
                      <LineNotes line={l} tr={tr} />
                    </td>
                    <td className="px-3 py-2">
                      <TimesheetCell approval={l.approval} tr={tr} />
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{formatHours(l.line.minutes)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{l.line.ptoMinutes ? formatHours(l.line.ptoMinutes) : "–"}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{l.line.rateText || <span className="text-warn-fg">{tr("no rate")}</span>}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{amount(l.line.amount)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{l.line.adjustments ? money.format(l.line.adjustments) : "–"}</td>
                    <td className="px-4 py-2 text-right font-semibold tabular-nums">{amount(l.line.total)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t text-xs text-text-2">
                  <td className="px-4 py-2">{tr("{n} people", { n: data.lines.length })}</td>
                  <td className="px-3 py-2">{data.totals.unapproved > 0 ? <span className="text-warn-fg">{tr("{n} not approved", { n: data.totals.unapproved })}</span> : null}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatHours(data.totals.minutes)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{data.totals.ptoMinutes ? formatHours(data.totals.ptoMinutes) : "–"}</td>
                  <td />
                  <td className="px-3 py-2 text-right tabular-nums">{amount(data.totals.amount)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{data.totals.adjustments ? money.format(data.totals.adjustments) : "–"}</td>
                  <td className="px-4 py-2 text-right font-semibold tabular-nums">{amount(data.totals.total)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

/** TS-c: the person's timesheet approval for the period (the Field needs it before the lock; the Office does not). */
function TimesheetCell({ approval: a, tr }: { approval: LineApproval; tr: (s: string, v?: Record<string, string | number>) => string }) {
  if (!a.required) return <span className="text-xs text-text-2">{tr("Not required")}</span>;
  if (a.status === "Approved")
    return (
      <span className="inline-flex items-center gap-1 text-xs text-ok-fg">
        <Lock className="size-3.5" aria-hidden />
        {a.approver ? tr("Approved by {name}", { name: a.approver }) : tr("Approved")}
        {a.approved_at && <span className="text-text-2"> · {formatDate(a.approved_at)}</span>}
      </span>
    );
  return <span className="text-xs font-medium text-warn-fg">{tr("Not approved")}</span>;
}

/** Under a person: days without a rate, shifts to review, adjustments paid here, corrections made after the lock. */
function LineNotes({ line: l, tr }: { line: Awaited<ReturnType<typeof loadPeriod>>["lines"][number]; tr: (s: string, v?: Record<string, string | number>) => string }) {
  const notes: { tone: "warn" | "muted"; text: string }[] = [];
  if (l.line.missingRateDays.length) notes.push({ tone: "warn", text: tr("No pay rate on {dates}: amount incomplete", { dates: l.line.missingRateDays.map((d) => formatDate(d)).join(", ") }) });
  if (l.line.toReview) notes.push({ tone: "warn", text: tr("{n} shifts need a review", { n: l.line.toReview }) });
  for (const a of l.adjustments) notes.push({ tone: "muted", text: tr("Adjustment {amount} ({hours} h) from {period}: {reason}", { amount: a.delta_amount === null ? "—" : money.format(a.delta_amount), hours: formatHours(a.delta_minutes), period: a.period_label ?? `#${a.period_id}`, reason: a.reason }) });
  for (const a of l.later) notes.push({ tone: "muted", text: tr("Corrected after the lock: {amount} ({hours} h), {reason}; paid in the next period", { amount: a.delta_amount === null ? "—" : money.format(a.delta_amount), hours: formatHours(a.delta_minutes), reason: a.reason }) });
  if (!notes.length) return null;
  return (
    <ul className="mt-0.5 grid gap-0.5 text-xs">
      {notes.map((n, i) => (
        <li key={i} className={n.tone === "warn" ? "text-warn-fg" : "text-text-2"}>
          {n.text}
        </li>
      ))}
    </ul>
  );
}
