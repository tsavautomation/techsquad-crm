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
import { loadUnitHistory, type HistoryRow } from "./load";

// INV-d "Estoque em Campo": the writes. A movement updates the Stock record (status, location, client,
// responsible), its workflow stage, and adds one ledger row (stock_movements) so on-hand per location
// follows; a hand-over creates an Inventory Checkout through the ordinary write path and moves each
// unit. Permissions are the Stock / Inventory Checkout ones; the ledger is written with the service
// role, as the engines do. Everything is audited by the tables' triggers.

export type ActionResult<T = object> = ({ ok: true } & T) | { ok: false; message: string };
const DEFAULT_LOCATION = "Warehouse";

type Unit = { id: number; serial: string | null; product_id: number | null; model: string | null; status: string | null; location: string | null; destination_project_id: number | null; staff_id: number | null; locked: boolean };

async function levelIds(db: ReturnType<typeof adminDb>): Promise<Map<string, number>> {
  const { data } = await db.from("workflow_levels").select("id, title").eq("workflow_id", "stock_status");
  return new Map(((data ?? []) as { id: number; title: string }[]).map((l) => [l.title, l.id]));
}

/** Move one unit: Stock record + workflow stage + ledger row. Returns the stage it is in now. */
async function applyMovement(unit: Unit, key: MovementKey, o: { projectId: number | null; staffId: number | null; location: string | null; note: string; reference?: string }, userId: string): Promise<StockStatus> {
  const mv = movementOf(key);
  if (!mv) throw new Error("Unknown movement.");
  const db = adminDb();
  const prev = STATUSES.includes(unit.status as StockStatus) ? (unit.status as StockStatus) : null;
  const next = mv.to;
  const location = next === "In Stock" ? o.location || unit.location || DEFAULT_LOCATION : unit.location || DEFAULT_LOCATION;
  const patch: Record<string, unknown> = { status: next, location };
  if (o.projectId !== null) patch.destination_project_id = o.projectId;
  if (next === "In Stock") patch.destination_project_id = null;
  if (o.staffId !== null) patch.staff_id = o.staffId;
  const { error } = await db.from("stock_items").update(patch).eq("id", unit.id);
  if (error) throw new Error(`Stock record: ${error.message}`);
  const levels = await levelIds(db);
  const level = levels.get(next);
  if (level) await db.from("record_workflow_state").upsert({ table_name: "stock_items", record_id: unit.id, workflow_id: "stock_status", level_id: level, entered_at: new Date().toISOString() }, { onConflict: "table_name,record_id" });
  const delta = ledgerDelta(prev, next);
  if (unit.product_id) {
    const { error: le } = await db.from("stock_movements").insert({
      product_id: unit.product_id,
      location,
      quantity: delta,
      kind: delta > 0 ? "in" : delta < 0 ? "out" : "adjust",
      serial: unit.serial,
      reference: `${mv.label} → ${next}`,
      notes: [o.reference, o.note.trim() || null].filter(Boolean).join(" · ") || null,
      moved_at: new Date().toISOString(),
      source_ref: `mv:${randomUUID()}`,
      created_by: userId,
    });
    if (le) throw new Error(`Ledger: ${le.message}`);
  }
  return next;
}

async function loadUnit(id: number): Promise<Unit | null> {
  const db = await recordsDb();
  const { data } = await db.from("stock_items").select("id, serial, product_id, model, status, location, destination_project_id, staff_id, locked").eq("id", id).is("deleted_at", null).maybeSingle();
  return (data as Unit | null) ?? null;
}

export type MovementInput = { itemId: number | null; serial: string; productId: number | null; movement: MovementKey; projectId: number | null; staffId: number | null; location: string | null; note: string };

/** Register one movement for a unit (an existing Stock record, or a new serial that is created on the spot). */
export async function registerMovementAction(input: MovementInput): Promise<ActionResult<{ itemId: number; status: StockStatus }>> {
  const user = await requireUser();
  const t = getTable("stock_items");
  const mv = movementOf(input.movement);
  if (!mv) return { ok: false, message: "Unknown movement." };
  let unit = input.itemId ? await loadUnit(input.itemId) : null;
  if (!unit && input.itemId) return { ok: false, message: "Stock record not found." };
  if (unit) {
    if (!canDo(user.permissions, t, "modify", getTable)) return { ok: false, message: "You don't have permission to change stock." };
    if (unit.locked) return { ok: false, message: "This Stock record is locked." };
  } else {
    // A serial the CRM has never seen: created through the ordinary form rules (SKU required).
    if (!canDo(user.permissions, t, "create", getTable)) return { ok: false, message: "You don't have permission to add stock." };
    const serial = input.serial.trim();
    if (!serial) return { ok: false, message: "Type or scan the serial." };
    if (!input.productId) return { ok: false, message: "Choose the product for this new serial." };
    const db = await recordsDb();
    const { data: dup } = await db.from("stock_items").select("id").eq("serial", serial).is("deleted_at", null).limit(1);
    if (dup?.length) return { ok: false, message: "That serial already exists." };
    const r = await saveRecord(t.name, null, { title: serial, product_id: input.productId, serial, location: input.location || DEFAULT_LOCATION, status: "In Stock" });
    if (!r.ok) return { ok: false, message: r.message ?? Object.values(r.errors)[0] ?? "Could not create the Stock record." };
    unit = await loadUnit(r.id);
    if (!unit) return { ok: false, message: "Could not read the new Stock record." };
    if (mv.to === "In Stock") {
      // Created In Stock already: only the ledger row is still owed.
      unit = { ...unit, status: null };
    }
  }
  try {
    const status = await applyMovement(unit, input.movement, { projectId: input.projectId, staffId: input.staffId, location: input.location, note: input.note }, user.id);
    revalidatePath("/inventory/stock");
    return { ok: true, itemId: unit.id, status };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  }
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
    for (const u of units) await applyMovement(u, input.movement, { projectId: input.projectId, staffId: input.technicianId, location: null, note: "", reference: `Inventory Checkout #${r.id}` }, user.id);
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
