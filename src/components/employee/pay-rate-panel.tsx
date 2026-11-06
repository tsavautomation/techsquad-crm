import type { CurrentUser } from "@/lib/auth/session";
import { canSeeCosting, loadPayRates } from "@/lib/costing/load";
import { formatDate, todayET } from "@/lib/dates";
import { hoursAt, limitAt } from "@/lib/payroll/overtime";
import { loadGroupHours, loadOvertimeRates, loadPersonHours } from "@/lib/payroll/overtime-load";
import { recordsDb } from "@/lib/records/data";
import { getT } from "@/i18n/server";
import { hoursText, OvertimeRateForm, PersonHoursForm } from "./overtime-forms";
import { PayRateForm } from "./pay-rate-form";

// F13-a: the Pay rate panel on an Employee page, for people with the job costing key. A new row each
// time the rate changes; job costing uses the rate in force on each visit's day.
// OT (Fred 2026-11-05): the same card holds the overtime rate (never derived from the pay rate) and the person's
// own regular hours per day when they differ from the group's; Pay periods use the values in force on each day.

const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

export async function PayRatePanel({ employeeId, user }: { employeeId: number; user: CurrentUser }) {
  if (!canSeeCosting(user)) return null;
  const tr = await getT();
  const db = await recordsDb();
  const [rates, otRates, own, groups, { data: emp }] = await Promise.all([loadPayRates(db, [employeeId]), loadOvertimeRates(db, [employeeId]), loadPersonHours(db, [employeeId]), loadGroupHours(db), db.from("employees").select("clock_group").eq("id", employeeId).maybeSingle()]);
  const today = todayET();
  const current = rates.find((r) => r.effective_from <= today) ?? null;
  const currentOt = hoursAt(otRates, today);
  const group = (emp as { clock_group: string | null } | null)?.clock_group ?? "Field";
  const ownNow = hoursAt(own, today);
  const limit = limitAt(groups.filter((g) => g.clock_group === group), own, today);

  return (
    <section id="pay-rate" className="mb-4 scroll-mt-20 rounded-2xl border bg-card px-[18px] py-4 shadow-card">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-[15px] font-semibold tracking-tight">{tr("Pay rate")}</h2>
        <span className="text-xs text-text-2">{tr("Only people with the Job costing permission see this.")}</span>
      </div>
      <p className="text-sm">
        {current ? (
          <>
            <b className="text-lg tabular-nums">{money.format(current.hourly_rate)}</b> <span className="text-text-2">{tr("per hour, since {date}", { date: formatDate(current.effective_from) })}</span>
          </>
        ) : (
          <span className="text-warn-fg">{tr("No pay rate yet: this person's hours aren't costed on projects.")}</span>
        )}
      </p>
      <PayRateForm employeeId={employeeId} today={today} rates={rates.map((r) => ({ id: r.id, rate: r.hourly_rate, from: r.effective_from, note: r.note }))} />

      <h3 id="overtime-rate" className="mt-5 scroll-mt-20 text-[14px] font-semibold tracking-tight">{tr("Overtime rate")}</h3>
      <p className="text-sm">
        {currentOt ? (
          <>
            <b className="text-lg tabular-nums">{money.format(Number(currentOt.hourly_rate))}</b> <span className="text-text-2">{tr("per overtime hour, since {date}", { date: formatDate(currentOt.effective_from) })}</span>
          </>
        ) : (
          <span className="text-warn-fg">{tr("No overtime rate: overtime hours are paid at the pay rate, with a warning on Pay periods.")}</span>
        )}
      </p>
      <OvertimeRateForm employeeId={employeeId} today={today} rates={otRates.map((r) => ({ id: r.id, rate: Number(r.hourly_rate), from: r.effective_from, note: r.note }))} />

      <h3 className="mt-5 text-[14px] font-semibold tracking-tight">{tr("Regular hours")}</h3>
      <p className="text-sm">
        <b className="tabular-nums">{hoursText(limit.daily, limit.weekly, tr)}</b>{" "}
        <span className="text-text-2">{ownNow ? tr("this person's own value, since {date}; hours past it are overtime", { date: formatDate(ownNow.effective_from) }) : tr("the {group} group's value; set one below only if this person differs", { group: tr(group) })}</span>
      </p>
      <PersonHoursForm employeeId={employeeId} today={today} rows={own.map((r) => ({ id: r.id, daily: r.daily_minutes, weekly: r.weekly_minutes, from: r.effective_from, note: r.note }))} />
    </section>
  );
}
