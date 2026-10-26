"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/session";
import { recordsDb } from "@/lib/records/data";
import { canSeeEbay } from "./load";

// F32: working the Ebay board. Anyone with the tab marks a sale shipped (with the tracking number), takes it
// back, or saves tracking and notes. Rows are created only by the mailbox check.

export type Result = { ok: true } | { ok: false; message: string };

async function gate(id: number): Promise<Result & { userId?: string }> {
  const user = await requireUser();
  if (!canSeeEbay(user)) return { ok: false, message: "You don't have the Ebay permission." };
  if (!Number.isInteger(id)) return { ok: false, message: "Bad request." };
  return { ok: true, userId: user.id };
}

async function patch(id: number, values: Record<string, unknown>): Promise<Result> {
  const db = await recordsDb();
  const { data, error } = await db.from("ebay_sales").update(values).eq("id", id).select("id");
  if (error) return { ok: false, message: error.message };
  if (!(data as unknown[] | null)?.length) return { ok: false, message: "That sale is gone or you may not change it." };
  revalidatePath("/inventory/ebay");
  return { ok: true };
}

/** Shipped: the tile moves to the history, with the tracking number for the record. */
export async function markShippedAction(id: number, tracking: string): Promise<Result> {
  const g = await gate(id);
  if (!g.ok) return g;
  const t = tracking.trim().slice(0, 80);
  return patch(id, { status: "shipped", shipped_at: new Date().toISOString(), shipped_by: g.userId, ...(t ? { tracking: t } : {}) });
}

/** Back to the board (the label is kept, so the status returns to label ready or sold). */
export async function unshipAction(id: number): Promise<Result> {
  const g = await gate(id);
  if (!g.ok) return g;
  const db = await recordsDb();
  const { data } = await db.from("ebay_sales").select("label_mail_id").eq("id", id).maybeSingle();
  const hasLabel = Boolean((data as { label_mail_id: number | null } | null)?.label_mail_id);
  return patch(id, { status: hasLabel ? "label_ready" : "sold", shipped_at: null, shipped_by: null });
}

export async function saveSaleFieldsAction(id: number, fields: { tracking?: string; notes?: string }): Promise<Result> {
  const g = await gate(id);
  if (!g.ok) return g;
  const values: Record<string, unknown> = {};
  if (fields.tracking !== undefined) values.tracking = fields.tracking.trim().slice(0, 80) || null;
  if (fields.notes !== undefined) values.notes = fields.notes.trim().slice(0, 2000) || null;
  if (!Object.keys(values).length) return { ok: true };
  return patch(id, values);
}
