import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { CurrentUser } from "@/lib/auth/session";
import { nowMs } from "@/lib/dates";
import type { HoursVisit } from "@/lib/hours/engine";
import { jobCosting, type Costing, type RateRow } from "./engine";

// F13 Job costing: who may see it, and the rows the project card and the employee panel need.
// Everything is read with the viewer's own permissions; pay rates are only readable with the key.

export const COSTING_PERMISSION = "job_costing.view";
export const canSeeCosting = (user: CurrentUser) => user.isSysadmin || user.permissions.has(COSTING_PERMISSION);

export type PayRate = { id: number; employee_id: number; hourly_rate: number; effective_from: string; note: string | null; created_at: string };

export async function loadPayRates(db: SupabaseClient, employeeIds: number[]): Promise<PayRate[]> {
  if (!employeeIds.length) return [];
  const { data } = await db.from("employee_pay_rates").select("id, employee_id, hourly_rate, effective_from, note, created_at").in("employee_id", employeeIds).order("effective_from", { ascending: false });
  return ((data ?? []) as PayRate[]).map((r) => ({ ...r, hourly_rate: Number(r.hourly_rate) }));
}

export type ProjectCosting = { costing: Costing; names: Map<number, string>; rates: PayRate[] };

/** Labour (visits × rates), materials (Sale costs) and the approved amount for one project. */
export async function loadProjectCosting(db: SupabaseClient, projectId: number): Promise<ProjectCosting | null> {
  const { data: rows } = await db
    .from("visits")
    .select("id, project_id, starts_at, status, duration, technician_id, checked_in_at, checked_out_at")
    .eq("project_id", projectId)
    .is("deleted_at", null)
    .limit(400);
  const visitsRaw = (rows ?? []) as Omit<HoursVisit, "team_ids">[];
  const [{ data: team }, { data: sales }, { data: fin }] = await Promise.all([
    visitsRaw.length ? db.from("visits_team").select("record_id, target_id").in("record_id", visitsRaw.map((r) => r.id)) : Promise.resolve({ data: [] }),
    db.from("sales").select("id, cost").eq("destination_project_id", projectId).is("deleted_at", null),
    db.rpc("project_financials", { p_project_ids: [projectId] }),
  ]);
  const teamOf = new Map<number, number[]>();
  for (const x of (team ?? []) as { record_id: number; target_id: number }[]) teamOf.set(x.record_id, [...(teamOf.get(x.record_id) ?? []), x.target_id]);
  const visits: HoursVisit[] = visitsRaw.map((r) => ({ ...r, team_ids: teamOf.get(r.id) ?? [] }));
  const materials = (sales ?? []) as { id: number; cost: number | string | null }[];
  const approved = Number(((fin ?? []) as { approved_amount: number | string }[])[0]?.approved_amount ?? 0) || 0;
  if (!visits.length && !materials.length && !approved) return null;

  const people = [...new Set(visits.flatMap((v) => [v.technician_id, ...(v.team_ids ?? [])]).filter((x): x is number => x !== null))];
  const [rates, { data: emp }] = await Promise.all([loadPayRates(db, people), people.length ? db.from("employees").select("id, title").in("id", people) : Promise.resolve({ data: [] })]);
  const names = new Map(((emp ?? []) as { id: number; title: string | null }[]).map((e) => [e.id, e.title ?? `#${e.id}`]));
  const costing = jobCosting(visits, rates as RateRow[], materials, approved, nowMs());
  return { costing, names, rates };
}
