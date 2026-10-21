/**
 * INV-i (Fred 2026-10-21): fill Product Type and Brand on the product catalogue from Fred's classification sheet
 * products_classified.csv (columns Current Name, Suggested Type, Suggested Brand, Cost, Supplier, Times Repeated,
 * Duplicate Group, Note). A row matches a product by its Current Name, exactly (after trimming spaces), against the
 * product title and then its model; only blank Product Type / Brand fields are filled. Name, cost and supplier are
 * never touched; rows with Suggested Type = NEEDS REVIEW are skipped; nothing is deleted or merged.
 *
 *   npx tsx --env-file=.env.local scripts/import-product-types.ts                 # dry run: counts + unmatched list
 *   npx tsx --env-file=.env.local scripts/import-product-types.ts --apply         # write
 *   options: --file <csv>  (default C:/Users/Fred/Downloads/products_classified.csv)
 *            --report <xlsx>  duplicates report (default docs/product-duplicates.xlsx; written on every run)
 *            --no-brands      do not create missing brands (products whose brand is unknown keep Brand blank)
 */
import { readFileSync } from "node:fs";
import ExcelJS from "exceljs";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { PRODUCT_TYPES } from "../src/registry/tables/products";

const args = process.argv.slice(2);
const APPLY = args.includes("--apply");
const CREATE_BRANDS = !args.includes("--no-brands");
const opt = (k: string, d: string) => { const i = args.indexOf(k); return i >= 0 && args[i + 1] ? args[i + 1] : d; };
const FILE = opt("--file", "C:/Users/Fred/Downloads/products_classified.csv");
const REPORT = opt("--report", "docs/product-duplicates.xlsx");

const db: SupabaseClient = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false } });
type Pageable = { range(from: number, to: number): PromiseLike<{ data: unknown; error: { message: string } | null }> };
const all = async <T,>(q: () => Pageable): Promise<T[]> => { const out: T[] = []; for (let f = 0; ; f += 1000) { const { data, error } = await q().range(f, f + 999); if (error) throw new Error(error.message); const page = (data ?? []) as T[]; out.push(...page); if (page.length < 1000) return out; } };
const S = (v: unknown) => (v === null || v === undefined ? "" : String(v).trim());
const key = (v: string) => v.replace(/\s+/g, " ").trim();

// ---------------------------------------------------------------- the CSV
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], field = "", quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else quoted = false; }
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") { if (c === "\r" && text[i + 1] === "\n") i++; row.push(field); rows.push(row); row = []; field = ""; }
    else field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((v) => v.trim()));
}
type CsvRow = { name: string; type: string; brand: string; cost: string; supplier: string; repeated: string; group: string; note: string };
function readCsv(): CsvRow[] {
  const [head, ...body] = parseCsv(readFileSync(FILE, "utf8").replace(/^\uFEFF/, ""));
  const col = (n: string) => { const i = head.findIndex((h) => h.trim().toLowerCase() === n.toLowerCase()); if (i < 0) throw new Error(`Column "${n}" missing in ${FILE}`); return i; };
  const c = { name: col("Current Name"), type: col("Suggested Type"), brand: col("Suggested Brand"), cost: col("Cost"), supplier: col("Supplier"), repeated: col("Times Repeated"), group: col("Duplicate Group"), note: col("Note") };
  return body.map((r) => ({ name: S(r[c.name]), type: S(r[c.type]), brand: S(r[c.brand]), cost: S(r[c.cost]), supplier: S(r[c.supplier]), repeated: S(r[c.repeated]), group: S(r[c.group]), note: S(r[c.note]) }));
}

// ---------------------------------------------------------------- the catalogue
type Product = { id: number; title: string | null; model: string | null; product_type: string | null; brand_id: number | null };
type Brand = { id: number; name: string };
const push = <K, V>(m: Map<K, V[]>, k: K, v: V) => (m.get(k) ?? m.set(k, []).get(k)!).push(v);

async function main() {
  const rows = readCsv();
  const types = new Set(PRODUCT_TYPES.map((o) => o.value));
  const products = await all<Product>(() => db.from("products").select("id, title, model, product_type, brand_id").is("deleted_at", null).order("id"));
  const brands = await all<Brand>(() => db.from("brands").select("id, name").is("deleted_at", null).order("id"));
  const brandByName = new Map(brands.map((b) => [key(b.name).toLowerCase(), b]));

  // Products by exact title, then by exact model (a name can match several products: duplicates get the same classification).
  const byTitle = new Map<string, Product[]>(), byModel = new Map<string, Product[]>();
  for (const p of products) {
    if (p.title) push(byTitle, key(p.title), p);
    if (p.model) push(byModel, key(p.model), p);
  }
  const hitsFor = (name: string) => byTitle.get(key(name)) ?? byModel.get(key(name)) ?? [];

  const skipped: CsvRow[] = [], unmatched: CsvRow[] = [], badType: CsvRow[] = [];
  const typeFill = new Map<number, string>(), brandFill = new Map<number, string>();
  const matchedProducts = new Set<number>();
  let matchedRows = 0, alreadyTyped = 0, alreadyBranded = 0, noBrandSuggested = 0;
  const seen = new Set<string>();
  for (const r of rows) {
    if (!r.name) continue;
    if (r.type.toUpperCase() === "NEEDS REVIEW") { skipped.push(r); continue; }
    if (!types.has(r.type)) { badType.push(r); continue; }
    const hits = hitsFor(r.name);
    if (!hits.length) { if (!seen.has(key(r.name))) unmatched.push(r); seen.add(key(r.name)); continue; }
    matchedRows++;
    for (const p of hits) {
      matchedProducts.add(p.id);
      if (p.product_type) alreadyTyped++; else typeFill.set(p.id, r.type);
      if (!r.brand) noBrandSuggested++;
      else if (p.brand_id) alreadyBranded++;
      else brandFill.set(p.id, r.brand);
    }
  }
  const newBrands = [...new Set([...brandFill.values()].map(key))].filter((b) => !brandByName.has(b.toLowerCase())).sort();

  console.log(`CSV rows: ${rows.length}   products in the CRM: ${products.length}`);
  console.log(`Skipped NEEDS REVIEW: ${skipped.length}   unknown type: ${badType.length}`);
  console.log(`Matched: ${matchedRows} rows → ${matchedProducts.size} products   Unmatched names: ${unmatched.length}`);
  console.log(`Product Type to fill: ${typeFill.size}   (already had a type: ${alreadyTyped})`);
  console.log(`Brand to fill: ${brandFill.size}   (already had a brand: ${alreadyBranded}; no brand suggested: ${noBrandSuggested})`);
  console.log(`Brands to create: ${newBrands.length}${newBrands.length ? ` → ${newBrands.join(", ")}` : ""}`);
  if (badType.length) console.log(`\nUnknown Suggested Type (not in the list):\n  ${badType.map((r) => `${r.name}  →  ${r.type}`).join("\n  ")}`);
  if (unmatched.length) console.log(`\nUnmatched Current Name (${unmatched.length}):\n  ${unmatched.map((r) => r.name).join("\n  ")}`);

  // Duplicates report: review only, nothing is merged.
  const groups = new Map<string, CsvRow[]>();
  for (const r of rows) if (r.group) push(groups, r.group, r);
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Duplicate groups");
  ws.columns = [
    { header: "Duplicate Group", key: "group", width: 40 }, { header: "Current Name", key: "name", width: 50 }, { header: "Product id(s) in the CRM", key: "ids", width: 22 },
    { header: "Suggested Type", key: "type", width: 28 }, { header: "Suggested Brand", key: "brand", width: 20 }, { header: "Cost", key: "cost", width: 12 },
    { header: "Supplier", key: "supplier", width: 20 }, { header: "Times Repeated", key: "repeated", width: 14 }, { header: "Note", key: "note", width: 40 }, { header: "Decision", key: "decision", width: 30 },
  ];
  ws.getRow(1).font = { bold: true };
  for (const [group, list] of [...groups].sort((a, b) => a[0].localeCompare(b[0])))
    for (const r of list) ws.addRow({ group, name: r.name, ids: hitsFor(r.name).map((p) => p.id).join(", "), type: r.type, brand: r.brand, cost: r.cost, supplier: r.supplier, repeated: r.repeated, note: r.note, decision: "" });
  await wb.xlsx.writeFile(REPORT);
  console.log(`\nDuplicates report: ${groups.size} groups, ${[...groups.values()].reduce((n, l) => n + l.length, 0)} rows → ${REPORT}`);

  if (!APPLY) { console.log("\nDry run: nothing written. Add --apply to fill the fields."); return; }

  // Brands first, so the products can point at them.
  if (CREATE_BRANDS)
    for (const name of newBrands) {
      const { data, error } = await db.from("brands").insert({ name, title: name }).select("id, name").single();
      if (error) throw new Error(`brand ${name}: ${error.message}`);
      brandByName.set(name.toLowerCase(), data as Brand);
    }
  let typed = 0, branded = 0, brandMissing = 0;
  for (const p of products) {
    const patch: Record<string, unknown> = {};
    const t = typeFill.get(p.id);
    if (t) patch.product_type = t;
    const b = brandFill.get(p.id);
    if (b) { const br = brandByName.get(key(b).toLowerCase()); if (br) patch.brand_id = br.id; else brandMissing++; }
    if (!Object.keys(patch).length) continue;
    const { error } = await db.from("products").update(patch).eq("id", p.id);
    if (error) throw new Error(`product ${p.id}: ${error.message}`);
    if (patch.product_type) typed++;
    if (patch.brand_id) branded++;
  }
  console.log(`\nApplied: Product Type filled on ${typed} products, Brand on ${branded}${brandMissing ? ` (${brandMissing} kept blank: brand not created)` : ""}${CREATE_BRANDS && newBrands.length ? `; ${newBrands.length} brands created` : ""}.`);
}

main().catch((e) => { console.error(e); process.exit(1); });
