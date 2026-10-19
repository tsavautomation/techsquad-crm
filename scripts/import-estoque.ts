/**
 * INV-g Stock from the "Controle de Estoque" workbook (Fred 2026-10-19): the Movimentacoes tab replaces the
 * CRM's stock units. Each row is a movement of one unit (serial + product); the last row per unit gives its
 * state: Em Estoque → In Stock, Separado → Separated (staged for the job in Cliente), Instalado → On Project
 * (installed on the job in Cliente), Em Manutenção → RMA. Funcionário Responsável → the employee holding it.
 *
 *   npx tsx --env-file=.env.local scripts/import-estoque.ts                       # dry run, writes the client sheet
 *   npx tsx --env-file=.env.local scripts/import-estoque.ts --apply               # load
 *   options: --file <xlsm>  --decisions <xlsx>  (default docs/estoque-clientes.xlsx, read when present)
 *
 * On --apply: every existing stock unit that did not come from this workbook is soft-deleted, the ledger
 * (stock_movements) gets an adjustment to zero per product/location and then one row per workbook movement,
 * and the units are upserted by source_ref (ctrl:<serial>|<product>), so the script can run again safely.
 */
import { existsSync } from "node:fs";
import ExcelJS from "exceljs";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { ledgerDelta, type StockStatus } from "../src/lib/inventory/engine";

const args = process.argv.slice(2);
const APPLY = args.includes("--apply");
const opt = (k: string, d: string) => { const i = args.indexOf(k); return i >= 0 && args[i + 1] ? args[i + 1] : d; };
const FILE = opt("--file", "C:/Users/Fred/Downloads/Estoque_v14_BACKUP.xlsm");
const DECISIONS = opt("--decisions", "docs/estoque-clientes.xlsx");
const SHEET = "Movimentacoes";

const db: SupabaseClient = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false } });
type Pageable = { range(from: number, to: number): PromiseLike<{ data: unknown; error: { message: string } | null }> };
const all = async <T,>(q: () => Pageable): Promise<T[]> => { const out: T[] = []; for (let f = 0; ; f += 1000) { const { data, error } = await q().range(f, f + 999); if (error) throw new Error(error.message); const page = (data ?? []) as T[]; out.push(...page); if (page.length < 1000) return out; } };
const S = (v: unknown) => (v === null || v === undefined ? "" : String(v).trim());
const norm = (v: unknown) => S(v).toUpperCase().replace(/\s+/g, " ");

// ---------------------------------------------------------------- the workbook
type Row = { row: number; date: string | null; serial: string; product: string; move: string; status: string; client: string; staff: string; po: string; note: string; prevStatus: string };
async function readRows(): Promise<Row[]> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(FILE);
  const ws = wb.getWorksheet(SHEET);
  if (!ws) throw new Error(`No sheet ${SHEET}`);
  const val = (c: ExcelJS.Cell | { value: unknown }): unknown => { const v = c?.value as unknown; if (v && typeof v === "object") { if (v instanceof Date) return v.toISOString().slice(0, 10); const o = v as Record<string, unknown>; if ("result" in o) return o.result ?? null; if ("richText" in o) return (o.richText as { text: string }[]).map((t) => t.text).join(""); if ("text" in o) return o.text; return null; } return v ?? null; };
  let headerRow = 0;
  for (let n = 1; n <= 15 && !headerRow; n++) if ((ws.getRow(n).values as unknown[]).some((h) => /status resultante/i.test(S(val({ value: h }))))) headerRow = n;
  if (!headerRow) throw new Error("Header row with 'Status Resultante' not found");
  const headers = (ws.getRow(headerRow).values as unknown[]).slice(1).map((h) => S(val({ value: h })));
  const col = (name: RegExp) => headers.findIndex((h) => name.test(h)) + 1;
  const C = { date: col(/^data/i), serial: col(/serial/i), product: col(/^produto/i), move: col(/tipo de movimento/i), status: col(/status resultante/i), client: col(/^cliente/i), staff: col(/respons/i), po: col(/^po$/i), note: col(/observa/i), prev: col(/status anterior/i) };
  for (const [k, v] of Object.entries(C)) if (!v) throw new Error(`Column for ${k} not found in: ${headers.join(" | ")}`);
  const rows: Row[] = [];
  ws.eachRow((r, n) => {
    if (n <= headerRow) return;
    const g = (i: number) => val(r.getCell(i));
    const product = S(g(C.product)), serial = S(g(C.serial));
    if (!product && !serial) return;
    const d = g(C.date);
    rows.push({ row: n, date: d ? S(d).slice(0, 10) : null, serial, product, move: S(g(C.move)), status: S(g(C.status)), client: S(g(C.client)), staff: S(g(C.staff)), po: S(g(C.po)), note: S(g(C.note)), prevStatus: S(g(C.prev)) });
  });
  return rows;
}

const STATUS: Record<string, StockStatus> = { "EM ESTOQUE": "In Stock", SEPARADO: "Separated", INSTALADO: "On Project", "EM MANUTENÇÃO": "RMA", "EM MANUTENCAO": "RMA" };
const MOVE_LABEL: Record<StockStatus, string> = { "In Stock": "Received into stock", Separated: "Picked at the warehouse", "On Project": "Installed", RMA: "Sent for repair (RMA)", Discarded: "Written off / discarded" };

// ---------------------------------------------------------------- lookups
type Product = { id: number; title: string | null; model: string | null; sku: string | null; brand_id: number | null; product_type: string | null; sell_price: number | null; cost: number | null; source_ref: string | null };
type Named = { id: number; title: string | null };

function productFinder(products: Product[]) {
  const byTitle = new Map(products.map((p) => [norm(p.title), p])), byModel = new Map<string, Product>(), bySku = new Map(products.map((p) => [norm(p.sku), p]));
  for (const p of products) if (p.model && !byModel.has(norm(p.model))) byModel.set(norm(p.model), p);
  return (name: string): Product | null => {
    const n = norm(name), stripped = n.replace(/\s*\([^)]*\)\s*$/, "");
    return byTitle.get(n) ?? byModel.get(n) ?? byModel.get(stripped) ?? bySku.get(n) ?? products.find((p) => stripped.length > 4 && (norm(p.title).includes(stripped) || norm(p.model).includes(stripped))) ?? null;
  };
}

function projectFinder(projects: Named[], decisions: Map<string, string>) {
  const byTitle = new Map(projects.map((p) => [norm(p.title), p]));
  return (client: string): { project: Named | null; how: string; candidates: Named[] } => {
    const n = norm(client);
    const decided = decisions.get(n);
    if (decided !== undefined) {
      if (!decided || /^(skip|none|-|nenhum|pular)$/i.test(decided)) return { project: null, how: "skipped by decision", candidates: [] };
      const p = byTitle.get(norm(decided)) ?? projects.find((x) => norm(x.title).includes(norm(decided)) || /^\d+$/.test(decided) && x.id === Number(decided));
      return p ? { project: p, how: "decision", candidates: [] } : { project: null, how: `decision "${decided}" not found`, candidates: [] };
    }
    const exact = byTitle.get(n);
    if (exact) return { project: exact, how: "exact", candidates: [] };
    const part = projects.filter((p) => norm(p.title).includes(n) || (n.length > 6 && n.includes(norm(p.title))));
    if (part.length === 1) return { project: part[0], how: "contains", candidates: [] };
    return { project: null, how: part.length ? "ambiguous" : "no match", candidates: part.slice(0, 4) };
  };
}

type Employee = { id: number; title: string | null; first_name: string | null; last_name: string | null };
function employeeFinder(employees: Employee[]) {
  return (name: string): Employee | null => {
    const n = norm(name);
    if (!n) return null;
    return employees.find((e) => norm(e.title) === n) ?? employees.find((e) => norm(e.first_name) && n.startsWith(norm(e.first_name)) && norm(e.last_name) && n.endsWith(norm(e.last_name))) ?? employees.find((e) => norm(e.first_name) && n.split(" ")[0] === norm(e.first_name)) ?? null;
  };
}

async function readDecisions(): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (!existsSync(DECISIONS)) return out;
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(DECISIONS);
  const ws = wb.worksheets[0];
  ws.eachRow((r, n) => {
    if (n === 1) return;
    const client = S(r.getCell(1).value), decided = S((r.getCell(4).value as { result?: unknown })?.result ?? r.getCell(4).value);
    if (client && decided) out.set(norm(client), decided);
  });
  return out;
}

async function writeDecisionSheet(items: { client: string; units: number; candidates: Named[] }[]) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Clientes");
  ws.columns = [{ header: "Cliente (planilha)", key: "c", width: 42 }, { header: "Unidades", key: "u", width: 10 }, { header: "Candidatos no CRM", key: "k", width: 60 }, { header: "Projeto no CRM (escreva o título exato, o id, ou 'pular')", key: "d", width: 60 }];
  for (const it of items) ws.addRow({ c: it.client, u: it.units, k: it.candidates.map((p) => `${p.title} (#${p.id})`).join(" | "), d: "" });
  ws.getRow(1).font = { bold: true };
  await wb.xlsx.writeFile(DECISIONS);
}

// ---------------------------------------------------------------- main
type Unit = { key: string; serial: string; productName: string; rows: Row[]; status: StockStatus; client: string; staff: string; po: string; receivedOn: string | null; lastDate: string | null };

async function main() {
  const rows = await readRows();
  console.log(`${SHEET}: ${rows.length} movement rows`);
  const [products, projects, employees, locations, levels] = await Promise.all([
    all<Product>(() => db.from("products").select("id, title, model, sku, brand_id, product_type, sell_price, cost, source_ref").is("deleted_at", null)),
    all<Named>(() => db.from("projects").select("id, title").is("deleted_at", null)),
    all<Employee>(() => db.from("employees").select("id, title, first_name, last_name").is("deleted_at", null)),
    all<{ id: number; name: string; kind: string }>(() => db.from("stock_locations").select("id, name, kind").is("deleted_at", null)),
    all<{ id: number; title: string }>(() => db.from("workflow_levels").select("id, title").eq("workflow_id", "stock_status")),
  ]);
  const brands = await all<{ id: number; name: string | null }>(() => db.from("brands").select("id, name").is("deleted_at", null));
  const warehouse = locations.find((l) => l.kind === "Warehouse") ?? locations[0];
  if (!warehouse) throw new Error("No stock location");
  const levelId = new Map(levels.map((l) => [l.title, l.id]));
  const decisions = await readDecisions();
  const findProduct = productFinder(products), findProject = projectFinder(projects, decisions), findEmployee = employeeFinder(employees);

  // Units: serial + product, state from the last row (date, then sheet order).
  const units = new Map<string, Unit>();
  for (const r of rows) {
    const key = `${r.serial}|${norm(r.product)}`;
    const u = units.get(key) ?? { key, serial: r.serial, productName: r.product, rows: [], status: "In Stock" as StockStatus, client: "", staff: "", po: "", receivedOn: null, lastDate: null };
    u.rows.push(r);
    units.set(key, u);
  }
  const unknownStatus = new Set<string>();
  for (const u of units.values()) {
    u.rows.sort((a, b) => (a.date ?? "").localeCompare(b.date ?? "") || a.row - b.row);
    const last = u.rows[u.rows.length - 1];
    const st = STATUS[norm(last.status)];
    if (!st) unknownStatus.add(last.status);
    u.status = st ?? "In Stock";
    u.lastDate = last.date;
    u.client = [...u.rows].reverse().find((r) => r.client)?.client ?? "";
    u.staff = [...u.rows].reverse().find((r) => r.staff)?.staff ?? "";
    u.po = [...u.rows].reverse().find((r) => r.po)?.po ?? "";
    u.receivedOn = u.rows.find((r) => /entrada/i.test(r.move))?.date ?? u.rows[0].date;
  }
  if (unknownStatus.size) console.log("UNKNOWN statuses (treated as In Stock):", [...unknownStatus].join(", "));
  const byStatus: Record<string, number> = {};
  for (const u of units.values()) byStatus[u.status] = (byStatus[u.status] ?? 0) + 1;
  console.log(`${units.size} units ->`, JSON.stringify(byStatus));

  // Products: match or plan a new one.
  const newProducts = new Map<string, { model: string; brand: { id: number; name: string | null } | null; units: number }>();
  const productOf = new Map<string, Product | null>();
  for (const u of units.values()) {
    if (!productOf.has(norm(u.productName))) productOf.set(norm(u.productName), findProduct(u.productName));
    if (!productOf.get(norm(u.productName))) {
      const m = u.productName.match(/^(.*?)\s*\(([^)]+)\)\s*$/);
      const brand = m ? (brands.find((b) => norm(b.name) === norm(m[2])) ?? null) : null;
      const model = brand && m ? m[1].trim() : u.productName.trim();
      const e = newProducts.get(norm(u.productName)) ?? { model, brand, units: 0 };
      e.units++;
      newProducts.set(norm(u.productName), e);
    }
  }
  console.log(`products: ${productOf.size} names, ${[...productOf.values()].filter(Boolean).length} found, ${newProducts.size} to create`);
  for (const [n, p] of [...newProducts].slice(0, 400)) console.log(`  + ${p.brand ? `${p.brand.name} ` : ""}${p.model}  (${p.units} unit${p.units > 1 ? "s" : ""})${p.brand ? "" : `   [from "${n}"]`}`);

  // Clients → projects.
  const clientUnits = new Map<string, number>();
  for (const u of units.values()) if (u.client && u.status !== "In Stock") clientUnits.set(u.client, (clientUnits.get(u.client) ?? 0) + 1);
  const resolved = new Map<string, ReturnType<typeof findProject>>();
  for (const c of clientUnits.keys()) resolved.set(c, findProject(c));
  const open = [...clientUnits].filter(([c]) => !resolved.get(c)!.project && !resolved.get(c)!.how.startsWith("skipped"));
  console.log(`clients: ${clientUnits.size}; matched ${[...resolved.values()].filter((r) => r.project).length}, skipped ${[...resolved.values()].filter((r) => r.how.startsWith("skipped")).length}, open ${open.length}`);
  for (const [c, n] of open) console.log(`  ? ${c} (${n} units) ${resolved.get(c)!.how}${resolved.get(c)!.candidates.length ? ": " + resolved.get(c)!.candidates.map((p) => p.title).join(" | ") : ""}`);
  if (!APPLY && open.length && !existsSync(DECISIONS)) {
    await writeDecisionSheet(open.map(([client, units]) => ({ client, units, candidates: resolved.get(client)!.candidates })));
    console.log(`-> wrote ${DECISIONS}: fill column D and run again with --decisions`);
  }

  // Employees.
  const staffNames = [...new Set([...units.values()].map((u) => u.staff).filter(Boolean))];
  const staffMiss = staffNames.filter((n) => !findEmployee(n));
  console.log(`employees: ${staffNames.length} names, ${staffNames.length - staffMiss.length} matched${staffMiss.length ? `, NO MATCH: ${staffMiss.join(", ")}` : ""}`);

  // What goes away.
  const old = await all<{ id: number; source_ref: string | null }>(() => db.from("stock_items").select("id, source_ref").is("deleted_at", null));
  const retire = old.filter((o) => !(o.source_ref ?? "").startsWith("ctrl:"));
  const levelsNow = await all<{ product_id: number; location: string; on_hand: number }>(() => db.from("stock_levels").select("product_id, location, on_hand"));
  const nonZero = levelsNow.filter((l) => Number(l.on_hand) !== 0);
  console.log(`existing stock units to retire (soft-delete): ${retire.length}; ledger balances to zero first: ${nonZero.length}`);
  console.log(`ledger rows to write: ${rows.length}; units to write: ${units.size}`);
  if (!APPLY) return console.log("\nDry run only. Add --apply to load.");

  // ---------------------------------------------------------------- apply
  const now = new Date().toISOString();
  // 1. New products.
  for (const [n, p] of newProducts) {
    const { data, error } = await db.from("products").upsert({ source_ref: `ctrl:product:${n}`, model: p.model, brand_id: p.brand?.id ?? null, title: [p.brand?.name, p.model].filter(Boolean).join(" ") }, { onConflict: "source_ref" }).select("id, title, model, sku, brand_id, product_type, sell_price, cost, source_ref").single();
    if (error) throw new Error(`product ${n}: ${error.message}`);
    productOf.set(n, data as Product);
  }
  // 2. Retire the old units and zero the ledger.
  if (retire.length) {
    for (let i = 0; i < retire.length; i += 500) {
      const { error } = await db.from("stock_items").update({ deleted_at: now }).in("id", retire.slice(i, i + 500).map((o) => o.id));
      if (error) throw new Error(`retire: ${error.message}`);
    }
  }
  if (nonZero.length) {
    const { error } = await db.from("stock_movements").upsert(nonZero.map((l) => ({ product_id: l.product_id, location: l.location, quantity: -Number(l.on_hand), kind: "adjust", reference: "Stock replaced by the Controle de Estoque workbook (2026-10-19)", moved_at: now, source_ref: `ctrl:zero:${l.product_id}:${norm(l.location)}` })), { onConflict: "source_ref" });
    if (error) throw new Error(`zero ledger: ${error.message}`);
  }
  // 3. Units.
  let written = 0;
  const unitRows = [...units.values()].map((u) => {
    const p = productOf.get(norm(u.productName))!;
    const proj = u.status === "In Stock" ? null : (resolved.get(u.client)?.project ?? null);
    const emp = findEmployee(u.staff);
    return { source_ref: `ctrl:${u.key}`, product_id: p.id, serial: u.serial, model: p.model, brand_id: p.brand_id, product_type: p.product_type, sell_price: p.sell_price, cost: p.cost, status: u.status, location: warehouse.name, location_id: warehouse.id, destination_project_id: proj?.id ?? null, staff_id: emp?.id ?? null, po_number: u.po || null, received_on: u.receivedOn, deleted_at: null };
  });
  const ids = new Map<string, number>();
  for (let i = 0; i < unitRows.length; i += 300) {
    const { data, error } = await db.from("stock_items").upsert(unitRows.slice(i, i + 300), { onConflict: "source_ref" }).select("id, source_ref");
    if (error) throw new Error(`units: ${error.message}`);
    for (const r of data as { id: number; source_ref: string }[]) ids.set(r.source_ref, r.id);
    written += data.length;
  }
  // 4. Workflow stage per unit.
  const states = [...ids].map(([ref, id]) => ({ table_name: "stock_items", record_id: id, workflow_id: "stock_status", level_id: levelId.get(units.get(ref.slice("ctrl:".length))!.status)!, entered_at: now })).filter((s) => s.level_id);
  for (let i = 0; i < states.length; i += 500) {
    const { error } = await db.from("record_workflow_state").upsert(states.slice(i, i + 500), { onConflict: "table_name,record_id" });
    if (error) throw new Error(`workflow state: ${error.message}`);
  }
  // 5. Ledger: one row per workbook movement, in unit order, with the status it left the unit in.
  const ledger: Record<string, unknown>[] = [];
  for (const u of units.values()) {
    const p = productOf.get(norm(u.productName))!;
    let prev: StockStatus | null = null;
    for (const r of u.rows) {
      const next = STATUS[norm(r.status)] ?? "In Stock";
      const delta = ledgerDelta(prev, next);
      ledger.push({ product_id: p.id, location: warehouse.name, quantity: delta, kind: delta > 0 ? "in" : delta < 0 ? "out" : "adjust", serial: u.serial, reference: `${MOVE_LABEL[next]} → ${next}`, notes: [r.client ? `Cliente: ${r.client}` : null, r.staff || null, r.po ? `PO ${r.po}` : null, r.note || null].filter(Boolean).join(" · ") || null, moved_at: r.date ? `${r.date}T12:00:00-04:00` : now, source_ref: `ctrl:mv:${r.row}`, po_number: r.po || null });
      prev = next;
    }
  }
  for (let i = 0; i < ledger.length; i += 500) {
    const { error } = await db.from("stock_movements").upsert(ledger.slice(i, i + 500), { onConflict: "source_ref" });
    if (error) throw new Error(`ledger: ${error.message}`);
  }
  console.log(`done: ${newProducts.size} products created, ${retire.length} old units retired, ${written} units written, ${ledger.length} ledger rows, ${nonZero.length} balances zeroed`);
}

main().then(() => process.exit(0), (e) => { console.error(e); process.exit(1); });
