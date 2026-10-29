"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/session";
import { fromDateTimeLocalET } from "@/lib/dates";
import { recordsDb } from "@/lib/records/data";
import { addDays } from "@/lib/schedule/dates";
import { shiftSequenceProblem } from "./week-approval";
import { weekApprovedFor } from "./week-status";

// J-s Manual clock entries (Jessica via Fred 2026-10-26, "when someone forgets to clock in or out"): the office
// adds a shift (person, day, in, out) or completes a half shift. Each row carries who did it, when and why
// (note + corrected_by / corrected_at), so the day view shows it as a correction; a day in an approved pay
// period is refused. Hours follow from the entries, so totals recalculate by themselves.
// TC-h (2026-10-29): a day in an approved week is refused until the week is reopened, and a day may hold
// several shifts as long as they do not overlap (shiftSequenceProblem).

export type ManualResult = { ok: true; added: ("clock_in" | "clock_out")[] } | { ok: false; message: string };

type Entry = { id: number; kind: string; at: string; pay_period_id: number | null };

const TIME = /^\d{2}:\d{2}$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;

export async function addManualShiftAction(input: { employeeId: number; day: string; inTime: string; outTime: string; reason: string }): Promise<ManualResult> {
  const user = await requireUser();
  if (!user.permissions.has("administrative.employees.modify")) return { ok: false, message: "Only people who may edit Employees can add entries." };
  const employeeId = Number(input.employeeId);
  const day = input.day;
  const inTime = input.inTime.trim();
  const outTime = input.outTime.trim();
  const reason = input.reason.trim().slice(0, 300);
  if (!Number.isInteger(employeeId) || !DAY.test(day)) return { ok: false, message: "Pick the person and the day." };
  if (!inTime && !outTime) return { ok: false, message: "Enter the clock-in time, the clock-out time, or both." };
  if ((inTime && !TIME.test(inTime)) || (outTime && !TIME.test(outTime))) return { ok: false, message: "Times must be hh:mm." };
  if (!reason) return { ok: false, message: "Say why (for the record)." };
  const db = await recordsDb();
  const { data: person } = await db.from("employees").select("id, title").eq("id", employeeId).is("deleted_at", null).maybeSingle();
  if (!person) return { ok: false, message: "That employee was not found." };

  const { data } = await db
    .from("time_entries")
    .select("id, kind, at, pay_period_id")
    .eq("employee_id", employeeId)
    .in("kind", ["clock_in", "clock_out"])
    .gte("at", fromDateTimeLocalET(`${day}T00:00`))
    .lt("at", fromDateTimeLocalET(`${addDays(day, 1)}T00:00`))
    .is("deleted_at", null)
    .order("at");
  const entries = (data ?? []) as Entry[];
  if (entries.some((e) => e.pay_period_id)) return { ok: false, message: "This day is in an approved pay period. Ask an administrator to reopen it." };
  if (await weekApprovedFor(db, employeeId, day)) return { ok: false, message: "This week's timesheet is approved. Reopen it on Timesheets first." };

  const inAt = inTime ? fromDateTimeLocalET(`${day}T${inTime}`) : null;
  let outAt = outTime ? fromDateTimeLocalET(`${day}T${outTime}`) : null;
  // A clock-out at or before the clock-in means the shift ended after midnight.
  if (inAt && outAt && outAt <= inAt) outAt = fromDateTimeLocalET(`${addDays(day, 1)}T${outTime}`);

  const last = entries[entries.length - 1];
  const openIn = last && last.kind === "clock_in" ? last : null;
  const orphanOut = entries.length && entries[0].kind === "clock_out" ? entries[0] : null;
  const rows: { kind: "clock_in" | "clock_out"; at: string }[] = [];
  if (inAt && outAt) rows.push({ kind: "clock_in", at: inAt }, { kind: "clock_out", at: outAt });
  else if (outAt) {
    if (!openIn) return { ok: false, message: "No open clock-in that day to complete. Enter the clock-in time too." };
    if (outAt <= openIn.at) return { ok: false, message: "The clock-out must come after the clock-in." };
    rows.push({ kind: "clock_out", at: outAt });
  } else if (inAt) {
    if (orphanOut && inAt >= orphanOut.at) return { ok: false, message: "The clock-in must come before that day's clock-out." };
    rows.push({ kind: "clock_in", at: inAt });
  }
  // Several shifts in a day are fine; overlapping ones are not.
  const problem = shiftSequenceProblem([...entries.map((e) => ({ kind: e.kind as "clock_in" | "clock_out", at: e.at })), ...rows]);
  if (problem) return { ok: false, message: problem };
  const who = [user.firstName, user.lastName].filter(Boolean).join(" ") || user.email;
  const stamp = new Date().toISOString();
  const { error } = await db.from("time_entries").insert(
    rows.map((r) => ({ employee_id: employeeId, user_id: user.id, kind: r.kind, at: r.at, place: "Unknown", note: `Added by ${who}: ${reason}`, corrected_at: stamp, corrected_by: user.id })),
  );
  if (error) return { ok: false, message: error.message };
  revalidatePath("/time-clock");
  revalidatePath("/time-clock/timesheets");
  return { ok: true, added: rows.map((r) => r.kind) };
}
