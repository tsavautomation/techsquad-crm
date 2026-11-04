import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { MaterialRow } from "./materials";

// PU-a: reading the materials pick list. Both calls first bring the list up to date with the proposals
// (sync_project_materials: new Portal.io lines get a row, untouched open rows take the current values), then read
// the lines with today's stock through project_materials_list (security definer: Purchasing / Finance / Transactions).

const num = (v: unknown, d = 0) => (v === null || v === undefined ? d : Number(v));
const shape = (r: Record<string, unknown>): MaterialRow => ({
  ...(r as unknown as MaterialRow),
  quantity: num(r.quantity, 1),
  unit_cost: r.unit_cost === null || r.unit_cost === undefined ? null : Number(r.unit_cost),
  msrp: r.msrp === null || r.msrp === undefined ? null : Number(r.msrp),
  sell_price: r.sell_price === null || r.sell_price === undefined ? null : Number(r.sell_price),
  on_hand: num(r.on_hand),
  project: (r.project as string | null) ?? `Project #${r.project_id}`,
});

/** One project's lines (its Materials card). */
export async function loadProjectMaterials(db: SupabaseClient, projectId: number): Promise<MaterialRow[]> {
  await db.rpc("sync_project_materials", { p_project_id: projectId });
  const { data } = await db.rpc("project_materials_list", { p_project_id: projectId, p_statuses: null, p_year: null });
  return ((data ?? []) as Record<string, unknown>[]).map(shape);
}

/** Every line of the Low Voltage projects in `statuses` (Administrative › Purchasing); `year` = the proposal's year (a hand-added line: the year it was added). */
export async function loadAllMaterials(db: SupabaseClient, statuses: string[], year: number | null): Promise<MaterialRow[]> {
  await db.rpc("sync_project_materials", { p_project_id: null });
  const { data } = await db.rpc("project_materials_list", { p_project_id: null, p_statuses: statuses, p_year: year });
  return ((data ?? []) as Record<string, unknown>[]).map(shape);
}
