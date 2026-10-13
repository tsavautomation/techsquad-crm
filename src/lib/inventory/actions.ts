"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/session";
import { todayET } from "@/lib/dates";
import { recordsDb } from "@/lib/records/data";
import { saveRecord } from "@/lib/records/save";
import { adminDb } from "@/lib/supabase/admin";
import { getTable } from "@/registry";
import { canDo } from "@/registry/permissions";
import { ledgerDelta, movementOf, receiptLines, STATUSES, type MovementKey, type StockStatus } from "./engine";
import { loadProductChoices, loadUnitHistory, type HistoryRow } from "./load";
import { checkSerials, validateMovement, type ProductChoice } from "./rules";

// INV-d "Estoque em Campo": the writes. A movement updates the Stock record (status, location, client,
// responsible), its workflow stage, and adds one ledger row (stock_movements) so on-hand per location
// follows; a hand-over creates an Inventory Checkout through the ordinary write path and moves each
// unit. Permissions are the Stock / Inventory Checkout ones; the ledger is written with the service
// role, as the engines do. Everything is audited by the tables' triggers.
// INV-e adds: the movement rules (src/lib/inventory/rules.ts) checked here too, receiving a batch of
// serials, moving several units at once, purchase data on a receipt, locations from the list, and
// creating a product from the register screen.

export type ActionResult<T = object> = ({ ok: true } & T) | { ok: false; message: string };
const DEFAULT_LOCATION = "Warehouse";

type Unit = { id: number; serial: string | null; product_id: number | null; model: string | null; status: string | null; location: string | null; location_id: number | null; destination_project_id: number | null; staff_id: number | null; locked: boolean };
export type Purchase = { supplierId: number | null; poNumber: string; unitCost: number | null; receivedOn: string | null; purchasedForProjectId: number | null };
const NO_PURCHASE: Purchase = { supplierId: null, poNumber: "", unitCost: null, receivedOn: null, purchasedForProjectId: null };

async function levelIds(db: ReturnType<typeof adminDb>): Promise<Map<string, number>> {
  const { data } = await db.from("workflow_levels").select("id, title").eq("workflow_id", "stock_status");
  return new Map(((data ?? []) as { id: number; title: string }[]).map((l) => [l.title, l.id]));
}

type Place = { id: number | null; name: string };

/** The location a movement names: from the list by id, or the unit's own, or Warehouse. */
async function resolvePlace(locationId: number | null, fallback: { location: string | null; location_id: number | null } | null): Promise<Place> {
  const db = await recordsDb();
  if (locationId) {
    const { data } = await db.from("stock_locations").select("id, name").eq("id", locationId).is("deleted_at", null).maybeSingle();
    if (data) return { id: (data as { id: number }).id, name: (data as { name: string }).name };
  }
  if (fallback?.location) return { id: fallback.location_id, name: fallback.location };
  const { data: wh } = await db.from("stock_locations").select("id, name").ilike("name", DEFAULT_LOCATION).is("deleted_at", null).limit(1).maybeSingle();
  return wh ? { id: (wh as { id: number }).id, name: (wh as { name: string }).name } : { id: null, name: DEFAULT_LOCATION };
}

const prevOf = (unit: Unit): StockStatus | null => (STATUSES.includes(unit.status as StockStatus) ? (unit.status as StockStatus) : null);

/** Move one unit: Stock record + workflow stage + ledger row. Returns the stage it is in now. */
async function applyMovement(unit: Unit, key: MovementKey, o: { projectId: number | null; staffId: number | null; place: Place | null; note: string; reference?: string; purchase?: Purchase }, userId: string): Promise<StockStatus> {
  const mv = movementOf(key);
  if (!mv) throw new Error("Unknown movement.");
  const db = adminDb();
  const prev = prevOf(unit);
  const next = mv.to;
  const place: Place = next === "In Stock" && o.place ? o.place : { id: unit.location_id, name: unit.location || DEFAULT_LOCATION };
  const patch: Record<string, unknown> = { status: next, location: place.name, location_id: place.id };
  if (o.projectId !== null) patch.destination_project_id = o.projectId;
  if (next === "In Stock") patch.destination_project_id = null;
  if (o.staffId !== null) patch.staff_id = o.staffId;
  const p = o.purchase;
  if (p) {
    if (p.supplierId !== null) patch.supplier_id = p.supplierId;
    if (p.poNumber.trim()) patch.po_number = p.poNumber.trim();
    if (p.receivedOn) patch.received_on = p.receivedOn;
    if (p.purchasedForProjectId !== null) patch.purchased_for_project_id = p.purchasedForProjectId;
    if (p.unitCost !== null) patch.cost = p.unitCost;
  }
  const { error } = await db.from("stock_items").update(patch).eq("id", unit.id);
  if (error) throw new Error(`Stock record: ${error.message}`);
  const levels = await levelIds(db);
  const level = levels.get(next);
  if (level) await db.from("record_workflow_state").upsert({ table_name: "stock_items", record_id: unit.id, workflow_id: "stock_status", level_id: level, entered_at: new Date().toISOString() }, { onConflict: "table_name,record_id" });
  const delta = ledgerDelta(prev, next);
  if (unit.product_id) {
    const { error: le } = await db.from("stock_movements").insert({
      product_id: unit.product_id,
      location: place.name,
      quantity: delta,
      kind: delta > 0 ? "in" : delta < 0 ? "out" : "adjust",
      serial: unit.serial,
      reference: `${mv.label} → ${next}`,
      notes: [o.reference, o.note.trim() || null].filter(Boolean).join(" · ") || null,
      moved_at: new Date().toISOString(),
      source_ref: `mv:${randomUUID()}`,
      created_by: userId,
      supplier_id: p?.supplierId ?? null,
      po_number: p?.poNumber.trim() || null,
      unit_cost: p?.unitCost ?? null,
    });
    if (le) throw new Error(`Ledger: ${le.message}`);
  }
  return next;
}

const UNIT_COLS = "id, serial, product_id, model, status, location, location_id, destination_project_id, staff_id, locked";

async function loadUnit(id: number): Promise<Unit | null> {
  const db = await recordsDb();
  const { data } = await db.from("stock_items").select(UNIT_COLS).eq("id", id).is("deleted_at", null).maybeSingle();
  return (data as Unit | null) ?? null;
}

/** Create the Stock record of a serial never seen before, through the ordinary form rules (SKU required). */
async function createUnit(serial: string, productId: number, place: Place, purchase: Purchase): Promise<ActionResult<{ unit: Unit }>> {
  const t = getTable("stock_items");
  const r = await saveRecord(t.name, null, {
    title: serial,
    product_id: productId,
    serial,
    location: place.name,
    location_id: place.id,
    status: "In Stock",
    supplier_id: purchase.supplierId,
    po_number: purchase.poNumber.trim() || null,
    received_on: purchase.receivedOn,
    purchased_for_project_id: purchase.purchasedForProjectId,
    ...(purchase.unitCost !== null ? { cost: purchase.unitCost } : {}),
  });
  if (!r.ok) return { ok: false, message: r.message ?? Object.values(r.errors)[0] ?? "Could not create the Stock record." };
  const unit = await loadUnit(r.id);
  if (!unit) return { ok: false, message: "Could not read the new Stock record." };
  // Created In Stock already: only the ledger row is still owed, so the movement starts from "never seen".
  return { ok: true, unit: { ...unit, status: null } };
}

export type MovementInput = { itemId: number | null; serial: string; productId: number | null; movement: MovementKey; projectId: number | null; staffId: number | null; locationId: number | null; note: string; purchase?: Purchase };

/** Register one movement for a unit (an existing Stock record, or a new serial that is created on the spot). */
export async function registerMovementAction(input: MovementInput): Promise<ActionResult<{ itemId: number; status: StockStatus }>> {
  const user = await requireUser();
  const t = getTable("stock_items");
  const mv = movementOf(input.movement);
  if (!mv) return { ok: false, message: "Unknown movement." };
  let unit = input.itemId ? await loadUnit(input.itemId) : null;
  if (!unit && input.itemId) return { ok: false, message: "Stock record not found." };
  const place = await resolvePlace(input.locationId, unit);
  const why = validateMovement(input.movement, unit ? prevOf(unit) : null, { projectId: input.projectId, staffId: input.staffId, location: place.name, note: input.note });
  if (why) return { ok: false, message: why };
  if (unit) {
    if (!canDo(user.permissions, t, "modify", getTable)) return { ok: false, message: "You don't have permission to change stock." };
    if (unit.locked) return { ok: false, message: "This Stock record is locked." };
  } else {
    if (!canDo(user.permissions, t, "create", getTable)) return { ok: false, message: "You don't have permission to add stock." };
    const serial = input.serial.trim();
    if (!serial) return { ok: false, message: "Type or scan the serial." };
    if (!input.productId) return { ok: false, message: "Choose the product for this new serial." };
    const db = await recordsDb();
    const { data: dup } = await db.from("stock_items").select("id").ilike("serial", serial).is("deleted_at", null).limit(1);
    if (dup?.length) return { ok: false, message: "That serial already exists." };
    const c = await createUnit(serial, input.productId, place, input.purchase ?? NO_PURCHASE);
    if (!c.ok) return c;
    unit = c.unit;
  }
  try {
    const status = await applyMovement(unit, input.movement, { projectId: input.projectId, staffId: input.staffId, place, note: input.note, purchase: input.movement === "receive" ? input.purchase : undefined }, user.id);
    revalidatePath("/inventory/stock");
    return { ok: true, itemId: unit.id, status };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  }
}

export type BatchInput = { productId: number; serials: string[]; locationId: number | null; note: string; purchase: Purchase };

/** Receive several new serials of one product in one go: one Stock record and one ledger row each (INV-e). */
export async function receiveBatchAction(input: BatchInput): Promise<ActionResult<{ created: number; skipped: { serial: string; why: string }[] }>> {
  const user = await requireUser();
  const t = getTable("stock_items");
  if (!canDo(user.permissions, t, "create", getTable)) return { ok: false, message: "You don't have permission to add stock." };
  if (!input.productId) return { ok: false, message: "Choose the product." };
  const serials = input.serials.map((s) => s.trim()).filter(Boolean);
  if (!serials.length) return { ok: false, message: "Scan or type at least one serial." };
  const db = await recordsDb();
  const existing = new Set<string>();
  for (let i = 0; i < serials.length; i += 200) {
    const { data } = await db.from("stock_items").select("serial").in("serial", serials.slice(i, i + 200)).is("deleted_at", null);
    for (const r of (data ?? []) as { serial: string | null }[]) if (r.serial) existing.add(r.serial.toLowerCase());
  }
  const place = await resolvePlace(input.locationId, null);
  const why = validateMovement("receive", null, { projectId: null, staffId: null, location: place.name, note: input.note });
  if (why) return { ok: false, message: why };
  const skipped: { serial: string; why: string }[] = [];
  let created = 0;
  for (const s of checkSerials(serials, existing)) {
    if (s.problem) {
      skipped.push({ serial: s.serial, why: s.problem === "exists" ? "already in the system" : "repeated in the list" });
      continue;
    }
    const c = await createUnit(s.serial, input.productId, place, input.purchase);
    if (!c.ok) {
      skipped.push({ serial: s.serial, why: c.message });
      continue;
    }
    try {
      await applyMovement(c.unit, "receive", { projectId: null, staffId: null, place, note: input.note, purchase: input.purchase }, user.id);
      created++;
    } catch (e) {
      skipped.push({ serial: s.serial, why: e instanceof Error ? e.message : String(e) });
    }
  }
  revalidatePath("/inventory/stock");
  return { ok: true, created, skipped };
}

export type MoveManyInput = { itemIds: number[]; movement: MovementKey; projectId: number | null; staffId: number | null; locationId: number | null; note: string };

/** The same movement for several units (INV-e): each one checked against the rules, one ledger row each. */
export async function moveManyAction(input: MoveManyInput): Promise<ActionResult<{ moved: number; skipped: { serial: string; why: string }[] }>> {
  const user = await requireUser();
  if (!canDo(user.permissions, getTable("stock_items"), "modify", getTable)) return { ok: false, message: "You don't have permission to change stock." };
  if (!movementOf(input.movement)) return { ok: false, message: "Unknown movement." };
  if (!input.itemIds.length) return { ok: false, message: "Select at least one unit." };
  const skipped: { serial: string; why: string }[] = [];
  let moved = 0;
  for (const id of input.itemIds) {
    const unit = await loadUnit(id);
    if (!unit) {
      skipped.push({ serial: `#${id}`, why: "not found" });
      continue;
    }
    const place = await resolvePlace(input.locationId, unit);
    const why = unit.locked ? "locked" : validateMovement(input.movement, prevOf(unit), { projectId: input.projectId, staffId: input.staffId, location: place.name, note: input.note });
    if (why) {
      skipped.push({ serial: unit.serial ?? `#${unit.id}`, why });
      continue;
    }
    try {
      await applyMovement(unit, input.movement, { projectId: input.projectId, staffId: input.staffId, place, note: input.note }, user.id);
      moved++;
    } catch (e) {
      skipped.push({ serial: unit.serial ?? `#${unit.id}`, why: e instanceof Error ? e.message : String(e) });
    }
  }
  revalidatePath("/inventory/stock");
  return { ok: true, moved, skipped };
}

export type NewProductInput = { brandId: number | null; model: string; productType: string | null; supplierId: number | null; cost: number | null; sku: string };

/** A product created from the register screen (INV-e), through the ordinary Products form rules. */
export async function createProductAction(input: NewProductInput): Promise<ActionResult<{ product: ProductChoice }>> {
  const user = await requireUser();
  const t = getTable("products");
  if (!canDo(user.permissions, t, "create", getTable)) return { ok: false, message: "You don't have permission to add products." };
  const model = input.model.trim();
  if (!model) return { ok: false, message: "Type the model." };
  const r = await saveRecord(t.name, null, { brand_id: input.brandId, model, product_type: input.productType || null, supplier_id: input.supplierId, cost: input.cost, sku: input.sku.trim() || null });
  if (!r.ok) return { ok: false, message: r.message ?? Object.values(r.errors)[0] ?? "Could not create the product." };
  const db = await recordsDb();
  const product = (await loadProductChoices(db)).find((p) => p.id === r.id);
  if (!product) return { ok: false, message: "Could not read the new product." };
  revalidatePath("/inventory/stock");
  return { ok: true, product };
}

export type HandoverInput = { type: "Materials for a Project" | "Tools for Technician"; projectId: number | null; technicianId: number | null; itemIds: number[]; movement: MovementKey; note: string };

/** The hand-over receipt: an Inventory Checkout with one line per unit, and the units moved. */
export async function createHandoverAction(input: HandoverInput): Promise<ActionResult<{ checkoutId: number }>> {
  const user = await requireUser();
  const ct = getTable("inventory_checkouts");
  if (!canDo(user.permissions, ct, "create", getTable)) return { ok: false, message: "You don't have permission to create an Inventory Checkout." };
  if (!canDo(user.permissions, getTable("stock_items"), "modify", getTable)) return { ok: false, message: "You don't have permission to change stock." };
  if (!movementOf(input.movement)) return { ok: false, message: "Unknown movement." };
  if (!input.itemIds.length) return { ok: false, message: "Pick at least one unit." };
  if (input.type === "Materials for a Project" && !input.projectId) return { ok: false, message: "Choose the project." };
  const units: Unit[] = [];
  for (const id of input.itemIds) {
    const u = await loadUnit(id);
    if (!u) return { ok: false, message: `Stock record #${id} not found.` };
    const why = validateMovement(input.movement, prevOf(u), { projectId: input.projectId, staffId: input.technicianId, location: u.location, note: input.note || "hand-over" });
    if (why) return { ok: false, message: `${u.serial ?? `#${u.id}`}: ${why}` };
    units.push(u);
  }
  const equipment = receiptLines(units.map((u) => ({ serial: u.serial, product: u.model || `#${u.product_id}` })));
  const r = await saveRecord(ct.name, null, {
    type: input.type,
    project_id: input.projectId,
    technician_id: input.technicianId,
    date: todayET(),
    equipment: [equipment, input.note.trim() ? `\n${input.note.trim()}` : ""].join(""),
  });
  if (!r.ok) return { ok: false, message: r.message ?? Object.values(r.errors)[0] ?? "Could not create the Inventory Checkout." };
  try {
    for (const u of units) await applyMovement(u, input.movement, { projectId: input.projectId, staffId: input.technicianId, place: null, note: "", reference: `Inventory Checkout #${r.id}` }, user.id);
  } catch (e) {
    return { ok: false, message: `Checkout #${r.id} was created, but a unit could not be moved: ${e instanceof Error ? e.message : String(e)}` };
  }
  revalidatePath("/inventory/stock");
  revalidatePath("/inventory/inventory-checkout");
  return { ok: true, checkoutId: r.id };
}

/** A unit's ledger history, for the item sheet. */
export async function unitHistoryAction(serial: string | null): Promise<HistoryRow[]> {
  await requireUser();
  return loadUnitHistory(await recordsDb(), serial);
}
