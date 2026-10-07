import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { CurrentUser } from "@/lib/auth/session";
import { adminDb } from "@/lib/supabase/admin";
import { myEmployeeIds } from "./load";
import { loadFieldDay } from "./return-card";

// F22-a Check-in / check-out corrections (SPEC §9.1 F22-a): a technician asks for the right time and
// says why; an approver (Admin › Field day › "Who approves time corrections") approves or rejects.

export type CorrectionField = "on_way_at" | "checked_in_at" | "checked_out_at";
export const CORRECTION_FIELDS: CorrectionField[] = ["on_way_at", "checked_in_at", "checked_out_at"];
/** The visit field's label, as on the Visit form. */
export const FIELD_LABEL: Record<CorrectionField, string> = { on_way_at: "On my way", checked_in_at: "Checked in", checked_out_at: "Checked out" };

export type Correction = {
  id: number;
  visit_id: number;
  employee_id: number;
  employee: string;
  field: CorrectionField;
  previous_at: string | null;
  requested_at: string;
  reason: string;
  status: "pending" | "approved" | "rejected";
  decided_at: string | null;
  decision_note: string | null;
  created_at: string;
};

const COLS = "id, visit_id, employee_id, field, previous_at, requested_at, reason, status, decided_at, decision_note, created_at, employees:employee_names(title)";
type Row = Omit<Correction, "employee"> & { employees: { title: string | null } | null };
const toCorrection = (r: Row): Correction => ({ ...r, employee: r.employees?.title ?? `#${r.employee_id}`, employees: undefined } as unknown as Correction);

/** The requests on one visit, newest first (RLS: the requester's own, or all for the office). */
export async function loadCorrections(db: SupabaseClient, visitId: number): Promise<Correction[]> {
  const { data } = await db.from("time_corrections").select(COLS).eq("visit_id", visitId).order("created_at", { ascending: false });
  return ((data ?? []) as unknown as Row[]).map(toCorrection);
}

/** Who may approve: the people in the settings list, and System Administrators. */
export async function approverIds(db: SupabaseClient): Promise<number[]> {
  return (await loadFieldDay(db)).time_clock.correction_approver_ids;
}

export async function isApprover(db: SupabaseClient, user: CurrentUser): Promise<boolean> {
  if (user.isSysadmin) return true;
  const [mine, approvers] = await Promise.all([myEmployeeIds(db, user), approverIds(db)]);
  return mine.some((id) => approvers.includes(id));
}

export type PendingCorrection = { id: number; visit_id: number; employee: string; project: string; field: CorrectionField; requested_at: string; created_at: string };

/** Every request still waiting, for the approvers' alerts bell (service role: approvers need no Visits permission). */
export async function pendingCorrections(): Promise<PendingCorrection[]> {
  const db = adminDb();
  const { data } = await db.from("time_corrections").select(`${COLS}, visits(title)`).eq("status", "pending").order("created_at", { ascending: false }).limit(20);
  return ((data ?? []) as unknown as (Row & { visits: { title: string | null } | null })[]).map((r) => ({ id: r.id, visit_id: r.visit_id, employee: r.employees?.title ?? `#${r.employee_id}`, project: r.visits?.title ?? `Visit #${r.visit_id}`, field: r.field, requested_at: r.requested_at, created_at: r.created_at }));
}
