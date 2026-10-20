import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { codeKey, serialKey } from "@/lib/insights/stats";
import type { Values } from "@/lib/rules/evaluate";

// Table-specific checks that need the database, run by saveRecord after the registry validation
// (Jessica 2026-10-20: products with the same SKU under two spellings, two Stock records for one serial).
// A check returns field → message; the messages are fixed English texts the screens translate.

type Check = (db: SupabaseClient, id: number | null, values: Values) => Promise<Record<string, string>>;

const text = (v: unknown) => (typeof v === "string" ? v.trim() : "");

/** Products: no second product with the same SKU / UPC, ignoring case, punctuation and leading zeros. */
const productSku: Check = async (db, id, values) => {
  const key = codeKey(text(values.sku));
  if (!key) return {};
  const { data } = await db.from("products").select("id, sku").is("deleted_at", null).not("sku", "is", null);
  const hit = ((data ?? []) as { id: number; sku: string | null }[]).find((p) => p.id !== id && codeKey(p.sku) === key);
  return hit ? { sku: "Another product already has this SKU" } : ({} as Record<string, string>);
};

/** Stock: one live Stock record per serial. */
const stockSerial: Check = async (db, id, values) => {
  const serial = text(values.serial);
  if (!serial) return {};
  const { data } = await db.from("stock_items").select("id, serial").is("deleted_at", null).ilike("serial", serial.replace(/[%_]/g, "_"));
  const hit = ((data ?? []) as { id: number; serial: string | null }[]).find((u) => u.id !== id && serialKey(u.serial) === serialKey(serial));
  return hit ? { serial: "Another Stock record already has this serial" } : ({} as Record<string, string>);
};

export const TABLE_CHECKS: Record<string, Check> = { products: productSku, stock_items: stockSerial };
