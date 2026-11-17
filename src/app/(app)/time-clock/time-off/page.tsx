import Link from "next/link";
import { notFound } from "next/navigation";
import { ClockTabs } from "@/components/time-clock/clock-tabs";
import { BankAdjust, CancelRequest, RequestDecision, TimeOffRequestForm } from "@/components/time-clock/time-off-forms";
import { requireUser } from "@/lib/auth/session";
import { formatDate, formatDateTime, todayET } from "@/lib/dates";
import { loadFieldDay } from "@/lib/field-day/return-card";
import { limitAt } from "@/lib/payroll/overtime";
import { loadGroupHours, loadPersonHours } from "@/lib/payroll/overtime-load";
import { recordsDb } from "@/lib/records/data";
import { addDays } from "@/lib/schedule/dates";
import { canApproveTimesheets } from "@/lib/time-clock/approval-status";
import { balanceOf, loadBanks, loadOffEntries, loadRequests } from "@/lib/time-clock/time-off-flow";
import { ABSENCE, bankHours, REQUEST_STATUS_TEXT, requestDays, type OffRequest } from "@/lib/time-clock/time-off-rules";
import { formatHours } from "@/lib/time-clock/timesheet";
import { cn } from "@/lib/utils";
import { getT } from "@/i18n/server";

export async function generateMetadata() {
  return { title: (await getT())("Time off") };
}

// TO-a Time off (Fred 2026-11-17, Connecteam style): the requests waiting for Saulo or Jessica, who is out on each
// day, each person's bank of hours (opening balance and adjustments by Jessica) and time off entered directly.
// Two policies, paid and unpaid; both take hours from the same bank. A weekday with no clock-in and no time off
// is an absence without a request: the full day leaves the bank, unpaid.

const STATUS_TONE: Record<OffRequest["status"], string> = { pending: "bg-warn-bg text-warn-fg", approved: "bg-ok-bg text-ok-fg", refused: "bg-bad-bg text-bad-fg", cancelled: "bg-muted text-text-2" };

export default async function TimeOffPage() {
  const tr = await getT();
  const user = await requireUser();
  if (!user.permissions.has("administrative.employees.view_all")) notFound();
  const canDecide = canApproveTimesheets(user);
  const canBank = user.isSysadmin || user.permissions.has("administrative.time_off.bank");
  const today = todayET();
  const db = await recordsDb();

  const { data: emp } = await db.from("employees").select("id, title, clock_group, status, must_clock_in").is("deleted_at", null).order("title");
  const everyone = (emp ?? []) as { id: number; title: string | null; clock_group: string | null; status: string | null; must_clock_in: boolean }[];
  const staff = everyone.filter((p) => p.must_clock_in && (p.status === "Active" || p.status === "Reports"));
  const ids = staff.map((p) => p.id);
  const nameOf = new Map(everyone.map((p) => [p.id, p.title ?? `#${p.id}`]));
  const [pending, recent, banks, out, settings, groupHours, ownHours] = await Promise.all([
    loadRequests(db, { status: "pending" }),
    loadRequests(db, { limit: 40 }),
    loadBanks(db, ids),
    loadOffEntries(db, null, addDays(today, -7), addDays(today, 60)),
    loadFieldDay(db),
    loadGroupHours(db),
    loadPersonHours(db, ids),
  ]);
  const fullDay = (id: number) => limitAt(groupHours.filter((g) => g.clock_group === (everyone.find((p) => p.id === id)?.clock_group ?? "Field")), ownHours.filter((o) => o.employee_id === id), today).daily;
  const balance = (id: number) => balanceOf(banks.get(id), today);
  const deciders = [...new Set(recent.map((r) => r.decided_by).filter((x): x is string => Boolean(x)))];
  const { data: profiles } = deciders.length ? await db.from("profiles").select("id, first_name, last_name").in("id", deciders) : { data: [] };
  const whoOf = new Map(((profiles ?? []) as { id: string; first_name: string | null; last_name: string | null }[]).map((p) => [p.id, [p.first_name, p.last_name].filter(Boolean).join(" ")]));
  const range = (r: Pick<OffRequest, "starts_on" | "ends_on">) => (r.starts_on === r.ends_on ? formatDate(r.starts_on) : `${formatDate(r.starts_on)} – ${formatDate(r.ends_on)}`);
  const taking = (r: OffRequest) => requestDays(r.starts_on, r.ends_on, settings.time_off.holidays).length * r.minutes_per_day;
  const dow = (date: string) => new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", weekday: "short" }).format(new Date(`${date}T12:00:00Z`));
  const outByDay = [...Map.groupBy(out, (o) => o.day)].sort((a, b) => (a[0] < b[0] ? -1 : 1));
  const negative = staff.filter((p) => (balance(p.id) ?? 0) < 0);

  return (
    <div className="mx-auto max-w-[1100px]">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[21px] font-semibold tracking-tight md:text-2xl">{tr("Time clock")}</h1>
          <p className="text-xs text-muted-foreground">{tr("Time off: paid or unpaid, both taken from the person's bank of hours. A weekday with no clock-in and no time off is an absence without a request: the full day leaves the bank, unpaid.")}</p>
        </div>
        <ClockTabs current="time-off" />
      </div>

      {negative.length > 0 && (
        <p className="mb-3 rounded-lg bg-bad-bg px-3 py-2 text-[13px] text-bad-fg">
          {tr("Bank below zero:")} {negative.map((p) => `${p.title ?? `#${p.id}`} (${bankHours(balance(p.id)!)} h)`).join(" · ")}
        </p>
      )}

      <h2 className="mb-2 text-[15px] font-semibold tracking-tight">{tr("Requests to answer ({n})", { n: pending.length })}</h2>
      {pending.length === 0 ? (
        <p className="mb-6 rounded-2xl border border-dashed bg-card px-6 py-6 text-center text-sm text-text-2">{tr("No request waiting.")}</p>
      ) : (
        <ul className="mb-6 grid gap-3">
          {pending.map((r) => {
            const bank = balance(r.employee_id);
            return (
              <li key={r.id} className="grid gap-1.5 rounded-2xl border bg-card px-[18px] py-3 text-[13px] shadow-card">
                <div className="flex flex-wrap items-baseline gap-x-3">
                  <Link href={`/time-clock/people/${r.employee_id}?day=${r.starts_on}`} className="text-[15px] font-semibold tracking-tight hover:underline">
                    {nameOf.get(r.employee_id) ?? `#${r.employee_id}`}
                  </Link>
                  <span className={cn("rounded px-1.5 text-[11px] font-medium", r.policy === "Paid absence" ? "bg-ok-bg text-ok-fg" : "bg-muted text-text-2")}>{tr(r.policy)}</span>
                  <span className="font-medium tabular-nums">{range(r)}</span>
                  <span className="tabular-nums text-text-2">{tr("{h} h per day · {total} h in all", { h: r.minutes_per_day / 60, total: bankHours(taking(r)) })}</span>
                </div>
                <p>
                  <span className="text-text-2">{tr("Reason")}:</span> {r.reason}
                </p>
                <p className="text-xs text-text-2">
                  {bank === null ? tr("The bank has no opening balance yet.") : tr("Bank now {now} h, after {after} h", { now: bankHours(bank), after: bankHours(bank - taking(r)) })}
                  {" · "}
                  {tr("asked on {when}", { when: formatDateTime(r.created_at) })}
                </p>
                {canDecide && <RequestDecision id={r.id} />}
              </li>
            );
          })}
        </ul>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <section>
          <h2 className="mb-2 text-[15px] font-semibold tracking-tight">{tr("Who is out")}</h2>
          {outByDay.length === 0 ? (
            <p className="rounded-2xl border border-dashed bg-card px-6 py-6 text-center text-sm text-text-2">{tr("Nobody out in the last week or the next two months.")}</p>
          ) : (
            <ul className="divide-y rounded-2xl border bg-card text-[13px] shadow-card">
              {outByDay.map(([day, list]) => (
                <li key={day} className={cn("flex gap-3 px-3 py-2", day === today && "bg-primary/5", day < today && "text-text-2")}>
                  <span className="w-[88px] shrink-0 font-medium tabular-nums">
                    {tr(dow(day))} {formatDate(day).replace(/\/\d{4}$/, "")}
                  </span>
                  <span className="min-w-0">
                    {list.map((o, i) => (
                      <span key={o.id}>
                        {i > 0 && " · "}
                        <Link href={`/time-clock/people/${o.employee_id}?day=${o.day}#d-${o.day}`} className={cn("hover:underline", o.kind === ABSENCE && "font-medium text-bad-fg")}>
                          {nameOf.get(o.employee_id) ?? `#${o.employee_id}`}
                        </Link>{" "}
                        <span className="text-xs text-text-2">
                          {o.kind === ABSENCE ? tr("absent, no request") : o.paid ? tr("paid") : tr("unpaid")} {formatHours(o.minutes)}
                        </span>
                      </span>
                    ))}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section>
          <h2 className="mb-2 text-[15px] font-semibold tracking-tight">{tr("Bank of hours")}</h2>
          <ul className="divide-y rounded-2xl border bg-card text-[13px] shadow-card">
            {staff.map((p) => {
              const bank = banks.get(p.id);
              const b = balance(p.id);
              return (
                <li key={p.id} className="px-3 py-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <Link href={`/time-clock/people/${p.id}?day=${today}`} className="font-medium hover:underline">
                      {p.title ?? `#${p.id}`}
                    </Link>
                    <span className="flex items-center gap-2">
                      <b className={cn("tabular-nums", b !== null && b < 0 && "text-bad-fg")}>{b === null ? tr("not set") : `${bankHours(b)} h`}</b>
                      {canBank && <BankAdjust employeeId={p.id} today={today} hasOpening={Boolean(bank?.rows.length)} />}
                    </span>
                  </div>
                  {bank && bank.rows.length > 0 && (
                    <details className="mt-1 text-xs text-text-2">
                      <summary className="cursor-pointer">{tr("History ({n})", { n: bank.rows.length })}</summary>
                      <ul className="mt-1 grid gap-0.5">
                        {bank.rows.map((r) => (
                          <li key={r.id} className="tabular-nums">
                            {formatDate(r.day)} · {r.delta_minutes > 0 ? "+" : ""}
                            {bankHours(r.delta_minutes)} h · {r.kind === "opening" ? tr("opening balance") : tr("adjustment")}: {r.reason}
                          </li>
                        ))}
                      </ul>
                    </details>
                  )}
                </li>
              );
            })}
          </ul>
          <p className="mt-1 text-xs text-text-2">{tr("The balance is the opening balance and the adjustments minus every time-off hour taken since the opening date. Nothing accrues by itself.")}</p>
        </section>
      </div>

      {canDecide && (
        <section className="mt-6 rounded-2xl border bg-card px-[18px] py-4 shadow-card">
          <h2 className="mb-2 text-[15px] font-semibold tracking-tight">{tr("Enter time off for someone")}</h2>
          <TimeOffRequestForm today={today} fullDayMinutes={540} bankMinutes={null} holidays={settings.time_off.holidays} people={staff.map((p) => ({ id: p.id, name: p.title ?? `#${p.id}`, fullDayMinutes: fullDay(p.id), bankMinutes: balance(p.id) }))} />
        </section>
      )}

      <h2 className="mt-6 mb-2 text-[15px] font-semibold tracking-tight">{tr("Latest requests")}</h2>
      {recent.length === 0 ? (
        <p className="rounded-2xl border border-dashed bg-card px-6 py-6 text-center text-sm text-text-2">{tr("No requests yet.")}</p>
      ) : (
        <ul className="divide-y rounded-2xl border bg-card text-[13px] shadow-card">
          {recent.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2">
              <span className="font-medium">{nameOf.get(r.employee_id) ?? `#${r.employee_id}`}</span>
              <span className="tabular-nums">{range(r)}</span>
              <span className="text-text-2">
                {tr(r.policy)} · {r.minutes_per_day / 60} h
              </span>
              <span className={cn("rounded px-1.5 text-[11px] font-medium", STATUS_TONE[r.status])}>{tr(REQUEST_STATUS_TEXT[r.status])}</span>
              <span className="min-w-0 flex-1 truncate text-xs text-text-2">
                {r.direct ? tr("entered by {who}", { who: (r.decided_by && whoOf.get(r.decided_by)) || tr("Someone") }) : r.decided_by ? tr("by {who}", { who: whoOf.get(r.decided_by) || tr("Someone") }) : ""}
                {r.decision_comment ? ` · ${r.decision_comment}` : ""}
                {` · ${r.reason}`}
              </span>
              {canDecide && r.status === "approved" && <CancelRequest id={r.id} approved />}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
