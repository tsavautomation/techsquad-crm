import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { STATUSES, type StockStatus } from "./engine";

// INV-d "Estoque em Campo": what the stock screens read. Through the viewer's session, so the Stock
// permissions apply (row-level security on stock_items; stock_movements readable by Stock viewers).

export type StockUnit = {
  id: number;
  serial: string | null;
  mac: string | null;
  product: string;
  productId: number | null;
  status: StockStatus;
  location: string | null;
  client: string | null;
  projectId: number | null;
  staff: string | null;
  staffId: number | null;
  cost: number | null;
  updatedAt: string;
};

type Row = {
  id: number;
  serial: string | null;
  mac_address: string | null;
  model: string | null;
  product_id: number | null;
  status: string | null;
  location: string | null;
  destination_project_id: number | null;
  staff_id: number | null;
  cost: number | null;
  updated_at: string;
  products: { title: string | null; model: string | null; cost: number | null } | null;
};
const COLS = "id, serial, mac_address, model, product_id, status, location, destination_project_id, staff_id, cost, updated_at, products(title, model, cost)";

/** Titles of projects and employees by id (employee_names is readable by everyone; projects follow their own permissions). */
async function names(db: SupabaseClient, table: "projects" | "employee_names", ids: (number | null)[]): Promise<Map<number, string>> {
  const list = [...new Set(ids.filter((x): x is number => x !== null))];
  const out = new Map<number, string>();
  for (let i = 0; i < list.length; i += 500) {
    const { data } = await db.from(table).select("id, title").in("id", list.slice(i, i + 500));
    for (const r of (data ?? []) as { id: number; title: string | null }[]) if (r.title) out.set(r.id, r.title);
  }
  return out;
}

const asStatus = (s: string | null): StockStatus => (STATUSES.includes(s as StockStatus) ? (s as StockStatus) : "In Stock");

/** Every live Stock record (not deleted, not archived), 1,000 at a time. */
export async function loadStockUnits(db: SupabaseClient): Promise<StockUnit[]> {
  const out: StockUnit[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db.from("stock_items").select(COLS).is("deleted_at", null).is("archived_at", null).order("updated_at", { ascending: false }).range(from, from + 999);
    if (error) throw new Error(`stock: ${error.message}`);
    const rows = (data ?? []) as unknown as Row[];
    const [projects, staff] = await Promise.all([names(db, "projects", rows.map((r) => r.destination_project_id)), names(db, "employee_names", rows.map((r) => r.staff_id))]);
    out.push(
      ...rows.map((r) => ({
        id: r.id,
        serial: r.serial,
        mac: r.mac_address,
        product: r.products?.model || r.model || r.products?.title || `#${r.product_id ?? "?"}`,
        productId: r.product_id,
        status: asStatus(r.status),
        location: r.location,
        client: r.destination_project_id ? (projects.get(r.destination_project_id) ?? null) : null,
        projectId: r.destination_project_id,
        staff: r.staff_id ? (staff.get(r.staff_id) ?? null) : null,
        staffId: r.staff_id,
        cost: r.cost ?? r.products?.cost ?? null,
        updatedAt: r.updated_at,
      })),
    );
    if (rows.length < 1000) return out;
  }
}

export type PickLists = { projects: { id: number; title: string }[]; employees: { id: number; title: string }[]; products: { id: number; title: string }[] };

/** The lists the forms pick from: open projects, active employees, products (title with the model). */
export async function loadPickLists(db: SupabaseClient): Promise<PickLists> {
  const [{ data: pr }, { data: em }, products] = await Promise.all([
    db.from("projects").select("id, title").is("deleted_at", null).is("archived_at", null).not("title", "is", null).order("title"),
    db.from("employee_names").select("id, title").is("deleted_at", null).is("archived_at", null).neq("status", "Inactive").not("title", "is", null).order("title"),
    (async () => {
      const out: { id: number; title: string }[] = [];
      for (let from = 0; ; from += 1000) {
        const { data } = await db.from("products").select("id, title, model").is("deleted_at", null).order("model").range(from, from + 999);
        const rows = (data ?? []) as { id: number; title: string | null; model: string | null }[];
        out.push(...rows.map((p) => ({ id: p.id, title: p.title || p.model || `#` })));
        if (rows.length < 1000) return out;
      }
    })(),
  ]);
  return {
    projects: ((pr ?? []) as { id: number; title: string }[]),
    employees: ((em ?? []) as { id: number; title: string }[]),
    products,
  };
}

export type HistoryRow = { at: string; what: string; status: StockStatus | null; location: string | null; quantity: number; notes: string | null; who: string | null };

/** A unit's history: its ledger rows (by serial) newest first. */
export async function loadUnitHistory(db: SupabaseClient, serial: string | null): Promise<HistoryRow[]> {
  if (!serial) return [];
  const { data } = await db.from("stock_movements").select("moved_at, kind, reference, location, quantity, notes, created_by").eq("serial", serial).order("moved_at", { ascending: false }).limit(100);
  const rows = (data ?? []) as { moved_at: string; kind: string; reference: string | null; location: string | null; quantity: number; notes: string | null; created_by: string | null }[];
  const ids = [...new Set(rows.map((r) => r.created_by).filter((x): x is string => Boolean(x)))];
  const { data: people } = ids.length ? await db.from("profiles").select("id, first_name, last_name").in("id", ids) : { data: [] };
  const name = new Map(((people ?? []) as { id: string; first_name: string | null; last_name: string | null }[]).map((p) => [p.id, [p.first_name, p.last_name].filter(Boolean).join(" ")]));
  return rows.map((r) => {
    // "Installed → On Project": the reference carries the movement and the stage it left the unit in.
    const m = (r.reference ?? "").match(/^(.*?) → (.*)$/);
    return { at: r.moved_at, what: m ? m[1] : r.reference || r.kind, status: m && STATUSES.includes(m[2] as StockStatus) ? (m[2] as StockStatus) : null, location: r.location, quantity: Number(r.quantity), notes: r.notes, who: r.created_by ? (name.get(r.created_by) ?? null) : null };
  });
}

export type RecentCheckout = { id: number; date: string | null; technician: string | null; project: string | null; lines: number };

/** The last hand-overs (Inventory Checkouts) for the receipts tab. */
export async function loadRecentCheckouts(db: SupabaseClient): Promise<RecentCheckout[]> {
  const { data } = await db.from("inventory_checkouts").select("id, date, equipment, project_id, technician_id").is("deleted_at", null).order("id", { ascending: false }).limit(8);
  const rows = (data ?? []) as { id: number; date: string | null; equipment: string | null; project_id: number | null; technician_id: number | null }[];
  const [projects, techs] = await Promise.all([names(db, "projects", rows.map((r) => r.project_id)), names(db, "employee_names", rows.map((r) => r.technician_id))]);
  return rows.map((c) => ({
    id: c.id,
    date: c.date,
    technician: c.technician_id ? (techs.get(c.technician_id) ?? null) : null,
    project: c.project_id ? (projects.get(c.project_id) ?? null) : null,
    lines: (c.equipment ?? "").split(/\r?\n/).filter((l) => l.trim()).length,
  }));
}
