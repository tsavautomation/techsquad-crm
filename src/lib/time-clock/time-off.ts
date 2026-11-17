"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser, type CurrentUser } from "@/lib/auth/session";
import { todayET } from "@/lib/dates";
import { myEmployeeIds } from "@/lib/field-day/load";
import { loadFieldDay } from "@/lib/field-day/return-card";
import { loginsByEmployee } from "@/lib/push/reminders";
import { notifyPush } from "@/lib/push/send";
import { recordsDb } from "@/lib/records/data";
import { adminDb, hasAdminKey } from "@/lib/supabase/admin";
import { canApproveTimesheets } from "./approval-status";
import { fullDayMinutes, materializeRequest } from "./time-off-flow";
import { hoursProblem, POLICIES, requestDays, requestDecidedMessage, requestMessage, type OffRequest } from "./time-off-rules";

// TO-a Time off (Fred 2026-11-17; replaces TS-a's basics): two policies (paid / unpaid) taken from one bank of
// hours per person. A person asks from their own app; Saulo and Jessica decide (a comment is required to refuse),
// may enter time off for someone directly and cancel an approved one; Jessica keeps the bank (opening balance and
// adjustments, always with a reason). The writes run with the service role after the checks below.

type Result = { ok: true } | { ok: false; message: string };
const DENIED_MESSAGE = "You don't have permission to do that.";
const DENIED: Result = { ok: false, message: DENIED_MESSAGE };
const NO_KEY: Result = { ok: false, message: "The server is not configured for this yet (admin key missing)." };
const DATE = /^\d{4}-\d{2}-\d{2}$/;

const canDecide = (user: CurrentUser) => canApproveTimesheets(user);
const canEditDay = (user: CurrentUser) => canApproveTimesheets(user) || user.permissions.has("administrative.employees.modify");
const canBank = (user: CurrentUser) => user.isSysadmin || user.permissions.has("administrative.time_off.bank");

function refresh() {
  revalidatePath("/");
  revalidatePath("/my-time");
  revalidatePath("/time-clock", "layout");
  revalidatePath("/pay-periods");
}

const RequestInput = z
  .object({
    policy: z.enum(POLICIES),
    starts_on: z.string().regex(DATE, "Pick the first day."),
    ends_on: z.string().regex(DATE, "Pick the last day."),
    /** Hours per day, or 0 for the full day. */
    hours: z.coerce.number().int().min(0).max(24),
    reason: z.string().trim().min(3, "Write the reason.").max(500),
  })
  .refine((v) => v.ends_on >= v.starts_on, { message: "The last day comes before the first." });
export type RequestInput = z.input<typeof RequestInput>;

async function buildRequest(employeeId: number, input: RequestInput): Promise<{ ok: true; row: { employee_id: number; policy: (typeof POLICIES)[number]; starts_on: string; ends_on: string; minutes_per_day: number; reason: string } } | { ok: false; message: string }> {
  const parsed = RequestInput.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message };
  const v = parsed.data;
  const db = adminDb();
  const settings = await loadFieldDay(db);
  if (!requestDays(v.starts_on, v.ends_on, settings.time_off.holidays).length) return { ok: false, message: "Those dates have no working day (Monday to Friday)." };
  const full = await fullDayMinutes(db, employeeId, v.starts_on);
  const minutes = v.hours === 0 ? full : v.hours * 60;
  const problem = hoursProblem(minutes, full);
  if (problem) return { ok: false, message: problem };
  return { ok: true, row: { employee_id: employeeId, policy: v.policy, starts_on: v.starts_on, ends_on: v.ends_on, minutes_per_day: minutes, reason: v.reason } };
}

/** The person asks for time off from their own app; Saulo and Jessica are told. */
export async function requestTimeOffAction(input: RequestInput): Promise<Result> {
  const user = await requireUser();
  if (!hasAdminKey()) return NO_KEY;
  const [employeeId] = await myEmployeeIds(await recordsDb(), user);
  if (!employeeId) return { ok: false, message: "Your login isn't linked to an Employee record (same email). Ask the office to fix the employee's email." };
  const built = await buildRequest(employeeId, input);
  if (!built.ok) return built;
  const db = adminDb();
  const { data: clash } = await db.from("time_off_requests").select("id").eq("employee_id", employeeId).in("status", ["pending", "approved"]).lte("starts_on", built.row.ends_on).gte("ends_on", built.row.starts_on).limit(1);
  if (clash?.length) return { ok: false, message: "You already have a request on some of those days." };
  const { error } = await db.from("time_off_requests").insert({ ...built.row, created_by: user.id });
  if (error) return { ok: false, message: error.message };
  const { data: me } = await db.from("employee_names").select("title").eq("id", employeeId).maybeSingle();
  await notifyPush("time_off_request", requestMessage({ person: (me as { title: string | null } | null)?.title ?? "Someone", policy: built.row.policy, starts_on: built.row.starts_on, ends_on: built.row.ends_on, hours: built.row.minutes_per_day / 60 })).catch(() => undefined);
  refresh();
  return { ok: true };
}

/** Saulo or Jessica enter time off for someone: approved at once. */
export async function enterTimeOffAction(employeeId: number, input: RequestInput): Promise<Result> {
  const user = await requireUser();
  if (!canDecide(user)) return DENIED;
  if (!hasAdminKey()) return NO_KEY;
  if (!Number.isInteger(employeeId)) return { ok: false, message: "Pick the person." };
  const built = await buildRequest(employeeId, input);
  if (!built.ok) return built;
  const db = adminDb();
  const stamp = new Date().toISOString();
  const { data, error } = await db.from("time_off_requests").insert({ ...built.row, status: "approved", direct: true, decided_by: user.id, decided_at: stamp, created_by: user.id }).select("id").single();
  if (error || !data) return { ok: false, message: error?.message ?? "Could not save." };
  const made = await materializeRequest(db, { id: (data as { id: number }).id, ...built.row }, user.id);
  if (!made.ok) {
    await db.from("time_off_requests").delete().eq("id", (data as { id: number }).id);
    return made;
  }
  refresh();
  return { ok: true };
}

/** Approve (the hours leave the bank and show on the grid) or refuse (a comment is required); the person is told. */
export async function decideTimeOffAction(id: number, approve: boolean, comment: string): Promise<Result> {
  const user = await requireUser();
  if (!canDecide(user)) return DENIED;
  if (!hasAdminKey()) return NO_KEY;
  const note = comment.trim().slice(0, 500);
  if (!approve && !note) return { ok: false, message: "Say why you are refusing (the person reads it)." };
  const db = adminDb();
  const { data } = await db.from("time_off_requests").select("id, employee_id, policy, starts_on, ends_on, minutes_per_day, reason, status").eq("id", id).maybeSingle();
  const r = data as Pick<OffRequest, "id" | "employee_id" | "policy" | "starts_on" | "ends_on" | "minutes_per_day" | "reason" | "status"> | null;
  if (!r) return { ok: false, message: "Request not found." };
  if (r.status !== "pending") return { ok: false, message: "This request was already answered." };
  if (approve) {
    const made = await materializeRequest(db, r, user.id);
    if (!made.ok) return made;
  }
  const { error } = await db.from("time_off_requests").update({ status: approve ? "approved" : "refused", decided_by: user.id, decided_at: new Date().toISOString(), decision_comment: note || null }).eq("id", id);
  if (error) return { ok: false, message: error.message };
  const userId = (await loginsByEmployee(db, [r.employee_id])).get(r.employee_id);
  if (userId) await notifyPush("time_off_decided", requestDecidedMessage({ approved: approve, starts_on: r.starts_on, ends_on: r.ends_on, comment: note || null }), userId).catch(() => undefined);
  refresh();
  return { ok: true };
}

/** The person cancels their own pending request; Saulo or Jessica cancel any pending or approved one (the hours go back to the bank). */
export async function cancelTimeOffAction(id: number): Promise<Result> {
  const user = await requireUser();
  if (!hasAdminKey()) return NO_KEY;
  const db = adminDb();
  const { data } = await db.from("time_off_requests").select("id, employee_id, status").eq("id", id).maybeSingle();
  const r = data as { id: number; employee_id: number; status: string } | null;
  if (!r) return { ok: false, message: "Request not found." };
  const mine = (await myEmployeeIds(await recordsDb(), user)).includes(r.employee_id);
  if (!(canDecide(user) || (mine && r.status === "pending"))) return r.status === "approved" && mine ? { ok: false, message: "An approved request is cancelled by Saulo or Jessica." } : DENIED;
  if (r.status !== "pending" && r.status !== "approved") return { ok: false, message: "This request is already closed." };
  const stamp = new Date().toISOString();
  if (r.status === "approved") await db.from("time_off_entries").update({ deleted_at: stamp }).eq("request_id", id).is("deleted_at", null);
  const { error } = await db.from("time_off_requests").update({ status: "cancelled", cancelled_by: user.id, cancelled_at: stamp }).eq("id", id);
  if (error) return { ok: false, message: error.message };
  refresh();
  return { ok: true };
}

const DayInput = z.object({
  employeeId: z.number().int().positive(),
  day: z.string().regex(DATE, "Pick the day."),
  kind: z.enum(POLICIES),
  hours: z.coerce.number().min(0).max(24, "Hours must be between 0 and 24."),
  note: z.string().trim().max(300).optional(),
});
export type TimeOffInput = z.input<typeof DayInput>;

/** One day's time off set by the office on the person's timesheet (add, or replace that day's row, an absence included). */
export async function setTimeOffAction(input: TimeOffInput): Promise<Result> {
  const user = await requireUser();
  if (!canEditDay(user)) return DENIED;
  if (!hasAdminKey()) return NO_KEY;
  const parsed = DayInput.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message };
  const v = parsed.data;
  const db = adminDb();
  const { data: existing } = await db.from("time_off_entries").select("id").eq("employee_id", v.employeeId).eq("day", v.day).is("deleted_at", null).maybeSingle();
  const row = { employee_id: v.employeeId, day: v.day, kind: v.kind, paid: v.kind === "Paid absence", minutes: Math.round(v.hours * 60), note: v.note || null, auto: false };
  const { error } = existing ? await db.from("time_off_entries").update(row).eq("id", (existing as { id: number }).id) : await db.from("time_off_entries").insert({ ...row, created_by: user.id });
  if (error) return { ok: false, message: error.message };
  refresh();
  return { ok: true };
}

/** Remove one day's time off or absence (its hours go back to the bank). */
export async function removeTimeOffAction(id: number): Promise<Result> {
  const user = await requireUser();
  if (!canEditDay(user)) return DENIED;
  if (!hasAdminKey()) return NO_KEY;
  const { data, error } = await adminDb().from("time_off_entries").update({ deleted_at: new Date().toISOString() }).eq("id", id).is("deleted_at", null).select("id");
  if (error) return { ok: false, message: error.message };
  if (!data?.length) return { ok: false, message: "Time off not found." };
  refresh();
  return { ok: true };
}

const BankInput = z.object({
  employeeId: z.number().int().positive(),
  kind: z.enum(["opening", "adjustment"]),
  /** Hours, positive or negative (an opening balance may be 0 only as an adjustment of nothing, so 0 is refused). */
  hours: z.coerce.number().min(-2000).max(2000),
  day: z.string().regex(DATE, "Pick the date."),
  reason: z.string().trim().min(3, "Write the reason.").max(300),
});
export type BankInput = z.input<typeof BankInput>;

/** The opening balance or an adjustment (+/-) of someone's bank, with the reason; kept as history, never edited. */
export async function adjustBankAction(input: BankInput): Promise<Result> {
  const user = await requireUser();
  if (!canBank(user)) return DENIED;
  if (!hasAdminKey()) return NO_KEY;
  const parsed = BankInput.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message };
  const v = parsed.data;
  const minutes = Math.round(v.hours * 60);
  if (minutes === 0) return { ok: false, message: "Type the hours (not zero)." };
  if (v.day > todayET()) return { ok: false, message: "The date can't be in the future." };
  const { error } = await adminDb().from("time_off_bank_entries").insert({ employee_id: v.employeeId, kind: v.kind, delta_minutes: minutes, day: v.day, reason: v.reason, created_by: user.id });
  if (error) return { ok: false, message: error.message };
  refresh();
  return { ok: true };
}
