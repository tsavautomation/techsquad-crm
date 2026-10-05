"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/session";
import { recordsDb } from "@/lib/records/data";
import type { ActionResult } from "@/lib/records/record-actions";
import { saveRecord } from "@/lib/records/save";
import { runAutomationsSafely } from "@/lib/engine/automations";
import { after } from "next/server";
import type { Address } from "@/lib/records/values";
import { openPendingFor } from "@/lib/field-day/pending";

// Schedule (F1) helpers for the visit form and the calendar. Everything reads through the
// signed-in user's session (row-level security) and writes through saveRecord.

export type VisitContext = {
  address: string | null;
  delinquent: boolean;
  lastAccessNotes: string | null;
  /** F17-d: return cards still open on this project (a yellow warning, never a block). */
  pending: { taskId: number; title: string; due: string | null; reportDate: string | null }[];
};

const oneLine = (a: Address | null) => (a ? [a.street, a.address_2, a.city, [a.state, a.zip].filter(Boolean).join(" ")].filter(Boolean).join(", ") : "") || null;

/** What the form should know about the picked project. */
export async function visitContextAction(projectId: number): Promise<VisitContext | null> {
  await requireUser();
  const db = await recordsDb();
  const [{ data: p }, { data: last }, pending] = await Promise.all([
    db.from("projects").select("job_address, financial_status").eq("id", projectId).maybeSingle(),
    db.from("visits").select("access_notes").eq("project_id", projectId).not("access_notes", "is", null).is("deleted_at", null).order("starts_at", { ascending: false }).limit(1),
    openPendingFor(db, projectId),
  ]);
  if (!p) return null;
  const row = p as { job_address: Address | null; financial_status: string | null };
  return {
    address: oneLine(row.job_address),
    delinquent: row.financial_status === "Delinquent",
    lastAccessNotes: (last?.[0] as { access_notes: string } | undefined)?.access_notes ?? null,
    pending: pending.map((i) => ({ taskId: i.taskId, title: i.title, due: i.due, reportDate: i.reportDate })),
  };
}

export type Conflict = { visitId: number; who: string; title: string; start: string; end: string };

/** Other visits that overlap this one for any of the people going. */
export async function visitConflictsAction(people: number[], startsAt: string, minutes: number, excludeId: number | null): Promise<Conflict[]> {
  await requireUser();
  const ids = [...new Set(people.filter((x) => Number.isInteger(x)))];
  if (!ids.length || Number.isNaN(Date.parse(startsAt)) || !(minutes > 0)) return [];
  const start = new Date(startsAt).getTime();
  const end = start + minutes * 60_000;
  const db = await recordsDb();
  // Candidates: visits starting within 8 h before the end (the longest duration) and not cancelled.
  const { data } = await db
    .from("visits")
    .select("id, title, starts_at, duration, technician_id, visits_team(target_id)")
    .gte("starts_at", new Date(start - 8 * 3_600_000).toISOString())
    .lt("starts_at", new Date(end).toISOString())
    .neq("status", "Cancelled")
    .is("deleted_at", null);
  const rows = ((data ?? []) as unknown as { id: number; title: string | null; starts_at: string; duration: string | null; technician_id: number | null; visits_team: { target_id: number }[] }[]).filter(
    (v) => v.id !== excludeId && new Date(v.starts_at).getTime() + Number(v.duration ?? 60) * 60_000 > start,
  );
  if (!rows.length) return [];
  const { data: emp } = await db.from("employee_names").select("id, title").in("id", ids);
  const name = new Map(((emp ?? []) as { id: number; title: string | null }[]).map((e) => [e.id, e.title ?? `#${e.id}`]));
  const out: Conflict[] = [];
  for (const v of rows) {
    const going = new Set([v.technician_id, ...v.visits_team.map((x) => x.target_id)]);
    for (const p of ids)
      if (going.has(p))
        out.push({ visitId: v.id, who: name.get(p) ?? `#${p}`, title: v.title ?? `Visit #${v.id}`, start: v.starts_at, end: new Date(new Date(v.starts_at).getTime() + Number(v.duration ?? 60) * 60_000).toISOString() });
  }
  return out;
}

/** Drag & drop on the calendar: new start and/or technician. */
export async function moveVisitAction(id: number, startsAt: string, technicianId?: number): Promise<ActionResult> {
  const values: Record<string, unknown> = { starts_at: startsAt };
  if (technicianId) values.technician_id = technicianId;
  const r = await saveRecord("visits", id, values);
  if (!r.ok) return { ok: false, message: r.message ?? Object.values(r.errors)[0] ?? "Could not move the visit." };
  after(runAutomationsSafely);
  revalidatePath("/schedule", "layout");
  return { ok: true };
}
