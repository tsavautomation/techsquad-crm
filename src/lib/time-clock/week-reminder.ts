import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { fromDateTimeLocalET, todayET } from "@/lib/dates";
import { notifyPush } from "@/lib/push/send";
import { addDays } from "@/lib/schedule/dates";
import { mondayOf } from "./timesheet";
import { approvalReminderMessage } from "./week-approval";

// TC-h: Monday's first daily tick. If last week still has people with hours and no approved week, the
// approvers whose logins asked for "Timesheets waiting for approval" get one push (the tick runs once a day,
// so it cannot repeat; the message opens the timesheets filtered to Open).

export async function remindOpenTimesheets(db: SupabaseClient, today: string = todayET()): Promise<{ week: string; open: number; sent: number }> {
  const monday = addDays(mondayOf(today), -7);
  const { data: ent } = await db
    .from("time_entries")
    .select("employee_id")
    .eq("kind", "clock_in")
    .gte("at", fromDateTimeLocalET(`${monday}T00:00`))
    .lt("at", fromDateTimeLocalET(`${addDays(monday, 7)}T00:00`))
    .is("deleted_at", null);
  const worked = new Set(((ent ?? []) as { employee_id: number }[]).map((e) => e.employee_id));
  if (!worked.size) return { week: monday, open: 0, sent: 0 };
  const { data: weeks } = await db.from("timesheet_weeks").select("employee_id").eq("monday", monday).eq("status", "Approved").in("employee_id", [...worked]);
  for (const w of (weeks ?? []) as { employee_id: number }[]) worked.delete(w.employee_id);
  if (!worked.size) return { week: monday, open: 0, sent: 0 };
  const r = await notifyPush("timesheets_to_approve", approvalReminderMessage({ monday, open: worked.size }));
  return { week: monday, open: worked.size, sent: r.sent };
}
