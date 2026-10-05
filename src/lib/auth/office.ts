import type { SupabaseClient } from "@supabase/supabase-js";
import type { CurrentUser } from "@/lib/auth/session";
import { getTable } from "@/registry";
import { canDo } from "@/registry/permissions";

// Who counts as office staff, and the name views everyone may read (SPEC §9.1 UI-e…h, Fred 2026-10-05).

/** Office staff run projects; technicians don't. Office people see the team-wide lists and tiles. */
export const isOfficeUser = (user: CurrentUser) => canDo(user.permissions, getTable("projects"), "create", getTable);

/** Names of colleagues and vans are visible to every signed-in person through these views, whatever their permissions. */
const PUBLIC_NAMES: Record<string, string> = { employees: "employee_names", vehicles: "vehicle_names" };
export const readableTable = (table: string) => PUBLIC_NAMES[table] ?? table;

/** The Employee records that belong to this login (matched by email; usually one). */
export async function myEmployeeIds(db: SupabaseClient, user: CurrentUser): Promise<number[]> {
  const { data } = await db.from("employee_names").select("id").ilike("email", user.email).is("deleted_at", null);
  return ((data ?? []) as { id: number }[]).map((e) => e.id);
}

/** Technicians file Job Reports under their own name only (Fred 2026-10-05: "no tech should be able to submit a report as someone else"). */
export const SELF_ONLY: Record<string, string[]> = { job_reports: ["team_ids"] };
export const isSelfOnly = (table: string, field: string, user: CurrentUser) => !isOfficeUser(user) && (SELF_ONLY[table] ?? []).includes(field);
