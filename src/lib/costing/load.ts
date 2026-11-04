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

export type ProjectCosting = { costing: Costing; names: Map<number, string>; rates: PayRate[]; /** FIN-e: Σ cost × quantity of the approved proposals' parts (Portal.io); F13-c: it is the Materials figure. */ partsEstimate: number };

/** Labour (visits × rates), materials (proposal parts + Sale costs) and the approved amount for one project. */
export async function loadProjectCosting(db: SupabaseClient, projectId: number): Promise<ProjectCosting | null> {
  // Paged: a long job has well over a thousand visits (PostgREST caps a query at 1000 rows).
  const visitsRaw: Omit<HoursVisit, "team_ids">[] = [];
  for (let from = 0; ; from += 1000) {
    const { data: rows } = await db
      .from("visits")
      .select("id, project_id, starts_at, status, duration, technician_id, checked_in_at, checked_out_at")
      .eq("project_id", projectId)
      .is("deleted_at", null)
      .order("id")
      .range(from, from + 999);
    visitsRaw.push(...((rows ?? []) as Omit<HoursVisit, "team_ids">[]));
    if ((rows ?? []).length < 1000) break;
  }
  const teamRows: { record_id: number; target_id: number }[] = [];
  for (let i = 0; i < visitsRaw.length; i += 500) {
    const { data } = await db.from("visits_team").select("record_id, target_id").in("record_id", visitsRaw.slice(i, i + 500).map((r) => r.id)).limit(5000);
    teamRows.push(...((data ?? []) as { record_id: number; target_id: number }[]));
  }
  const [{ data: sales }, { data: fin }] = await Promise.all([
    db.from("sales").select("id, cost").eq("destination_project_id", projectId).is("deleted_at", null),
    db.rpc("project_financials", { p_project_ids: [projectId] }),
  ]);
  const teamOf = new Map<number, number[]>();
  for (const x of teamRows) teamOf.set(x.record_id, [...(teamOf.get(x.record_id) ?? []), x.target_id]);
  const visits: HoursVisit[] = visitsRaw.map((r) => ({ ...r, team_ids: teamOf.get(r.id) ?? [] }));
  const materials = (sales ?? []) as { id: number; cost: number | string | null }[];
  const finRow = ((fin ?? []) as { approved_amount: number | string; parts_cost: number | string }[])[0];
  const approved = Number(finRow?.approved_amount ?? 0) || 0;
  const partsEstimate = Number(finRow?.parts_cost ?? 0) || 0;
  if (!visits.length && !materials.length && !approved) return null;

  const people = [...new Set(visits.flatMap((v) => [v.technician_id, ...(v.team_ids ?? [])]).filter((x): x is number => x !== null))];
  const [rates, { data: emp }] = await Promise.all([loadPayRates(db, people), people.length ? db.from("employee_names").select("id, title").in("id", people) : Promise.resolve({ data: [] })]);
  const names = new Map(((emp ?? []) as { id: number; title: string | null }[]).map((e) => [e.id, e.title ?? `#${e.id}`]));
  const costing = jobCosting(visits, rates as RateRow[], materials, approved, nowMs(), partsEstimate);
  return { costing, names, rates, partsEstimate };
}
