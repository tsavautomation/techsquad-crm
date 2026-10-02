"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/session";
import { fromDateTimeLocalET, toDateTimeLocalET } from "@/lib/dates";
import { recordsDb } from "@/lib/records/data";
import type { Geo } from "./clock";
import { myClockToday, recordEntry } from "./record";

// P2 Time clock actions. Everyone records their own entries; people who may edit Employees correct them.

export type ClockResult = { ok: true; place: string } | { ok: false; message: string };

const cleanGeo = (g: Geo | null): Geo | null =>
  g && Number.isFinite(g.lat) && Number.isFinite(g.lng) && Math.abs(g.lat) <= 90 && Math.abs(g.lng) <= 180 ? { lat: g.lat, lng: g.lng, accuracy_m: g.accuracy_m != null && Number.isFinite(g.accuracy_m) ? Math.round(Math.min(99_999, Math.max(0, g.accuracy_m))) : null } : null;

/** Clock in or out for the day. A second clock-in while still clocked in, or a clock-out without one, is refused. */
export async function clockAction(kind: "clock_in" | "clock_out", geo: Geo | null): Promise<ClockResult> {
  const user = await requireUser();
  if (kind !== "clock_in" && kind !== "clock_out") return { ok: false, message: "Unknown step." };
  const db = await recordsDb();
  const mine = await myClockToday(db, user);
  if (!mine) return { ok: false, message: "Your login isn't linked to an Employee record (same email). Ask the office to fix the employee's email." };
  if (kind === "clock_in" && mine.day.openSince) return { ok: false, message: "You're already clocked in." };
  if (kind === "clock_out" && !mine.day.openSince) return { ok: false, message: "You're not clocked in." };
  const r = await recordEntry(db, user, kind, cleanGeo(geo));
  if (!r.ok) return r;
  revalidatePath("/");
  revalidatePath("/time-clock");
  return { ok: true, place: r.entry.place };
}

/** Correct an entry's time (HH:MM, Eastern, same day). The original time is kept and the correction signed. */
export async function correctEntryAction(id: number, time: string): Promise<{ ok: true } | { ok: false; message: string }> {
  const user = await requireUser();
  if (!user.permissions.has("administrative.employees.modify")) return { ok: false, message: "You don't have permission to do that." };
  if (!/^\d{2}:\d{2}$/.test(time)) return { ok: false, message: "Please enter a time like 07:45." };
  const db = await recordsDb();
  const { data: e } = await db.from("time_entries").select("id, at, original_at").eq("id", id).maybeSingle();
  if (!e) return { ok: false, message: "Entry not found." };
  const day = toDateTimeLocalET(e.at as string).slice(0, 10);
  const at = fromDateTimeLocalET(`${day}T${time}`);
  const { error } = await db.from("time_entries").update({ at, original_at: e.original_at ?? e.at, corrected_at: new Date().toISOString(), corrected_by: user.id }).eq("id", id);
  if (error) return { ok: false, message: error.message };
  revalidatePath("/time-clock");
  revalidatePath("/");
  return { ok: true };
}

/** Remove an entry (soft delete; it stays in the database). */
export async function removeEntryAction(id: number): Promise<{ ok: true } | { ok: false; message: string }> {
  const user = await requireUser();
  if (!user.permissions.has("administrative.employees.modify")) return { ok: false, message: "You don't have permission to do that." };
  const db = await recordsDb();
  const { error } = await db.from("time_entries").update({ deleted_at: new Date().toISOString(), corrected_at: new Date().toISOString(), corrected_by: user.id }).eq("id", id);
  if (error) return { ok: false, message: error.message };
  revalidatePath("/time-clock");
  revalidatePath("/");
  return { ok: true };
}
