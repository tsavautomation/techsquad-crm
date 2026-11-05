import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { fromDateTimeLocalET, todayET } from "@/lib/dates";
import { loadOverrides } from "@/lib/payroll/load";
import { periodEnded, previousPeriod, type Period } from "@/lib/payroll/periods";
import { notifyPush } from "@/lib/push/send";
import { addDays } from "@/lib/schedule/dates";
import { approvalGroups, periodsAt } from "./approval-status";
import { approvalReminderMessage } from "./period-approval";

// TS-c: Monday's first daily tick. For each group that needs the approval (the Field), the people whose last
// two ended pay periods have hours and no approval get counted, and the approvers whose logins asked for
// "Timesheets waiting for approval" get one push per group (the tick runs once a day, so it cannot repeat;
// the message opens the timesheets filtered to that group and Open).

export async function remindOpenTimesheets(db: SupabaseClient, today: string = todayET()): Promise<{ groups: Record<string, { open: number; sent: number }> }> {
  const groups: Record<string, { open: number; sent: number }> = {};
  const yesterday = addDays(today, -1);
  for (const group of await approvalGroups(db)) {
    const { data: emp } = await db.from("employees").select("id, clock_group").is("deleted_at", null).in("status", ["Active", "Reports"]).eq("must_clock_in", true);
    const ids = ((emp ?? []) as { id: number; clock_group: string | null }[]).filter((e) => (e.clock_group ?? "Field") === group).map((e) => e.id);
    const periods = await periodsAt(db, ids, yesterday);
    // The last two ended periods of each person (the one containing yesterday when it has ended, else the one before, and the one before that).
    const wanted: { employeeId: number; period: Period }[] = [];
    for (const [employeeId, { schedule, period }] of periods) {
      const overrides = await loadOverrides(db, schedule.id);
      let p = periodEnded(period, today) ? period : previousPeriod(period, schedule, overrides);
      for (let i = 0; i < 2; i++) {
        wanted.push({ employeeId, period: p });
        p = previousPeriod(p, schedule, overrides);
      }
    }
    if (!wanted.length) {
      groups[group] = { open: 0, sent: 0 };
      continue;
    }
    const from = wanted.reduce((a, w) => (w.period.starts_on < a ? w.period.starts_on : a), wanted[0].period.starts_on);
    const to = wanted.reduce((a, w) => (w.period.ends_on > a ? w.period.ends_on : a), wanted[0].period.ends_on);
    const [{ data: ent }, { data: approved }] = await Promise.all([
      db.from("time_entries").select("employee_id, at").eq("kind", "clock_in").in("employee_id", ids).gte("at", fromDateTimeLocalET(`${from}T00:00`)).lt("at", fromDateTimeLocalET(`${addDays(to, 1)}T00:00`)).is("deleted_at", null),
      db.from("timesheet_periods").select("employee_id, starts_on").eq("status", "Approved").in("employee_id", ids).gte("starts_on", from),
    ]);
    const done = new Set(((approved ?? []) as { employee_id: number; starts_on: string }[]).map((r) => `${r.employee_id}:${r.starts_on}`));
    const clockIns = ((ent ?? []) as { employee_id: number; at: string }[]).map((e) => ({ employee_id: e.employee_id, day: new Date(e.at).toLocaleDateString("en-CA", { timeZone: "America/New_York" }) }));
    const open = new Set<number>();
    let oldest = to;
    for (const w of wanted) {
      if (done.has(`${w.employeeId}:${w.period.starts_on}`)) continue;
      if (!clockIns.some((c) => c.employee_id === w.employeeId && c.day >= w.period.starts_on && c.day <= w.period.ends_on)) continue;
      open.add(w.employeeId);
      if (w.period.ends_on < oldest) oldest = w.period.ends_on;
    }
    if (!open.size) {
      groups[group] = { open: 0, sent: 0 };
      continue;
    }
    const r = await notifyPush("timesheets_to_approve", approvalReminderMessage({ open: open.size, group, oldest }));
    groups[group] = { open: open.size, sent: r.sent };
  }
  return { groups };
}
