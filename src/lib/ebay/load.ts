import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { CurrentUser } from "@/lib/auth/session";
import type { SaleStatus } from "./engine";

// F32: what Inventory › Ebay reads (the signed-in user's client; RLS applies).

export const EBAY_PERMISSION = "inventory.ebay.view_page";
export const canSeeEbay = (user: CurrentUser) => user.isSysadmin || user.permissions.has(EBAY_PERMISSION);

export type Sale = {
  id: number;
  order_number: string | null;
  item_id: string | null;
  item_title: string | null;
  quantity: number | null;
  price: number | null;
  shipping: number | null;
  total: number | null;
  buyer_name: string | null;
  buyer_username: string | null;
  ship_to: string | null;
  sold_at: string | null;
  sale_mail_id: number | null;
  label_mail_id: number | null;
  label_url: string | null;
  label_ready_at: string | null;
  tracking: string | null;
  status: SaleStatus;
  shipped_at: string | null;
  shipped_by_name: string | null;
  notes: string | null;
  extraction: "ai" | "fallback";
  extraction_error: string | null;
  raw_sale_text: string | null;
  raw_label_text: string | null;
  created_at: string;
};

const COLS = "id, order_number, item_id, item_title, quantity, price, shipping, total, buyer_name, buyer_username, ship_to, sold_at, sale_mail_id, label_mail_id, label_url, label_ready_at, tracking, status, shipped_at, shipped_by, notes, extraction, extraction_error, raw_sale_text, raw_label_text, created_at";

export async function loadSales(db: SupabaseClient): Promise<{ toShip: Sale[]; shipped: Sale[] }> {
  const { data } = await db.from("ebay_sales").select(COLS).order("created_at", { ascending: false }).limit(500);
  type Row = Omit<Sale, "shipped_by_name"> & { shipped_by: string | null };
  const rows = (data ?? []) as Row[];
  const ids = [...new Set(rows.map((r) => r.shipped_by).filter((x): x is string => Boolean(x)))];
  const { data: profiles } = ids.length ? await db.from("profiles").select("id, first_name, last_name, email").in("id", ids) : { data: [] };
  const names = new Map(((profiles ?? []) as { id: string; first_name: string | null; last_name: string | null; email: string }[]).map((p) => [p.id, [p.first_name, p.last_name].filter(Boolean).join(" ") || p.email]));
  const sales: Sale[] = rows.map(({ shipped_by, ...r }) => ({ ...r, shipped_by_name: shipped_by ? (names.get(shipped_by) ?? null) : null }));
  return { toShip: sales.filter((s) => s.status !== "shipped"), shipped: sales.filter((s) => s.status === "shipped") };
}
