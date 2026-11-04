import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { allocate, allocateAll, type Extra, type IgnoredExtra, type ProjectUnit } from "./allocation";
import { materialsOnly, type MaterialRow } from "./materials";

// PU-a: reading the materials pick list. Both calls first bring the list up to date with the proposals
// (sync_project_materials: new Portal.io lines get a row, untouched open rows take the current values), then read
// the lines with today's stock through project_materials_list (security definer: Purchasing / Finance / Transactions).
// PU-d: then the units installed / staged on the job (Stock) are laid over the lines (allocate), live, never stored.

const num = (v: unknown, d = 0) => (v === null || v === undefined ? d : Number(v));
const shape = (r: Record<string, unknown>): MaterialRow => ({
  ...(r as unknown as MaterialRow),
  quantity: num(r.quantity, 1),
  unit_cost: r.unit_cost === null || r.unit_cost === undefined ? null : Number(r.unit_cost),
  msrp: r.msrp === null || r.msrp === undefined ? null : Number(r.msrp),
  sell_price: r.sell_price === null || r.sell_price === undefined ? null : Number(r.sell_price),
  on_hand: num(r.on_hand),
  project: (r.project as string | null) ?? `Project #${r.project_id}`,
  installed: 0,
  staged: 0,
  allocated: 0,
});

type UnitRow = { id: number; product_id: number | null; model: string | null; status: "On Project" | "Separated"; destination_project_id: number; products: { title: string | null } | null };
const unit = (u: UnitRow): ProjectUnit & { project_id: number } => ({ id: u.id, product_id: u.product_id, model: u.model, title: u.products?.title ?? null, status: u.status, project_id: u.destination_project_id });

/** The units whose destination is one of these projects: Installed (On Project) or Staged for it (Separated). Chunked and paged (PostgREST's 1000-row cap). */
async function loadUnits(db: SupabaseClient, projectIds: number[]): Promise<(ProjectUnit & { project_id: number })[]> {
  const out: (ProjectUnit & { project_id: number })[] = [];
  for (let i = 0; i < projectIds.length; i += 200) {
    for (let from = 0; ; from += 1000) {
      const { data } = await db
        .from("stock_items")
        .select("id, product_id, model, status, destination_project_id, products:product_id(title)")
        .in("destination_project_id", projectIds.slice(i, i + 200))
        .in("status", ["On Project", "Separated"])
        .is("deleted_at", null)
        .order("id")
        .range(from, from + 999);
      const rows = (data ?? []) as unknown as UnitRow[];
      out.push(...rows.map(unit));
      if (rows.length < 1000) break;
    }
  }
  return out;
}

/** One project's lines (its Materials card), with the units on the job laid over them, and the units no line takes. */
export async function loadProjectMaterials(db: SupabaseClient, projectId: number): Promise<{ rows: MaterialRow[]; extras: Extra[] }> {
  await db.rpc("sync_project_materials", { p_project_id: projectId });
  const [{ data }, units, { data: ign }] = await Promise.all([
    db.rpc("project_materials_list", { p_project_id: projectId, p_statuses: null, p_year: null }),
    loadUnits(db, [projectId]),
    db.from("project_material_ignores").select("id, product_id, model").eq("project_id", projectId),
  ]);
  const rows = materialsOnly(((data ?? []) as Record<string, unknown>[]).map(shape));
  return allocate(rows, units, (ign ?? []) as IgnoredExtra[]);
}

/** Every line of the Low Voltage projects in `statuses` (Administrative › Purchasing); `year` = the proposal's year (a hand-added line: the year it was added). */
export async function loadAllMaterials(db: SupabaseClient, statuses: string[], year: number | null): Promise<MaterialRow[]> {
  await db.rpc("sync_project_materials", { p_project_id: null });
  const { data } = await db.rpc("project_materials_list", { p_project_id: null, p_statuses: statuses, p_year: year });
  const rows = materialsOnly(((data ?? []) as Record<string, unknown>[]).map(shape));
  const units = await loadUnits(db, [...new Set(rows.map((m) => m.project_id))]);
  return allocateAll(rows, units);
}
