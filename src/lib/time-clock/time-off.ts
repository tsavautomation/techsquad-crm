"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth/session";
import { recordsDb } from "@/lib/records/data";
import { TIME_OFF_KINDS } from "./time-off-kinds";

// TS-a Time off, the basics (Fred 2026-11-04, Part 2): one row per person and day with the type, paid or not,
// the hours and a note. Paid hours reach Pay periods as PTO. Balances, requests and policies come later
// (Stage 4 of the 2026-10-29 brief).

type Result = { ok: true } | { ok: false; message: string };
const DENIED_MESSAGE = "Only people who may edit Employees can do that.";
const DENIED: Result = { ok: false, message: DENIED_MESSAGE };

const Input = z.object({
  employeeId: z.number().int().positive(),
  day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick the day."),
  kind: z.enum(TIME_OFF_KINDS),
  paid: z.boolean(),
  hours: z.coerce.number().min(0).max(24, "Hours must be between 0 and 24."),
  note: z.string().trim().max(300).optional(),
});
export type TimeOffInput = z.input<typeof Input>;

/** Add (or replace, same person and day) a time-off day. */
export async function setTimeOffAction(input: TimeOffInput): Promise<Result> {
  const user = await requireUser();
  if (!user.permissions.has("administrative.employees.modify")) return DENIED;
  const parsed = Input.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message };
  const v = parsed.data;
  const db = await recordsDb();
  const { data: existing } = await db.from("time_off_entries").select("id").eq("employee_id", v.employeeId).eq("day", v.day).is("deleted_at", null).maybeSingle();
  const row = { employee_id: v.employeeId, day: v.day, kind: v.kind, paid: v.kind === "Unpaid" ? false : v.paid, minutes: Math.round(v.hours * 60), note: v.note || null };
  const { error } = existing ? await db.from("time_off_entries").update(row).eq("id", (existing as { id: number }).id) : await db.from("time_off_entries").insert({ ...row, created_by: user.id });
  if (error) return { ok: false, message: /row-level security/i.test(error.message) ? DENIED_MESSAGE : error.message };
  revalidatePath("/time-clock/timesheets");
  revalidatePath("/pay-periods");
  return { ok: true };
}

export async function removeTimeOffAction(id: number): Promise<Result> {
  const user = await requireUser();
  if (!user.permissions.has("administrative.employees.modify")) return DENIED;
  const db = await recordsDb();
  const { data, error } = await db.from("time_off_entries").update({ deleted_at: new Date().toISOString() }).eq("id", id).is("deleted_at", null).select("id");
  if (error) return { ok: false, message: error.message };
  if (!data?.length) return { ok: false, message: "Time off not found." };
  revalidatePath("/time-clock/timesheets");
  revalidatePath("/pay-periods");
  return { ok: true };
}
