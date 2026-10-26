import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { fromDateTimeLocalET, todayET } from "@/lib/dates";
import { loadFieldDay } from "@/lib/field-day/return-card";
import { buildTitle } from "@/lib/records/title";
import { addDays } from "@/lib/schedule/dates";
import { getTable } from "@/registry";
import { overtimeDays, overtimeDetails, overtimeMarker } from "./overtime-engine";
import { mondayOf, type SheetEntry } from "./timesheet";

// J-t Overtime approval (Jessica via Fred 2026-10-26; the pure part is in overtime-engine.ts): when a week closes (the first daily tick of Monday), every
// field person who worked more than 9 hours on a day of that week gets ONE task for the approver (Saulo) listing
// those days: times, total and the excess. The task is the "waiting for approval" state; the marker in its
// details keeps a week from being raised twice.

/**
 * Raises the week's overtime tasks once. `today` is a Monday normally (the first tick of the week); any day works
 * and closes the week before it. Returns what it did.
 */
export async function raiseOvertimeTasks(db: SupabaseClient, today: string = todayET(), now: number = Date.now()): Promise<{ week: string; people: number; raised: number[]; skipped: string[] }> {
  const monday = addDays(mondayOf(today), -7);
  const settings = await loadFieldDay(db);
  const approver = settings.overtime_approver_employee_id;
  const raised: number[] = [];
  const skipped: string[] = [];
  const { data: emp } = await db.from("employees").select("id, title, clock_group, status, must_clock_in").is("deleted_at", null).in("status", ["Active", "Reports", "Freelance"]).eq("must_clock_in", true);
  const field = ((emp ?? []) as { id: number; title: string | null; clock_group: string | null; status: string | null }[]).filter((e) => (e.clock_group ?? "Field") === "Field");
  if (!field.length) return { week: monday, people: 0, raised, skipped };
  const { data: ent } = await db
    .from("time_entries")
    .select("id, employee_id, kind, at, note, reviewed_at, auto_closed")
    .in("employee_id", field.map((e) => e.id))
    .in("kind", ["clock_in", "clock_out"])
    .gte("at", fromDateTimeLocalET(`${monday}T00:00`))
    .lt("at", fromDateTimeLocalET(`${addDays(monday, 8)}T00:00`))
    .is("deleted_at", null)
    .order("at");
  const byPerson = Map.groupBy((ent ?? []) as (SheetEntry & { employee_id: number })[], (e) => e.employee_id);
  for (const person of field) {
    const days = overtimeDays(byPerson.get(person.id) ?? [], monday, now);
    if (!days.length) continue;
    const marker = overtimeMarker(person.id, monday);
    const { data: have } = await db.from("tasks").select("id").like("details", `%${marker}%`).is("deleted_at", null).limit(1);
    if (have?.length) {
      skipped.push(`${person.title}: already raised`);
      continue;
    }
    const values: Record<string, unknown> = {
      member_id: approver,
      status: "Pending",
      priority: null,
      due_date: addDays(today, 2),
      details: `${overtimeDetails(person.title ?? `#${person.id}`, monday, days)}\n${marker}`,
      labels: ["Overtime"],
    };
    values.title = await buildTitle(getTable("tasks"), values, null, db);
    const { data: task, error } = await db.from("tasks").insert(values).select("id").single();
    if (error) skipped.push(`${person.title}: ${error.message}`);
    else raised.push((task as { id: number }).id);
  }
  return { week: monday, people: field.length, raised, skipped };
}
