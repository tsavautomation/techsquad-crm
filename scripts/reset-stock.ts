/**
 * Replace the current stock with Fred's spreadsheet (INV-d, SPEC §9.1, 2026-10-07: "manter tudo que for
 * Inventory checkout como está, mas limpar todo estoque atual, warehouse e vans; usar esta lista como o
 * estoque atual e correto").
 *
 *   npx tsx --env-file=.env.local scripts/reset-stock.ts <Estoque.xlsm>            # dry run
 *   npx tsx --env-file=.env.local scripts/reset-stock.ts <Estoque.xlsm> --apply    # do it
 *
 * The sheet "Movimentacoes" is a per-serial movement log; a unit is in stock when its last movement's
 * resulting status (sheet "Configuracoes", Tipos de Movimento → Status Resultante) is "Em Estoque".
 * What the script does, idempotently (every row it writes carries a source_ref):
 *   1. products the CRM does not have (by model / SKU / title, ignoring spaces and dashes) are created
 *      with the code as title and model, and the sheet's price as cost;
 *   2. the ledger is zeroed: one 'adjust' movement per product and location for minus what is on hand
 *      (computed without the rows this script writes, so a re-run changes nothing);
 *   3. one 'opening' movement per in-stock serial, quantity 1, location Warehouse (the sheet has no vans);
 *   4. Stock records: current "In Stock" units whose serial is not in the sheet are soft-deleted; sheet
 *      serials get a Stock record (status In Stock, workflow stage In Stock) when they have none.
 * Inventory Checkouts and their movements are not touched; RMA units are not touched.
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { strFromU8, unzipSync } from "fflate";

const [file, ...flags] = process.argv.slice(2);
if (!file) throw new Error("usage: tsx scripts/reset-stock.ts <Estoque.xlsm> [--apply]");
const apply = flags.includes("--apply");
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!);
const STAMP = "2026-10-07";
const LOCATION = "Warehouse";
const REF = "Estoque_v14 (Fred, 10/7/2026)";

// ---------------------------------------------------------------- reading the .xlsm (exceljs chokes on its drawings)
type Row = Record<string, string | number | boolean>;
function readSheets(path: string): Record<string, Row[]> {
  const z = unzipSync(new Uint8Array(readFileSync(path)));
  const xml = (p: string) => (z[p] ? strFromU8(z[p]) : "");
  const unesc = (s: string) => s.replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n))).replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");
  const shared = [...xml("xl/sharedStrings.xml").matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => unesc([...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((t) => t[1]).join("")));
  const rels = xml("xl/_rels/workbook.xml.rels");
  const target = (id: string) => (rels.match(new RegExp(`<Relationship [^>]*Id="${id}"[^>]*Target="([^"]+)"`)) ?? rels.match(new RegExp(`<Relationship [^>]*Target="([^"]+)"[^>]*Id="${id}"`)))?.[1] ?? "";
  const out: Record<string, Row[]> = {};
  for (const m of xml("xl/workbook.xml").matchAll(/<sheet [^>]*name="([^"]+)"[^>]*r:id="([^"]+)"/g)) {
    const rows: Row[] = [];
    for (const r of xml("xl/" + target(m[2]).replace(/^\/?xl\//, "")).matchAll(/<row [^>]*r="(\d+)"[^>]*>([\s\S]*?)<\/row>/g)) {
      const cells: Row = { r: Number(r[1]) };
      for (const c of r[2].matchAll(/<c r="([A-Z]+)\d+"([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
        const t = c[2].match(/t="([^"]+)"/)?.[1];
        const v = c[3]?.match(/<v>([\s\S]*?)<\/v>/)?.[1];
        let val: string | number | boolean | null = null;
        if (t === "s" && v !== undefined) val = shared[Number(v)];
        else if (t === "inlineStr") val = unesc([...(c[3] ?? "").matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((x) => x[1]).join(""));
        else if (v !== undefined) val = t === "b" ? v === "1" : isNaN(Number(v)) ? unesc(v) : Number(v);
        if (val !== null && val !== "") cells[c[1].replace(/\d+/g, "")] = val;
      }
      if (Object.keys(cells).length > 1) rows.push(cells);
    }
    out[unesc(m[1])] = rows;
  }
  return out;
}

const key = (s: unknown) => String(s ?? "").toUpperCase().replace(/[^A-Z0-9]+/g, "");
const str = (s: unknown) => String(s ?? "").trim();

async function allRows<T>(table: string, cols: string, filter?: (q: ReturnType<typeof db.from>["select"] extends never ? never : unknown) => unknown): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += 1000) {
    let q = db.from(table).select(cols).range(from, from + 999);
    if (filter) q = filter(q) as typeof q;
    const { data, error } = await q;
    if (error) throw new Error(`${table}: ${error.message}`);
    out.push(...((data ?? []) as T[]));
    if ((data ?? []).length < 1000) return out;
  }
}

async function main() {
  const sheets = readSheets(file);
  const cfg = sheets.Configuracoes ?? [];
  const statusOf = new Map(cfg.filter((r) => r.E && r.F).map((r) => [str(r.E), str(r.F)]));
  const price = new Map(cfg.filter((r) => r.A && typeof r.B === "number").map((r) => [key(r.A), Number(r.B)]));
  const moves = (sheets.Movimentacoes ?? []).filter((r) => Number(r.r) >= 3 && r.C && r.B !== undefined);
  const last = new Map<string, Row>();
  for (const r of moves) last.set(str(r.B), r);
  const inStock = [...last.entries()].filter(([, r]) => statusOf.get(str(r.D)) === "Em Estoque").map(([serial, r]) => ({ serial, code: str(r.C), employee: str(r.G) || null }));
  const codes = [...new Set(inStock.map((u) => u.code))];
  console.log(`Sheet: ${moves.length} movements, ${last.size} serials, ${inStock.length} in stock across ${codes.length} products.`);

  // 1. Products.
  type P = { id: number; title: string | null; sku: string | null; model: string | null; source_ref: string | null };
  const products = await allRows<P>("products", "id, title, sku, model, source_ref", (q) => (q as { is: (c: string, v: null) => unknown }).is("deleted_at", null));
  const index = new Map<string, number>();
  for (const p of products) for (const k of [p.model, p.sku, p.title, (p.title ?? "").replace(/\s*\(.*\)$/, "")]) if (k && key(k) && !index.has(key(k))) index.set(key(k), p.id);
  // Two spellings of one code ("DM NAX AUD- IO" / "DM-NAX-AUD-IO") make one product.
  const missing = [...new Map(codes.filter((c) => !index.has(key(c))).map((c) => [key(c), c])).values()];
  console.log(`Products: ${codes.length - missing.length} known, ${missing.length} to create: ${missing.slice(0, 15).join(", ")}${missing.length > 15 ? "…" : ""}`);
  if (apply && missing.length) {
    const present = new Set(products.map((p) => p.source_ref));
    const rows = missing.filter((code) => !present.has(`estoque:${key(code)}`)).map((code) => ({ source_ref: `estoque:${key(code)}`, title: code, model: code, cost: price.get(key(code)) ?? null }));
    for (let i = 0; i < rows.length; i += 200) {
      // products.source_ref has no unique index: rows already present (by source_ref) were excluded above.
      const { data, error } = await db.from("products").insert(rows.slice(i, i + 200)).select("id, model");
      if (error) throw new Error(`products: ${error.message}`);
      for (const p of (data ?? []) as { id: number; model: string }[]) index.set(key(p.model), p.id);
    }
    console.log(`✓ ${rows.length} products created`);
  }
  const productOf = (code: string) => index.get(key(code)) ?? null;

  // 2. Zero the ledger (from the rows that are not ours, so a re-run is a no-op).
  type M = { product_id: number; location: string; quantity: number; source_ref: string | null };
  const ledger = await allRows<M>("stock_movements", "product_id, location, quantity, source_ref");
  const onHand = new Map<string, number>();
  for (const m of ledger) {
    if (m.source_ref?.startsWith("estoque:") || m.source_ref?.startsWith(`reset-${STAMP}:`)) continue;
    const k = `${m.product_id}|${m.location}`;
    onHand.set(k, (onHand.get(k) ?? 0) + Number(m.quantity));
  }
  const zero = [...onHand.entries()].filter(([, q]) => q !== 0).map(([k, q]) => ({ product_id: Number(k.split("|")[0]), location: k.split("|")[1], quantity: -q, kind: "adjust", reference: `Stock reset ${STAMP}`, notes: "Cleared before loading Fred's Estoque_v14 sheet (INV-d)", source_ref: `reset-${STAMP}:${k}`, moved_at: `${STAMP}T12:00:00-04:00` }));
  console.log(`Ledger: ${zero.length} product/location rows to zero (${zero.reduce((n, z) => n - z.quantity, 0)} units on hand today).`);

  // 3. Openings, one per serial.
  const openings = inStock.map((u) => ({ product_id: productOf(u.code), location: LOCATION, quantity: 1, kind: "opening", serial: u.serial, reference: REF, notes: u.employee ? `Responsável na planilha: ${u.employee}` : null, source_ref: `estoque:${u.serial}`, moved_at: `${STAMP}T12:01:00-04:00` }));
  const noProduct = openings.filter((o) => !o.product_id);
  console.log(`Openings: ${openings.length} units (${noProduct.length} without a product${apply ? "" : " — created on --apply"}).`);
  if (apply) {
    if (noProduct.length) throw new Error(`no product for: ${[...new Set(noProduct.map((o) => inStock.find((u) => u.serial === o.serial)!.code))].join(", ")}`);
    for (let i = 0; i < zero.length; i += 500) {
      const { error } = await db.from("stock_movements").upsert(zero.slice(i, i + 500), { onConflict: "source_ref" });
      if (error) throw new Error(`zero: ${error.message}`);
    }
    for (let i = 0; i < openings.length; i += 500) {
      const { error } = await db.from("stock_movements").upsert(openings.slice(i, i + 500), { onConflict: "source_ref" });
      if (error) throw new Error(`openings: ${error.message}`);
    }
    console.log(`✓ ledger: ${zero.length} adjustments, ${openings.length} openings written`);
  }

  // 4. Stock records.
  type S = { id: number; serial: string | null; status: string; source_ref: string | null };
  const items = await allRows<S>("stock_items", "id, serial, status, source_ref", (q) => (q as { is: (c: string, v: null) => unknown }).is("deleted_at", null));
  const sheetSerials = new Set(inStock.map((u) => u.serial));
  const toDelete = items.filter((s) => s.status === "In Stock" && !(s.serial && sheetSerials.has(s.serial)));
  const have = new Set(items.map((s) => s.serial).filter(Boolean));
  const toCreate = inStock.filter((u) => !have.has(u.serial));
  console.log(`Stock records: ${items.filter((s) => s.status === "In Stock").length} In Stock today → ${toDelete.length} removed (not in the sheet), ${toCreate.length} created, ${items.filter((s) => s.status === "RMA").length} RMA untouched.`);
  if (apply) {
    for (let i = 0; i < toDelete.length; i += 200) {
      const { error } = await db.from("stock_items").update({ deleted_at: new Date().toISOString() }).in("id", toDelete.slice(i, i + 200).map((s) => s.id));
      if (error) throw new Error(`stock_items delete: ${error.message}`);
    }
    const { data: lv } = await db.from("workflow_levels").select("id, title").eq("workflow_id", "stock_status");
    const level = ((lv ?? []) as { id: number; title: string }[]).find((l) => l.title === "In Stock")?.id;
    for (let i = 0; i < toCreate.length; i += 200) {
      const rows = toCreate.slice(i, i + 200).map((u) => ({ source_ref: `estoque:${u.serial}`, title: u.serial, product_id: productOf(u.code)!, serial: u.serial, location: LOCATION, model: u.code, status: "In Stock" }));
      const { data, error } = await db.from("stock_items").insert(rows).select("id");
      if (error) throw new Error(`stock_items: ${error.message}`);
      if (level) {
        const states = ((data ?? []) as { id: number }[]).map((r) => ({ table_name: "stock_items", record_id: r.id, workflow_id: "stock_status", level_id: level, entered_at: new Date().toISOString() }));
        const { error: we } = await db.from("record_workflow_state").upsert(states, { onConflict: "table_name,record_id" });
        if (we) throw new Error(`stock workflow: ${we.message}`);
      }
    }
    console.log(`✓ stock records: ${toDelete.length} removed, ${toCreate.length} created`);
  }
  console.log(apply ? "Done." : "Dry run: nothing written. Add --apply to do it.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
