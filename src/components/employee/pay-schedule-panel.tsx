import type { CurrentUser } from "@/lib/auth/session";
import { canSeeCosting } from "@/lib/costing/load";
import { formatDate, todayET } from "@/lib/dates";
import { loadAssignments, loadSchedules } from "@/lib/payroll/load";
import { periodFor, scheduleInForce } from "@/lib/payroll/periods";
import { recordsDb } from "@/lib/records/data";
import { getTable } from "@/registry";
import { canDo } from "@/registry/permissions";
import { getT } from "@/i18n/server";
import { PayScheduleForm } from "./pay-schedule-form";

// PS-a: the Pay schedule panel on an Employee page: which pay group the person is on, from when, with the
// history. People who may change Employees set it; Job costing readers see it.

export async function PaySchedulePanel({ employeeId, user }: { employeeId: number; user: CurrentUser }) {
  const canEdit = canDo(user.permissions, getTable("employees"), "modify", getTable);
  if (!canEdit && !canSeeCosting(user)) return null;
  const tr = await getT();
  const db = await recordsDb();
  const [schedules, links] = await Promise.all([loadSchedules(db), loadAssignments(db, [employeeId])]);
  const today = todayET();
  const currentId = scheduleInForce(links, employeeId, today);
  const current = currentId ? (schedules.find((s) => s.id === currentId) ?? null) : null;
  const since = links.find((l) => l.effective_from <= today)?.effective_from ?? null;
  const upcoming = links.filter((l) => l.effective_from > today).at(-1) ?? null;
  const period = current ? periodFor(current, today) : null;
  const name = (id: number | null) => (id === null ? tr("Not paid through pay periods") : (schedules.find((s) => s.id === id)?.name ?? `#${id}`));

  return (
    <section id="pay-schedule" className="mb-4 scroll-mt-20 rounded-2xl border bg-card px-[18px] py-4 shadow-card">
      <h2 className="mb-2 text-[15px] font-semibold tracking-tight">{tr("Pay schedule")}</h2>
      <p className="text-sm">
        {current && period ? (
          <>
            <b>{current.name}</b> <span className="text-text-2">{tr("since {date} · current period {from} – {to}, pay day {payDay}", { date: formatDate(since), from: formatDate(period.starts_on), to: formatDate(period.ends_on), payDay: formatDate(period.pay_day) })}</span>
          </>
        ) : (
          <span className="text-warn-fg">{tr("No pay schedule: this person's hours don't reach Pay periods.")}</span>
        )}
        {upcoming && <span className="block text-xs text-text-2">{tr("From {date}: {name}", { date: formatDate(upcoming.effective_from), name: name(upcoming.schedule_id) })}</span>}
      </p>
      <PayScheduleForm employeeId={employeeId} today={today} canEdit={canEdit} schedules={schedules.filter((s) => s.active || s.id === currentId).map((s) => ({ id: s.id, name: s.name }))} links={links.map((l) => ({ id: l.id, name: name(l.schedule_id), from: l.effective_from, note: l.note }))} />
    </section>
  );
}
