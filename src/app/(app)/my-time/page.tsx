import Link from "next/link";
import { JustifyForm } from "@/components/time-clock/justify-form";
import { CancelRequest, TimeOffRequestForm } from "@/components/time-clock/time-off-forms";
import { requireUser } from "@/lib/auth/session";
import { formatDate, formatDateTime, todayET } from "@/lib/dates";
import { myEmployeeIds } from "@/lib/field-day/load";
import { loadFieldDay } from "@/lib/field-day/return-card";
import { recordsDb } from "@/lib/records/data";
import { addDays } from "@/lib/schedule/dates";
import { loadOvertimeDays } from "@/lib/time-clock/overtime-flow";
import { STATUS_TEXT, type OvertimeStatus } from "@/lib/time-clock/overtime-rules";
import { balanceOf, fullDayMinutes, loadBanks, loadOffEntries, loadRequests } from "@/lib/time-clock/time-off-flow";
import { ABSENCE, bankHours, REQUEST_STATUS_TEXT, type OffRequest } from "@/lib/time-clock/time-off-rules";
import { formatHours } from "@/lib/time-clock/timesheet";
import { cn } from "@/lib/utils";
import { getT } from "@/i18n/server";

export async function generateMetadata() {
  return { title: (await getT())("My time") };
}

// OT-b / TO-a (Fred 2026-11-17): the person's own corner of the time clock: overtime days waiting for their
// justification and what the approver answered; their bank of hours; asking for time off and the answers. Everyone
// sees only their own records here (the database enforces it).

const OT_TONE: Record<OvertimeStatus, string> = { awaiting_justification: "bg-warn-bg text-warn-fg", pending: "bg-warn-bg text-warn-fg", approved: "bg-ok-bg text-ok-fg", refused: "bg-bad-bg text-bad-fg", void: "bg-muted text-text-2" };
const REQ_TONE: Record<OffRequest["status"], string> = { pending: "bg-warn-bg text-warn-fg", approved: "bg-ok-bg text-ok-fg", refused: "bg-bad-bg text-bad-fg", cancelled: "bg-muted text-text-2" };
const CARD = "rounded-2xl border bg-card px-[18px] py-4 shadow-card";

export default async function MyTimePage() {
  const tr = await getT();
  const user = await requireUser();
  const db = await recordsDb();
  const [employeeId] = await myEmployeeIds(db, user);
  const today = todayET();
  if (!employeeId)
    return (
      <div className="mx-auto max-w-[760px]">
        <h1 className="mb-2 text-[21px] font-semibold tracking-tight md:text-2xl">{tr("My time")}</h1>
        <p className="rounded-2xl border border-dashed bg-card px-6 py-10 text-center text-text-2">{tr("Your login isn't linked to an Employee record (same email). Ask the office to fix the employee's email.")}</p>
      </div>
    );

  const [overtime, requests, banks, off, full, settings] = await Promise.all([
    loadOvertimeDays(db, [employeeId], addDays(today, -60), today),
    loadRequests(db, { employeeIds: [employeeId], limit: 30 }),
    loadBanks(db, [employeeId]),
    loadOffEntries(db, [employeeId], addDays(today, -60), addDays(today, 120)),
    fullDayMinutes(db, employeeId, today),
    loadFieldDay(db),
  ]);
  const bank = balanceOf(banks.get(employeeId), today);
  const toJustify = overtime.filter((o) => o.status === "awaiting_justification");
  const others = overtime.filter((o) => o.status !== "awaiting_justification").reverse();
  const dow = (date: string) => new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", weekday: "short" }).format(new Date(`${date}T12:00:00Z`));
  const dayLabel = (date: string) => `${tr(dow(date))} ${formatDate(date)}`;
  const range = (r: Pick<OffRequest, "starts_on" | "ends_on">) => (r.starts_on === r.ends_on ? formatDate(r.starts_on) : `${formatDate(r.starts_on)} – ${formatDate(r.ends_on)}`);

  return (
    <div className="mx-auto grid max-w-[760px] gap-4 pb-24 md:pb-0">
      <div>
        <h1 className="text-[21px] font-semibold tracking-tight md:text-2xl">{tr("My time")}</h1>
        <p className="text-xs text-muted-foreground">
          {tr("Your overtime, your time off and your bank of hours. Only you and the office see this.")}{" "}
          <Link href="/#clock" className="text-primary hover:underline">
            {tr("Time clock")}
          </Link>
        </p>
      </div>

      {toJustify.length > 0 && (
        <section className={cn(CARD, "border-warn-fg/30 bg-warn-bg")}>
          <h2 className="mb-1 text-[15px] font-semibold tracking-tight text-warn-fg">{tr("Overtime to justify ({n})", { n: toJustify.length })}</h2>
          <p className="mb-3 text-xs text-warn-fg">{tr("Write why each day ran over. Without it the hours are refused by themselves after {h} hours.", { h: settings.overtime.justify_hours })}</p>
          <ul className="grid gap-3">
            {toJustify.map((o) => (
              <li key={o.id} className="rounded-xl bg-card p-3">
                <p className="mb-2 text-[13px]">
                  <b>{dayLabel(o.day)}</b> · {tr("{worked} worked, +{excess} over your day", { worked: formatHours(o.worked_minutes), excess: formatHours(o.excess_minutes) })}
                  {o.justify_due_at && <span className="block text-xs text-text-2">{tr("Answer by {when}", { when: formatDateTime(o.justify_due_at) })}</span>}
                </p>
                <JustifyForm id={o.id} />
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className={CARD}>
        <h2 className="mb-2 text-[15px] font-semibold tracking-tight">{tr("My overtime")}</h2>
        {others.length === 0 ? (
          <p className="text-sm text-text-2">{tr("No overtime in the last two months.")}</p>
        ) : (
          <ul className="divide-y text-[13px]">
            {others.map((o) => (
              <li key={o.id} className="grid gap-0.5 py-2">
                <div className="flex flex-wrap items-baseline gap-x-2">
                  <b className="tabular-nums">{dayLabel(o.day)}</b>
                  <span className={cn("tabular-nums", o.status === "refused" && "line-through")}>+{formatHours(o.excess_minutes)}</span>
                  <span className={cn("rounded px-1.5 text-[11px] font-medium", OT_TONE[o.status])}>{tr(STATUS_TEXT[o.status])}</span>
                </div>
                {o.justification && <p className="text-text-2">{o.justification}</p>}
                {o.decision_comment && (
                  <p>
                    <span className="text-text-2">{tr("Answer")}:</span> {tr(o.decision_comment)}
                  </p>
                )}
                {o.status === "refused" && <p className="text-xs text-bad-fg">{tr("Refused: these hours are not paid.")}</p>}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className={CARD}>
        <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-[15px] font-semibold tracking-tight">{tr("Time off")}</h2>
          <span className="text-sm">
            {tr("Bank")}: <b className={cn("tabular-nums", bank !== null && bank < 0 && "text-bad-fg")}>{bank === null ? tr("not set yet") : `${bankHours(bank)} h`}</b>
          </span>
        </div>
        <p className="mb-3 text-xs text-text-2">{tr("Paid and unpaid time off both take hours from your bank; only the paid one is paid. A weekday with no clock-in and no approved time off takes your full day from the bank, unpaid.")}</p>
        <TimeOffRequestForm today={today} fullDayMinutes={full} bankMinutes={bank} holidays={settings.time_off.holidays} />
      </section>

      <section className={CARD}>
        <h2 className="mb-2 text-[15px] font-semibold tracking-tight">{tr("My requests")}</h2>
        {requests.length === 0 ? (
          <p className="text-sm text-text-2">{tr("No requests yet.")}</p>
        ) : (
          <ul className="divide-y text-[13px]">
            {requests.map((r) => (
              <li key={r.id} className="grid gap-0.5 py-2">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <b className="tabular-nums">{range(r)}</b>
                  <span className="text-text-2">
                    {tr(r.policy)} · {r.minutes_per_day / 60} h
                  </span>
                  <span className={cn("rounded px-1.5 text-[11px] font-medium", REQ_TONE[r.status])}>{tr(REQUEST_STATUS_TEXT[r.status])}</span>
                  {r.status === "pending" && <CancelRequest id={r.id} approved={false} />}
                </div>
                <p className="text-text-2">{r.reason}</p>
                {r.decision_comment && (
                  <p>
                    <span className="text-text-2">{tr("Answer")}:</span> {r.decision_comment}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className={CARD}>
        <h2 className="mb-2 text-[15px] font-semibold tracking-tight">{tr("My days off")}</h2>
        {off.length === 0 ? (
          <p className="text-sm text-text-2">{tr("None in the last two months or ahead.")}</p>
        ) : (
          <ul className="divide-y text-[13px]">
            {off
              .slice()
              .reverse()
              .map((o) => (
                <li key={o.id} className="flex flex-wrap items-baseline gap-x-2 py-1.5">
                  <b className="tabular-nums">{dayLabel(o.day)}</b>
                  <span className={cn(o.kind === ABSENCE && "font-medium text-bad-fg")}>{tr(o.kind)}</span>
                  <span className="tabular-nums text-text-2">
                    {formatHours(o.minutes)} · {o.paid ? tr("paid") : tr("not paid")}
                  </span>
                </li>
              ))}
          </ul>
        )}
      </section>
    </div>
  );
}
