"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/session";
import { canSeePurchasing } from "@/lib/finance/access";
import { loadProductChoices } from "@/lib/inventory/load";
import { productMatches, type ProductChoice } from "@/lib/inventory/rules";
import { recordsDb } from "@/lib/records/data";
import type { MaterialStatus } from "./materials";

// PU-a: what a buyer does on a project's Materials card: mark a line purchased (or back to open), remove it,
// replace it with another product, add a line the proposal does not have, fix a quantity or cost. Writes go through
// the person's own session (row-level security: Purchasing / Finance / Transactions), so updated_by is the person.
// Nothing here moves stock: the Inventory Checkout stays the only stock movement.

type Result<T = object> = ({ ok: true } & T) | { ok: false; message: string };
export type NewLine = { productId: number | null; brand: string; model: string; name: string; quantity: number; unitCost: number | null; notes?: string };

async function buyer(): Promise<Result<{ db: Awaited<ReturnType<typeof recordsDb>>; me: string }>> {
  const me = await requireUser();
  if (!canSeePurchasing(me)) return { ok: false, message: "You don't have permission to do that." };
  return { ok: true, db: await recordsDb(), me: me.id };
}

const refresh = (projectId: number) => {
  revalidatePath(`/projects/projects/${projectId}`);
  revalidatePath("/administrative/purchasing");
};

const clean = (l: NewLine) => {
  const quantity = Number(l.quantity);
  if (!Number.isFinite(quantity) || quantity <= 0) return "Quantity must be more than zero.";
  if (!l.brand.trim() && !l.model.trim() && !l.name.trim()) return "Type at least a model or a description.";
  if (l.unitCost !== null && (!Number.isFinite(Number(l.unitCost)) || Number(l.unitCost) < 0)) return "The cost must be zero or more.";
  return null;
};

/** Purchased / removed / back to open. Replaced only comes from replaceMaterialAction. */
export async function setMaterialStatusAction(id: number, projectId: number, status: Exclude<MaterialStatus, "replaced">): Promise<Result> {
  const b = await buyer();
  if (!b.ok) return b;
  const { error } = await b.db
    .from("project_materials")
    .update({ status, purchased_at: status === "purchased" ? new Date().toISOString() : null, updated_at: new Date().toISOString(), updated_by: b.me })
    .eq("id", id)
    .eq("project_id", projectId);
  if (error) return { ok: false, message: error.message };
  refresh(projectId);
  return { ok: true };
}

/** Several lines at once (Administrative › Purchasing › To buy: "Mark purchased"). */
export async function markPurchasedAction(ids: number[]): Promise<Result<{ n: number }>> {
  const b = await buyer();
  if (!b.ok) return b;
  if (!ids.length) return { ok: true, n: 0 };
  const { data, error } = await b.db
    .from("project_materials")
    .update({ status: "purchased", purchased_at: new Date().toISOString(), updated_at: new Date().toISOString(), updated_by: b.me })
    .in("id", ids)
    .eq("status", "open")
    .select("project_id");
  if (error) return { ok: false, message: error.message };
  const projects = new Set(((data ?? []) as { project_id: number }[]).map((r) => r.project_id));
  projects.forEach(refresh);
  if (!projects.size) revalidatePath("/administrative/purchasing");
  return { ok: true, n: (data ?? []).length };
}

/** A line the proposal does not have (consumables, extras). The cost comes typed, or from the product picked. */
export async function addMaterialAction(projectId: number, line: NewLine): Promise<Result<{ id: number }>> {
  const b = await buyer();
  if (!b.ok) return b;
  const bad = clean(line);
  if (bad) return { ok: false, message: bad };
  const { data, error } = await b.db
    .from("project_materials")
    .insert({ project_id: projectId, product_id: line.productId, brand: line.brand.trim() || null, model: line.model.trim() || null, name: line.name.trim() || null, quantity: line.quantity, unit_cost: line.unitCost, source: "manual", edited: true, notes: line.notes?.trim() || null, created_by: b.me, updated_by: b.me })
    .select("id")
    .single();
  if (error) return { ok: false, message: error.message };
  refresh(projectId);
  return { ok: true, id: (data as { id: number }).id };
}

/** The line stays as "replaced"; a new manual line takes its place (replaces_id) with the product picked or typed. */
export async function replaceMaterialAction(id: number, projectId: number, line: NewLine): Promise<Result<{ id: number }>> {
  const b = await buyer();
  if (!b.ok) return b;
  const bad = clean(line);
  if (bad) return { ok: false, message: bad };
  const { data, error } = await b.db
    .from("project_materials")
    .insert({ project_id: projectId, product_id: line.productId, brand: line.brand.trim() || null, model: line.model.trim() || null, name: line.name.trim() || null, quantity: line.quantity, unit_cost: line.unitCost, source: "manual", edited: true, replaces_id: id, notes: line.notes?.trim() || null, created_by: b.me, updated_by: b.me })
    .select("id")
    .single();
  if (error) return { ok: false, message: error.message };
  const { error: e2 } = await b.db.from("project_materials").update({ status: "replaced", updated_at: new Date().toISOString(), updated_by: b.me }).eq("id", id).eq("project_id", projectId);
  if (e2) return { ok: false, message: e2.message };
  refresh(projectId);
  return { ok: true, id: (data as { id: number }).id };
}

/** Quantity or unit cost typed over: the line is marked edited, so the Portal.io re-sync leaves it alone. */
export async function editMaterialAction(id: number, projectId: number, patch: { quantity?: number; unitCost?: number | null }): Promise<Result> {
  const b = await buyer();
  if (!b.ok) return b;
  const upd: Record<string, unknown> = { edited: true, updated_at: new Date().toISOString(), updated_by: b.me };
  if (patch.quantity !== undefined) {
    if (!Number.isFinite(patch.quantity) || patch.quantity <= 0) return { ok: false, message: "Quantity must be more than zero." };
    upd.quantity = patch.quantity;
  }
  if (patch.unitCost !== undefined) {
    if (patch.unitCost !== null && (!Number.isFinite(patch.unitCost) || patch.unitCost < 0)) return { ok: false, message: "The cost must be zero or more." };
    upd.unit_cost = patch.unitCost;
  }
  const { error } = await b.db.from("project_materials").update(upd).eq("id", id).eq("project_id", projectId);
  if (error) return { ok: false, message: error.message };
  refresh(projectId);
  return { ok: true };
}

/** Products for the Replace / Add pickers: the first 25 matching what was typed (name, brand, model, SKU), with cost and brand. */
export async function searchProductsAction(query: string): Promise<(ProductChoice & { cost: number | null })[]> {
  const b = await buyer();
  if (!b.ok || query.trim().length < 2) return [];
  const all = await loadProductChoices(b.db);
  const hits = all.filter((p) => productMatches(p, query)).slice(0, 25);
  if (!hits.length) return [];
  const { data } = await b.db.from("products").select("id, cost").in("id", hits.map((h) => h.id));
  const cost = new Map(((data ?? []) as { id: number; cost: number | string | null }[]).map((r) => [r.id, r.cost === null ? null : Number(r.cost)]));
  return hits.map((h) => ({ ...h, cost: cost.get(h.id) ?? null }));
}

// PU-d: the units on the job the list has no line for (red): put them on the list, or leave them out.

export type ExtraRef = { productId: number | null; model: string | null };

/** A manual line for the extra: the product (or its model), quantity = the units on the job, cost from the product. */
export async function addExtraToListAction(projectId: number, extra: ExtraRef & { count: number; title: string | null }): Promise<Result<{ id: number }>> {
  const b = await buyer();
  if (!b.ok) return b;
  if (!extra.productId && !extra.model?.trim()) return { ok: false, message: "This unit has no product and no model." };
  if (!Number.isFinite(extra.count) || extra.count <= 0) return { ok: false, message: "Quantity must be more than zero." };
  let brand: string | null = null;
  let model = extra.model?.trim() || null;
  let name = extra.title?.trim() || null;
  let cost: number | null = null;
  if (extra.productId) {
    const { data } = await b.db.from("products").select("title, model, cost, brands:brand_id(title)").eq("id", extra.productId).maybeSingle();
    const p = data as unknown as { title: string | null; model: string | null; cost: number | string | null; brands: { title: string | null } | null } | null;
    if (p) {
      brand = p.brands?.title ?? null;
      model = p.model ?? model;
      name = p.title ?? name;
      cost = p.cost === null ? null : Number(p.cost);
    }
  }
  const { data, error } = await b.db
    .from("project_materials")
    .insert({ project_id: projectId, product_id: extra.productId, brand, model, name, quantity: extra.count, unit_cost: cost, source: "manual", edited: true, notes: "Installed on the job, added from the equipment list", created_by: b.me, updated_by: b.me })
    .select("id")
    .single();
  if (error) return { ok: false, message: error.message };
  refresh(projectId);
  return { ok: true, id: (data as { id: number }).id };
}

/** Leave the extra out: it stops showing in red (undo with unignoreExtraAction). */
export async function ignoreExtraAction(projectId: number, extra: ExtraRef): Promise<Result<{ id: number }>> {
  const b = await buyer();
  if (!b.ok) return b;
  if (!extra.productId && !extra.model?.trim()) return { ok: false, message: "This unit has no product and no model." };
  const { data, error } = await b.db
    .from("project_material_ignores")
    .insert({ project_id: projectId, product_id: extra.productId, model: extra.productId ? null : extra.model!.trim(), created_by: b.me })
    .select("id")
    .single();
  if (error) return { ok: false, message: error.message };
  refresh(projectId);
  return { ok: true, id: (data as { id: number }).id };
}

export async function unignoreExtraAction(id: number, projectId: number): Promise<Result> {
  const b = await buyer();
  if (!b.ok) return b;
  const { error } = await b.db.from("project_material_ignores").delete().eq("id", id).eq("project_id", projectId);
  if (error) return { ok: false, message: error.message };
  refresh(projectId);
  return { ok: true };
}
