"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { requireUser } from "@/lib/auth/session";
import { runAutomationsSafely } from "@/lib/engine/automations";
import { recordsDb } from "@/lib/records/data";
import { getTable } from "@/registry";
import { tableHref } from "@/registry/routes";
import type { EntryKind, Geo } from "@/lib/time-clock/clock";
import { geocode } from "@/lib/time-clock/geocode";
import { myClockToday, recordEntry } from "@/lib/time-clock/record";
import { fromDateTimeLocalET, todayET } from "@/lib/dates";
import { addDays } from "@/lib/schedule/dates";
import { myEmployeeIds } from "./load";
import { FieldDaySchema, type FieldDaySettings } from "./day";

// F2 Field day actions. Check-in steps go through public.visit_step (only the people going, or
// whoever may change visits); settings through app_settings (Form designers, as Form settings).

/** F20-d: `askClockOut` is set when the check-out was the person's last visit of the day and they are still clocked in. */
export type StepResult = { ok: true; next?: string; askClockOut?: boolean } | { ok: false; message: string };
type Step = "on_way" | "check_in" | "check_out";

const ENTRY_KIND: Record<Step, EntryKind> = { on_way: "on_way", check_in: "visit_in", check_out: "visit_out" };

/** `geo` is the phone's position when the button was pressed (P2 time clock); null when not available. */
export async function visitStepAction(id: number, step: Step, geo: Geo | null = null): Promise<StepResult> {
  const user = await requireUser();
  if (!Number.isInteger(id) || !["on_way", "check_in", "check_out"].includes(step)) return { ok: false, message: "Unknown step." };
  const db = await recordsDb();
  const { data, error } = await db.rpc("visit_step", { p_id: id, p_step: step });
  if (error) return { ok: false, message: error.code === "42501" || error.code === "P0002" || error.code === "22023" ? error.message : "Could not save. Check your connection and try again." };
  // The time entry with the position; a missing Employee record just leaves the step without one.
  const here = geo && Number.isFinite(geo.lat) && Number.isFinite(geo.lng) ? { lat: geo.lat, lng: geo.lng, accuracy_m: geo.accuracy_m != null && Number.isFinite(geo.accuracy_m) ? Math.round(geo.accuracy_m) : null } : null;
  await recordEntry(db, user, ENTRY_KIND[step], here, id).catch(() => undefined);
  after(runAutomationsSafely);
  revalidatePath("/");
  revalidatePath("/schedule", "layout");
  if (step !== "check_out") return { ok: true };

  // Check-out opens the Job Report, filled in from the visit.
  const v = data as { project_id: number | null; technician_id: number | null };
  const { data: team } = await db.from("visits_team").select("target_id").eq("record_id", id);
  const people = [v.technician_id, ...((team ?? []) as { target_id: number }[]).map((x) => x.target_id)].filter((x): x is number => typeof x === "number");
  const q = new URLSearchParams({ visit_id: String(id), back: "/" });
  if (v.project_id) q.set("project_id", String(v.project_id));
  if (people.length) q.set("team_ids", [...new Set(people)].join(","));
  return { ok: true, next: `${tableHref(getTable("job_reports"))}/new?${q}`, askClockOut: await lastVisitWhileClockedIn(db, user, id) };
}

// F20-d (Fred 2026-10-14, "many people are not clocking out, because they think left the job may be the same"):
// true when the person is clocked in and has no other visit today still to do.
async function lastVisitWhileClockedIn(db: Awaited<ReturnType<typeof recordsDb>>, user: Awaited<ReturnType<typeof requireUser>>, visitId: number): Promise<boolean> {
  try {
    const mine = await myClockToday(db, user);
    if (!mine?.day.openSince) return false;
    const people = await myEmployeeIds(db, user);
    if (!people.length) return false;
    const today = todayET();
    const { data: team } = await db.from("visits_team").select("record_id").in("target_id", people);
    const teamIds = ((team ?? []) as { record_id: number }[]).map((x) => x.record_id);
    const or = [`technician_id.in.(${people.join(",")})`, teamIds.length ? `id.in.(${teamIds.join(",")})` : null].filter(Boolean).join(",");
    const { count } = await db
      .from("visits")
      .select("id", { count: "exact", head: true })
      .or(or)
      .gte("starts_at", fromDateTimeLocalET(`${today}T00:00`))
      .lt("starts_at", fromDateTimeLocalET(`${addDays(today, 1)}T00:00`))
      .not("status", "in", "(Done,Cancelled)")
      .neq("id", visitId)
      .is("deleted_at", null);
    return (count ?? 0) === 0;
  } catch {
    return false;
  }
}

export async function saveFieldDayAction(input: FieldDaySettings): Promise<{ ok: true } | { ok: false; message: string }> {
  await requireUser();
  const parsed = FieldDaySchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Please check the values." };
  const clean = parsed.data;
  // Tidy the lists: no blank lines, no repeats.
  for (const list of Object.values(clean.service_lists)) {
    list.checklist = [...new Set(list.checklist.map((x) => x.trim()).filter(Boolean))];
    list.tools = [...new Set(list.tools.map((x) => x.trim()).filter(Boolean))];
  }
  const db = await recordsDb();
  // P2: the office address is looked up once so "at the office" can be worked out.
  if (clean.time_clock.office_address && (clean.time_clock.office_lat === null || clean.time_clock.office_lng === null)) {
    const g = await geocode(db, clean.time_clock.office_address);
    if (g) Object.assign(clean.time_clock, { office_lat: g.lat, office_lng: g.lng });
  }
  const { error } = await db.from("app_settings").upsert({ key: "field_day", value: clean });
  if (error) return { ok: false, message: /row-level security|permission/i.test(error.message) ? "You don't have permission to do that." : error.message };
  revalidatePath("/admin/field-day");
  return { ok: true };
}
