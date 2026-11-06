"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser, type CurrentUser } from "@/lib/auth/session";
import { canSeeCosting } from "@/lib/costing/load";
import { recordsDb } from "@/lib/records/data";
import { getTable } from "@/registry";
import { recordHref } from "@/registry/routes";
import { recordLockedTripChange } from "./lock";

// OT Overtime (Fred 2026-11-05): the overtime rate and the regular-hours override of a person (Job costing, like
// the pay rate), the regular hours per time-clock group (Job costing) and the work trips (Employees › Modify or
// Job costing). The database policies enforce the same.

type Result = { ok: true } | { ok: false; message: string };
const DENIED_MESSAGE = "You don't have permission to do that.";
const DENIED: Result = { ok: false, message: DENIED_MESSAGE };
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const dbError = (message: string): Result => ({ ok: false, message: /row-level security/i.test(message) ? DENIED_MESSAGE : message });
const employeePage = (id: number) => recordHref(getTable("employees"), id);
const canEditTrips = (user: CurrentUser) => canSeeCosting(user) || user.permissions.has("administrative.employees.modify");

// ---------------------------------------------------------------- overtime rate (per person, history)

const RateInput = z.object({
  rate: z.coerce.number().min(0, "The rate can't be negative.").max(10000, "That rate looks wrong."),
  from: z.string().regex(DATE, "Pick the date the rate starts."),
  note: z.string().trim().max(200).optional(),
});

export async function setOvertimeRateAction(employeeId: number, input: z.input<typeof RateInput>): Promise<Result> {
  const me = await requireUser();
  if (!canSeeCosting(me)) return DENIED;
  const parsed = RateInput.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message };
  const db = await recordsDb();
  const { error } = await db.from("employee_overtime_rates").upsert({ employee_id: employeeId, hourly_rate: parsed.data.rate, effective_from: parsed.data.from, note: parsed.data.note || null, created_by: me.id }, { onConflict: "employee_id,effective_from" });
  if (error) return dbError(error.message);
  revalidatePath(employeePage(employeeId));
  revalidatePath("/pay-periods");
  return { ok: true };
}

export async function deleteOvertimeRateAction(employeeId: number, rateId: number): Promise<Result> {
  const me = await requireUser();
  if (!canSeeCosting(me)) return DENIED;
  const db = await recordsDb();
  const { data, error } = await db.from("employee_overtime_rates").delete().eq("id", rateId).eq("employee_id", employeeId).select("id");
  if (error) return { ok: false, message: error.message };
  if (!data?.length) return DENIED;
  revalidatePath(employeePage(employeeId));
  revalidatePath("/pay-periods");
  return { ok: true };
}

// ---------------------------------------------------------------- regular hours (group, and a person's override)

const HoursInput = z.object({
  daily: z.coerce.number().min(1, "Give the regular hours per day.").max(24, "A day has 24 hours."),
  weekly: z.union([z.literal(""), z.coerce.number().min(1).max(168, "A week has 168 hours.")]).optional(),
  from: z.string().regex(DATE, "Pick the date it starts."),
  note: z.string().trim().max(200).optional(),
});
export type HoursInput = z.input<typeof HoursInput>;

function hoursRow(v: z.output<typeof HoursInput>) {
  return { daily_minutes: Math.round(v.daily * 60), weekly_minutes: v.weekly === "" || v.weekly === undefined ? null : Math.round(v.weekly * 60), effective_from: v.from, note: v.note || null };
}

export async function setGroupHoursAction(group: string, input: HoursInput): Promise<Result> {
  const me = await requireUser();
  if (!canSeeCosting(me)) return DENIED;
  if (group !== "Field" && group !== "Office") return { ok: false, message: "Pick the group." };
  const parsed = HoursInput.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message };
  const db = await recordsDb();
  const { error } = await db.from("clock_group_hours").upsert({ clock_group: group, ...hoursRow(parsed.data), created_by: me.id }, { onConflict: "clock_group,effective_from" });
  if (error) return dbError(error.message);
  revalidatePath("/pay-periods");
  revalidatePath("/time-clock", "layout");
  return { ok: true };
}

export async function deleteGroupHoursAction(id: number): Promise<Result> {
  const me = await requireUser();
  if (!canSeeCosting(me)) return DENIED;
  const db = await recordsDb();
  const { count } = await db.from("clock_group_hours").select("id", { count: "exact", head: true });
  if ((count ?? 0) <= 2) return { ok: false, message: "Each group keeps at least one value." };
  const { data, error } = await db.from("clock_group_hours").delete().eq("id", id).select("id");
  if (error) return { ok: false, message: error.message };
  if (!data?.length) return DENIED;
  revalidatePath("/pay-periods");
  revalidatePath("/time-clock", "layout");
  return { ok: true };
}

export async function setPersonHoursAction(employeeId: number, input: HoursInput): Promise<Result> {
  const me = await requireUser();
  if (!canSeeCosting(me)) return DENIED;
  const parsed = HoursInput.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message };
  const db = await recordsDb();
  const { error } = await db.from("employee_daily_hours").upsert({ employee_id: employeeId, ...hoursRow(parsed.data), created_by: me.id }, { onConflict: "employee_id,effective_from" });
  if (error) return dbError(error.message);
  revalidatePath(employeePage(employeeId));
  revalidatePath("/pay-periods");
  return { ok: true };
}

export async function deletePersonHoursAction(employeeId: number, id: number): Promise<Result> {
  const me = await requireUser();
  if (!canSeeCosting(me)) return DENIED;
  const db = await recordsDb();
  const { data, error } = await db.from("employee_daily_hours").delete().eq("id", id).eq("employee_id", employeeId).select("id");
  if (error) return { ok: false, message: error.message };
  if (!data?.length) return DENIED;
  revalidatePath(employeePage(employeeId));
  revalidatePath("/pay-periods");
  return { ok: true };
}

// ---------------------------------------------------------------- work trips

const TripInput = z
  .object({
    id: z.number().int().positive().nullable(),
    employeeIds: z.array(z.number().int().positive()).min(1, "Pick at least one person."),
    starts_on: z.string().regex(DATE, "Pick the first day of the trip."),
    ends_on: z.string().regex(DATE, "Pick the last day of the trip."),
    premium_pct: z.coerce.number().min(0, "The premium can't be negative.").max(200, "That premium looks wrong."),
    project_id: z.number().int().positive().nullable(),
    destination: z.string().trim().max(200).optional(),
    note: z.string().trim().max(500).optional(),
  })
  .refine((v) => v.ends_on >= v.starts_on, { message: "The last day comes before the first.", path: ["ends_on"] });
export type TripInput = z.input<typeof TripInput>;

/** Add a trip for one or several people (one row each), or change one trip (`id`). Days of an approved period become an adjustment. */
export async function saveWorkTripAction(input: TripInput): Promise<Result & { adjusted?: number }> {
  const me = await requireUser();
  if (!canEditTrips(me)) return DENIED;
  const parsed = TripInput.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message };
  const v = parsed.data;
  const db = await recordsDb();
  const row = { starts_on: v.starts_on, ends_on: v.ends_on, premium_pct: v.premium_pct, project_id: v.project_id, destination: v.destination || null, note: v.note || null };
  const touched: { employeeId: number; from: string; to: string }[] = [];
  if (v.id) {
    const { data: before } = await db.from("work_trips").select("employee_id, starts_on, ends_on").eq("id", v.id).maybeSingle();
    if (!before) return { ok: false, message: "Trip not found." };
    const b = before as { employee_id: number; starts_on: string; ends_on: string };
    const { error } = await db.from("work_trips").update({ ...row, updated_by: me.id }).eq("id", v.id);
    if (error) return tripError(error.message);
    touched.push({ employeeId: b.employee_id, from: b.starts_on < v.starts_on ? b.starts_on : v.starts_on, to: b.ends_on > v.ends_on ? b.ends_on : v.ends_on });
  } else {
    const { error } = await db.from("work_trips").insert(v.employeeIds.map((employee_id) => ({ employee_id, ...row, created_by: me.id })));
    if (error) return tripError(error.message);
    for (const employeeId of v.employeeIds) touched.push({ employeeId, from: v.starts_on, to: v.ends_on });
  }
  let adjusted = 0;
  for (const t of touched) adjusted += await recordLockedTripChange(db, me, t.employeeId, t.from, t.to, `Work trip ${v.starts_on} – ${v.ends_on} (${v.premium_pct}%) set after the lock`);
  for (const t of touched) revalidatePath(employeePage(t.employeeId));
  revalidatePath("/pay-periods");
  revalidatePath("/time-clock", "layout");
  return { ok: true, adjusted };
}

export async function deleteWorkTripAction(id: number): Promise<Result & { adjusted?: number }> {
  const me = await requireUser();
  if (!canEditTrips(me)) return DENIED;
  const db = await recordsDb();
  const { data, error } = await db.from("work_trips").delete().eq("id", id).select("employee_id, starts_on, ends_on, premium_pct");
  if (error) return { ok: false, message: error.message };
  const t = (data as { employee_id: number; starts_on: string; ends_on: string; premium_pct: number }[] | null)?.[0];
  if (!t) return DENIED;
  const adjusted = await recordLockedTripChange(db, me, t.employee_id, t.starts_on, t.ends_on, `Work trip ${t.starts_on} – ${t.ends_on} removed after the lock`);
  revalidatePath(employeePage(t.employee_id));
  revalidatePath("/pay-periods");
  revalidatePath("/time-clock", "layout");
  return { ok: true, adjusted };
}

function tripError(message: string): Result {
  if (/work_trips_no_overlap/.test(message)) return { ok: false, message: "This person already has a trip on some of those days." };
  return dbError(message);
}
