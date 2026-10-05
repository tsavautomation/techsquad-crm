/**
 * Inventory import (SPEC §9.1 INV-b): the Sortly export (2018–2021) and the later sales export (2021–2024)
 * become Products, Stock (serialized units on the shelf), stock movements (opening balances per location)
 * and Inventory Checkouts on the matched projects.
 *
 *   npx tsx --env-file=.env.local scripts/import-inventory.ts                 # dry run: counts + docs/inventory-folders.xlsx
 *   npx tsx --env-file=.env.local scripts/import-inventory.ts --apply         # write (repeatable: every row carries a source key)
 *
 * Options: --sortly <xlsx> (docs/sortly-export.xlsx) · --sales <xlsx> (docs/sales-export.xlsx)
 *          --decisions <xlsx> (docs/inventory-folders.xlsx, Fred's answers; also where the dry run writes the sheet)
 *          --stock-all (one Stock record for every serialized unit, delivered ones too; default: only units still in stock)
 *          --no-sheet (don't rewrite the decisions sheet)
 *
 * Fred's rules (2026-10-04): one Product per distinct name / SKU with quantities summed per location, serials noted on
 * the checkout line, no photos, Sortly Price → cost; Warehouse / Van Branca / Van Preta stay stock locations (subfolder =
 * location); items in client folders are matched to a project like the report archive and become Inventory Checkouts;
 * whatever doesn't match goes to a spreadsheet for him to answer. A serial that also appears in the newer sales export
 * is taken from the sales export only.
 */
import { existsSync } from "node:fs";
import ExcelJS from "exceljs";
import { createClient } from "@supabase/supabase-js";
import { formatDate } from "../src/lib/dates";
import { folderKey, pickProject, scoreArchiveFile } from "../src/lib/archive/match";
import { parseClientFolder, type ParsedName } from "../src/lib/archive/parse";
import { findPeople, norm, type CatEmployee, type CatProject } from "../src/lib/google/match";
import { joinTitleParts } from "../src/lib/records/title-format";

const args = process.argv.slice(2);
const flag = (f: string) => args.includes(f);
const opt = (f: string, d: string) => (args.includes(f) ? args[args.indexOf(f) + 1] : d);
const apply = flag("--apply");
const stockAll = flag("--stock-all");
const SORTLY = opt("--sortly", "docs/sortly-export.xlsx");
const SALES = opt("--sales", "docs/sales-export.xlsx");
const SHEET = opt("--decisions", "docs/inventory-folders.xlsx");
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const secret = process.env.SUPABASE_SECRET_KEY;
if (!url || !secret) throw new Error("Run with --env-file=.env.local (NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SECRET_KEY)");
const db = createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });

// ---------------------------------------------------------------- helpers

type Row = Record<string, string>;
const cellText = (c: ExcelJS.CellValue): string => {
  if (c === null || c === undefined) return "";
  if (typeof c === "object") {
    if ("richText" in c) return c.richText.map((r) => r.text).join("").trim();
    if ("text" in c) return String(c.text).trim();
    if ("result" in c) return cellText(c.result as ExcelJS.CellValue);
    if (c instanceof Date) return c.toISOString().slice(0, 10);
    return "";
  }
  return String(c).trim();
};
/** First sheet as objects keyed by header; a repeated header gets " 2", " 3"… */
async function readSheet(file: string, headerRow = 1): Promise<Row[]> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(file);
  const ws = wb.worksheets[0];
  const seen: Record<string, number> = {};
  const headers = (ws.getRow(headerRow).values as ExcelJS.CellValue[]).slice(1).map(cellText).map((h) => {
    seen[h] = (seen[h] ?? 0) + 1;
    return seen[h] > 1 ? `${h} ${seen[h]}` : h;
  });
  const rows: Row[] = [];
  ws.eachRow((r, n) => {
    if (n <= headerRow) return;
    const vals = (r.values as ExcelJS.CellValue[]).slice(1).map(cellText);
    const o: Row = { _row: String(n) };
    headers.forEach((h, i) => {
      if (h) o[h] = vals[i] ?? "";
    });
    rows.push(o);
  });
  return rows;
}
/** Model codes are written in capitals ("clw-dimex-p-w-s" → "CLW-DIMEX-P-W-S"); names with spaces keep their case. */
const modelCase = (s: string) => (/^[A-Za-z0-9][A-Za-z0-9\-\/.#]*$/.test(s) && /[-\d]/.test(s) && s.length <= 24 ? s.toUpperCase() : s);
/** "clw-dimex-p-w-s" and "CLW DIMEX P W S" are the same product. */
const nk = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "");
const money = (s: string) => (s && Number.isFinite(Number(s)) && Number(s) > 0 ? Math.round(Number(s) * 100) / 100 : null);
/** "3/17/2023" / "07/28/2021" → "2023-03-17". */
const usDate = (s: string): string | null => {
  const m = s.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/);
  return m ? `${m[3]}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}` : null;
};
const dateIn = (s: string): string | null => usDate(s.match(/\d{1,2}[\/-]\d{1,2}[\/-]\d{4}/)?.[0] ?? "");
/** "SILVA, MARCO AURELIO - NASSAU" and "MARCO AURELIO SILVA - NASSAU" share the same words. */
const tokenKey = (s: string) => s.toUpperCase().replace(/s[-–]s*d{4,6}$/, "").replace(/[^A-Z0-9#]+/g, " ").trim().split(" ").filter(Boolean).sort().join(" ");
const titleCase = (s: string) => s.toLowerCase().replace(/(^|[\s\-\/(])([a-z])/g, (m, a, b) => a + b.toUpperCase());

// ---------------------------------------------------------------- brands

/** Spellings seen in the exports → one brand. */
const BRAND_ALIAS: Record<string, string> = {
  CRESTROM: "CRESTRON", CRONTROL4: "CONTROL4", "CONTROL 4": "CONTROL4", SRONG: "STRONG", STONG: "STRONG",
  "IC REAL TIME": "IC REALTIME", ICREALTIME: "IC REALTIME", "IC RELATIME": "IC REALTIME", SANSUNG: "SAMSUNG",
  "AV PRO": "AVPRO EDGE", ARAKNIS: "ARAKNIS NETWORKS", "ACE GEAR": "ACEGEAR", "COSTAL SOURCE": "COASTAL SOURCE",
  "WD BLUE": "WESTERN DIGITAL", "SNAP AV": "SNAPAV", "SONOS PORT": "SONOS",
};
const BRAND_DISPLAY: Record<string, string> = {
  CONTROL4: "Control4", "IC REALTIME": "IC Realtime", "AVPRO EDGE": "AVPro Edge", JVC: "JVC", BENQ: "BenQ", WATTBOX: "WattBox",
  "OVRC PRO": "OvrC Pro", "AC INFINITY": "AC Infinity", "MEAN WELL": "Mean Well", SNAPAV: "SnapAV", JBL: "JBL", ADI: "ADI", "WIREPATH ONE": "Wirepath ONE",
  "AMAZON BASICS": "Amazon Basics", "ARAKNIS NETWORKS": "Araknis Networks", HIKVISION: "Hikvision", DOORBIRD: "DoorBird", IPORT: "iPort",
};
const brandKey = (s: string) => {
  const u = s.trim().toUpperCase().replace(/\s+/g, " ");
  return BRAND_ALIAS[u] ?? u;
};
const brandName = (key: string) => BRAND_DISPLAY[key] ?? titleCase(key);
/** Sortly folder names that are brands. */
const FOLDER_BRANDS = new Set(["CRESTRON", "SNAPAV", "SONOS", "SONANCE", "BLUE STAR", "CONTROL4", "APPLE", "XANTECH", "LUTRON", "ARAKNIS NETWORKS", "EPISODE", "WATTBOX", "BINARY", "VANTAGE", "HARMONY", "JAMECO", "SAMSUNG"]);

// ---------------------------------------------------------------- product type

function productType(text: string): string | null {
  const t = ` ${text.toLowerCase()} `;
  if (/amplifier|\bamp\b|sonos amp/.test(t)) return "Amplifier";
  if (/dimmer|dimex|dimswex|dimuex|\bdim\b/.test(t)) return "Dimmer";
  if (/speaker|subwoofer|sound ?bar|\bsub\b|\bc6r\b|in-?ceiling|in-?wall/.test(t)) return "Speaker";
  if (/\btv\b|television/.test(t)) return "Television";
  return null;
}

// ---------------------------------------------------------------- model

type Source = "sortly" | "sales";
type Item = {
  key: string; // source key, stable across runs
  source: Source;
  /** Which bucket the row falls in. */
  kind: "stock" | "client" | "rma" | "none";
  name: string; // Sortly entry name / sales model
  description: string | null; // sales "Type"
  brand: string | null; // brand key
  sku: string | null;
  serial: string | null;
  mac: string | null;
  qty: number;
  cost: number | null;
  price: number | null;
  date: string | null;
  note: string | null;
  location: string | null; // stock rows: where it sits
  folder: string | null; // client rows: the folder / client as written
  designer: string | null;
  group: string | null; // client rows: PO / subfolder → one checkout per group
  rep: string | null; // sales: representative
  rowRef: string;
};

type Product = { key: string; name: string; description: string | null; brand: string | null; sku: string | null; cost: number | null; price: number | null; costDate: string; type: string | null; sources: Set<Source>; locations: Map<string, number>; id?: number };

// Sortly ----------------------------------------------------------

const STOCK_PRIMARY = new Set(["Warehouse", "Van Branca", "Van Preta"]);
const INTERNAL_SALES = /^(WAREHOUSE NOVO|TECH SQUAD - AJUSTE ESTOQUE|MESA DE TESTE)$/i;

function sortlyItems(rows: Row[], salesSerials: Set<string>, salesModelBrand: Map<string, string>): { items: Item[]; superseded: Item[]; dupSid: number } {
  const designers = new Set(rows.filter((r) => r["Primary Folder"] === "PROJECTS TS" && r["Subfolder-level2"]).map((r) => r["Subfolder-level1"]));
  designers.add("MC DECOR");
  const pdCount = new Map<string, number>();
  for (const r of rows) {
    const pd = r["Product Detail (SKU, Part #)"];
    if (pd) pdCount.set(pd, (pdCount.get(pd) ?? 0) + 1);
  }
  const brandKeys = new Set([...salesModelBrand.values()]);
  const seenKey = new Map<string, number>();
  const items: Item[] = [];
  const superseded: Item[] = [];
  let dupSid = 0;
  for (const r of rows) {
    const path = [r["Primary Folder"], r["Subfolder-level1"], r["Subfolder-level2"], r["Subfolder-level3"], r["Subfolder-level4"]].filter(Boolean);
    const [P, L1, L2, L3, L4] = [r["Primary Folder"], r["Subfolder-level1"], r["Subfolder-level2"], r["Subfolder-level3"], r["Subfolder-level4"]];
    const base = `sortly:${r.SID}:${nk(path.join("/"))}`;
    const n = (seenKey.get(base) ?? 0) + 1;
    seenKey.set(base, n);
    if (n > 1) dupSid++;
    const key = n > 1 ? `${base}:${n}` : base;
    const name = modelCase(r["Entry Name"].replace(/\s+/g, " ").trim());
    const qty = Math.max(1, Math.round(Number(r.Quantity) || 1));
    // Identifiers: a part number shared by several rows (or a UPC) is a SKU; a one-off code is the unit's serial.
    const pd = r["Product Detail (SKU, Part #)"];
    const qr1 = r["Barcode/QR1-Data"];
    const qr1IsProduct = /EAN|UPC/.test(r["Barcode/QR1-Type"]);
    let sku: string | null = null;
    let serial: string | null = r["Serial Number"] || r["Serial Number 2"] || null;
    if (pd && ((pdCount.get(pd) ?? 0) >= 2 || /^\d{12,14}$/.test(pd))) sku = pd;
    else if (pd && !serial) serial = pd;
    if (qr1 && qr1IsProduct && !sku) sku = qr1;
    if (qr1 && !qr1IsProduct && !serial) serial = qr1;
    if (serial && /^sy:\/\//.test(serial)) serial = null;
    // Brand: a brand folder on the path, the sales export's brand for the same model, or the first word of the name.
    let brand: string | null = null;
    for (const seg of path) if (FOLDER_BRANDS.has(brandKey(seg))) brand = brandKey(seg);
    brand = brand ?? salesModelBrand.get(nk(name)) ?? null;
    if (!brand) {
      const first = brandKey(name.split(/[\s\-]/)[0] ?? "");
      if (first && (brandKeys.has(first) || FOLDER_BRANDS.has(first))) brand = first;
    }
    const notes = [r.Notes, r.Tags ? `Tag: ${r.Tags}` : "", r["Borrower Name"] ? `Borrower: ${r["Borrower Name"]}` : ""].filter(Boolean).join(" · ") || null;
    const date = usDate(r["Purchase Date"]) ?? null;
    const item: Item = { key, source: "sortly", kind: "none", name, description: null, brand, sku, serial, mac: null, qty, cost: money(r.Price), price: null, date, note: notes, location: null, folder: null, designer: null, group: null, rep: null, rowRef: `Sortly row ${r._row}` };
    if (!P) {
      item.kind = "client";
      item.folder = "(no folder)";
    } else if (STOCK_PRIMARY.has(P)) {
      item.kind = /\bRMA\b/i.test(path.join(" ")) ? "rma" : "stock";
      item.location = path.join(" / ");
    } else if (P === "PROJECTS TS") {
      if (L2) {
        item.designer = L1;
        item.folder = L2;
        item.group = [L3, L4].filter(Boolean).join(" / ") || null;
      } else if (L1) {
        item.folder = L1;
      } else item.folder = "PROJECTS TS (root)";
      item.kind = "client";
    } else if (P === "Pastas Antigas") {
      if (L1 && designers.has(L1) && L2) {
        item.designer = L1;
        item.folder = L2;
        item.group = [L3, L4].filter(Boolean).join(" / ") || null;
      } else {
        item.folder = L1 || "Pastas Antigas (root)";
        item.group = [L2, L3, L4].filter(Boolean).join(" / ") || null;
      }
      item.kind = /\bRMA\b/i.test(item.folder) ? "rma" : "client";
      if (item.kind === "rma") item.location = path.join(" / ");
    } else {
      item.folder = P;
      item.group = [L1, L2, L3, L4].filter(Boolean).join(" / ") || null;
      item.kind = "client";
    }
    if (item.serial && salesSerials.has(item.serial)) superseded.push(item);
    else items.push(item);
  }
  return { items, superseded, dupSid };
}

// Sales -----------------------------------------------------------

function salesItems(rows: Row[]): { items: Item[]; blank: number } {
  const seen = new Map<string, number>();
  const items: Item[] = [];
  let blank = 0;
  for (const r of rows) {
    if (!r.Type && !r.Model && !r.Serial) {
      blank++;
      continue;
    }
    const serial = r.Serial || null;
    const base = `sales:${serial ?? `row${r._row}`}`;
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    const client = r.Client.replace(/\s+/g, " ").trim();
    const item: Item = {
      key: n > 1 ? `${base}:${n}` : base,
      source: "sales",
      kind: "client",
      name: modelCase(r.Model || r.Type),
      description: r.Type && nk(r.Type) !== nk(r.Model) ? r.Type : null,
      brand: r.Brand ? brandKey(r.Brand) : null,
      sku: r.SKU || null,
      serial,
      mac: r.Mac || null,
      qty: 1,
      cost: money(r.Cost),
      price: money(r.Price),
      date: usDate(r.Date),
      note: null,
      location: r.Local ? titleCase(r.Local) : null,
      folder: client,
      designer: null,
      group: r.PO ? `PO ${r.PO}` : null,
      rep: r.Representative ? r.Representative.replace(/\s*\(.*\)\s*$/, "").trim() : null,
      rowRef: `Sales row ${r._row}`,
    };
    if (INTERNAL_SALES.test(client)) {
      item.kind = "stock";
      item.location = item.location ?? "Warehouse";
      item.folder = null;
    } else if (/\bRMA\b/i.test(client)) {
      item.kind = "rma";
      item.location = client;
      item.folder = null;
    }
    items.push(item);
  }
  return { items, blank };
}

// ---------------------------------------------------------------- catalog (projects, people, decisions)

type Decision = { decision: string; projectName: string | null; ids: (number | null)[] };
type Catalog = { projects: CatProject[]; projectTitle: Map<number, string>; projectByTitle: Map<string, number>; employees: CatEmployee[]; nameMap: Record<string, number>; archiveDecisions: Map<string, number | null>; fileFolders: Map<string, number>; sheetDecisions: Map<string, Decision> };

async function loadCatalog(): Promise<Catalog> {
  const [{ data: pr }, { data: emp }, { data: g }, { data: dec }] = await Promise.all([
    db.from("projects").select("id, title, job_address, apartment_or_unit, created_at, job_owner_id").is("deleted_at", null),
    db.from("employees").select("id, title").is("deleted_at", null),
    db.from("app_integrations").select("data").eq("key", "google").maybeSingle(),
    db.from("app_integrations").select("data").eq("key", "report_archive_folders").maybeSingle(),
  ]);
  type Addr = { street?: string; city?: string; zip?: string } | null;
  const projects = ((pr ?? []) as { id: number; title: string | null; job_address: Addr; apartment_or_unit: string | null; created_at: string | null; job_owner_id: number | null }[]).filter((p) => p.title);
  const ownerIds = [...new Set(projects.map((p) => p.job_owner_id).filter((x): x is number => x !== null))];
  const { data: owners } = ownerIds.length ? await db.from("contacts").select("id, title").in("id", ownerIds) : { data: [] };
  const ownerName = new Map(((owners ?? []) as { id: number; title: string | null }[]).map((c) => [c.id, c.title]));
  const folders = ((dec?.data as { folders?: { folder: string; projectId: number | null }[] } | null)?.folders ?? []);
  const sheetDecisions = new Map<string, Decision>();
  if (existsSync(SHEET)) {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(SHEET);
    const ws = wb.getWorksheet("Folders");
    if (ws) {
      let header = 0;
      ws.eachRow((r, n) => {
        if (!header && (r.values as ExcelJS.CellValue[]).some((c) => cellText(c) === "YOUR DECISION")) header = n;
      });
      if (header) {
        const names = (ws.getRow(header).values as ExcelJS.CellValue[]).map(cellText);
        const col = (h: string) => names.indexOf(h);
        ws.eachRow((r, n) => {
          if (n <= header) return;
          const v = (i: number) => cellText(r.getCell(i).value);
          const decision = v(col("YOUR DECISION"));
          if (!decision) return;
          const ids = [v(col("Likeliest project 1")), v(col("Likeliest project 2"))].map((s) => (s.match(/#(\d+)\s*$/) ? Number(s.match(/#(\d+)\s*$/)![1]) : null));
          sheetDecisions.set(`${v(col("Source")).toLowerCase()}|${folderKey(v(col("Folder")))}`, { decision, projectName: v(col("Project name (for Other)")) || null, ids });
        });
      }
    }
  }
  // Folders the report archive already linked to a project (through the imported reports): the strongest clue.
  const seenFolder = new Map<string, Set<number>>();
  for (let from = 0; ; from += 1000) {
    const { data } = await db.from("report_files").select("client_folder, project_id").not("project_id", "is", null).order("id").range(from, from + 999);
    for (const r of (data ?? []) as { client_folder: string; project_id: number }[]) {
      for (const k of [folderKey(r.client_folder), tokenKey(r.client_folder)]) (seenFolder.get(k) ?? seenFolder.set(k, new Set()).get(k)!).add(r.project_id);
    }
    if ((data ?? []).length < 1000) break;
  }
  const fileFolders = new Map<string, number>();
  for (const [k, ids] of seenFolder) if (ids.size === 1) fileFolders.set(k, [...ids][0]);
  const cat: CatProject[] = projects.map((p) => ({ id: p.id, title: p.title!, street: p.job_address?.street ?? null, city: p.job_address?.city ?? null, zip: p.job_address?.zip ?? null, unit: p.apartment_or_unit?.trim() || null, owner: (p.job_owner_id && ownerName.get(p.job_owner_id)) || null, createdAt: p.created_at }));
  return {
    projects: cat,
    projectTitle: new Map(cat.map((p) => [p.id, p.title])),
    projectByTitle: new Map(cat.map((p) => [norm(p.title), p.id])),
    employees: ((emp ?? []) as { id: number; title: string | null }[]).filter((e) => e.title).map((e) => ({ id: e.id, name: e.title! })),
    nameMap: { roberto: 1011, leo: 1007, uli: 1013, ulisses: 1013, fred: 1000, ...((g?.data as { name_map?: Record<string, number> } | null)?.name_map ?? {}) },
    archiveDecisions: new Map(folders.map((d) => [folderKey(d.folder), d.projectId])),
    fileFolders,
    sheetDecisions,
  };
}

/** "ESTEVES, SONIA" → the one project whose title or owner carries both names; null when none or several. */
const NOISE = /^(residence|res|house|casa|nova|office|apt|unit|the|and|group|design|interiors|project|projeto|new|old)$/;
const significant = (s: string | null) => norm(s).split(" ").filter((w) => w.length >= 3 && !NOISE.test(w));
function uniqueByName(raw: string, cat: Catalog): number | null {
  const pf = parseClientFolder(raw);
  const words = significant(pf.client);
  if (words.length < 2) return null;
  const place = significant(pf.place);
  const hits = cat.projects.filter((p) => {
    const hay = norm(`${p.title} ${p.owner ?? ""}`).split(" ");
    if (!words.every((w) => hay.includes(w))) return false;
    // A place in the folder must agree with the project ("GUIMAR URBINA - LAZARUS" is not the Guimar parents house).
    const where = norm(`${p.title} ${p.street ?? ""} ${p.city ?? ""} ${p.unit ?? ""}`).split(" ");
    return place.length === 0 || place.some((w) => where.includes(w));
  });
  return hits.length === 1 ? hits[0].id : null;
}

const EMPTY_NAME: ParsedName = { date: null, job: null, visitType: null, technicians: [], variant: null, ext: "" };

type Folder = {
  source: Source;
  raw: string;
  designer: string | null;
  items: Item[];
  projectId: number | null;
  /** "archive" = decided on the Report archive page, "sheet" = Fred's spreadsheet answer, "score" = matched by the engine. */
  how: "archive" | "files" | "name" | "sheet" | "score" | "stock" | "skip" | "pending" | "new";
  candidates: { id: number; title: string; score: number }[];
};

function matchFolder(f: Folder, cat: Catalog) {
  const key = folderKey(f.raw);
  const sheet = cat.sheetDecisions.get(`${f.source}|${key}`);
  const scores = scoreArchiveFile(parseClientFolder(f.raw), EMPTY_NAME, cat.projects);
  f.candidates = scores.slice(0, 3).map((s) => ({ id: s.id, title: cat.projectTitle.get(s.id) ?? "", score: s.score }));
  if (sheet) {
    const d = sheet.decision.toLowerCase();
    if (d.startsWith("project 1") && sheet.ids[0]) return Object.assign(f, { projectId: sheet.ids[0], how: "sheet" as const });
    if (d.startsWith("project 2") && sheet.ids[1]) return Object.assign(f, { projectId: sheet.ids[1], how: "sheet" as const });
    if (d.startsWith("other")) {
      const id = sheet.projectName ? (cat.projectByTitle.get(norm(sheet.projectName)) ?? (sheet.projectName.match(/^#?(\d+)$/) ? Number(sheet.projectName.match(/^#?(\d+)$/)![1]) : null)) : null;
      if (id && cat.projectTitle.has(id)) return Object.assign(f, { projectId: id, how: "sheet" as const });
      console.log(`   ! ${f.source} "${f.raw}": decision Other but no project named "${sheet.projectName}" — left pending`);
    }
    if (d.startsWith("stock")) return Object.assign(f, { projectId: null, how: "stock" as const });
    if (d.startsWith("skip")) return Object.assign(f, { projectId: null, how: "skip" as const });
    if (d.startsWith("new")) return Object.assign(f, { projectId: null, how: "new" as const });
  }
  if (cat.archiveDecisions.has(key)) {
    const id = cat.archiveDecisions.get(key) ?? null;
    return Object.assign(f, { projectId: id, how: id ? ("archive" as const) : ("pending" as const) });
  }
  const fromFiles = cat.fileFolders.get(key) ?? cat.fileFolders.get(tokenKey(f.raw));
  if (fromFiles) return Object.assign(f, { projectId: fromFiles, how: "files" as const });
  const id = pickProject(scores) ?? uniqueByName(f.raw, cat);
  return Object.assign(f, { projectId: id, how: id ? (pickProject(scores) ? ("score" as const) : ("name" as const)) : ("pending" as const) });
}

// ---------------------------------------------------------------- build the records

type StockRow = { source_ref: string; product: Product; serial: string; mac: string | null; location: string | null; status: "In Stock" | "On Project" | "RMA"; destination: number | null; staff: number | null; note: string | null };
type Movement = { source_ref: string; product: Product; location: string; quantity: number; serial: string | null; moved_at: string | null; notes: string | null };
type Checkout = { source_ref: string; projectId: number; technician: number | null; date: string | null; header: string; lines: Map<string, { qty: number; text: string }>; source: Source; folder: string };

function technicianId(name: string | null, cat: Catalog): number | null {
  if (!name) return null;
  const key = norm(name);
  if (cat.nameMap[key]) return cat.nameMap[key];
  const hits = findPeople(key, cat.employees);
  return hits.length === 1 ? hits[0].id : null;
}

/** "Apple APPLE TV 4K" → "APPLE TV 4K": the brand is only prefixed when the name doesn't start with it. */
const productLabel = (p: Product) => {
  const b = p.brand ? brandName(p.brand) : null;
  return b && !nk(p.name).startsWith(nk(b)) ? `${b} ${p.name}` : p.name;
};
/** The sales "Type" only when it adds something ("WATTBOX" on a WattBox doesn't). */
const productDescription = (p: Product) => (p.description && !nk(productLabel(p)).includes(nk(p.description)) ? p.description : null);

function lineText(p: Product, it: Item): string {
  const label = productLabel(p);
  const extra = [productDescription(p) ? `(${productDescription(p)})` : null, it.serial ? `S/N ${it.serial}` : null, it.mac ? `MAC ${it.mac}` : null, it.note].filter(Boolean);
  return [label, ...extra].join(" – ");
}

async function main() {
  console.log(`Reading ${SORTLY} and ${SALES} …`);
  const [sortlyRows, salesRows, cat] = await Promise.all([readSheet(SORTLY), readSheet(SALES), loadCatalog()]);
  const sales = salesItems(salesRows);
  const salesSerials = new Set(sales.items.map((i) => i.serial).filter((s): s is string => Boolean(s)));
  const salesModelBrand = new Map<string, string>();
  for (const i of sales.items) if (i.brand && !salesModelBrand.has(nk(i.name))) salesModelBrand.set(nk(i.name), i.brand);
  const sortly = sortlyItems(sortlyRows, salesSerials, salesModelBrand);
  const items = [...sales.items, ...sortly.items];

  // Products: one per model / name; the sales export (newer, with brand and cost) fills the card first.
  const products = new Map<string, Product>();
  const bySku = new Map<string, Product>();
  for (const it of items) {
    let p = products.get(nk(it.name)) ?? (it.sku ? bySku.get(it.sku) : undefined);
    if (!p) {
      p = { key: nk(it.name), name: it.name, description: it.description, brand: it.brand, sku: it.sku, cost: null, price: null, costDate: "", type: productType(`${it.description ?? ""} ${it.name}`), sources: new Set(), locations: new Map() };
      products.set(p.key, p);
    }
    p.sources.add(it.source);
    p.brand = p.brand ?? it.brand;
    p.sku = p.sku ?? it.sku;
    p.description = p.description ?? it.description;
    if (p.sku) bySku.set(p.sku, p);
    const when = it.date ?? "0000";
    if (it.cost !== null && (it.source === "sales" ? when >= p.costDate || !p.sources.has("sales") : !p.sources.has("sales") && when >= p.costDate)) {
      p.cost = it.cost;
      p.price = it.price ?? p.price;
      p.costDate = when;
    }
  }
  const productOf = (it: Item) => products.get(nk(it.name)) ?? (it.sku ? bySku.get(it.sku) : undefined)!;

  // Client folders → projects.
  const folders = new Map<string, Folder>();
  for (const it of items) {
    if (it.kind !== "client" || !it.folder) continue;
    const k = `${it.source}|${folderKey(it.folder)}`;
    const f = folders.get(k) ?? { source: it.source, raw: it.folder, designer: it.designer, items: [], projectId: null, how: "pending" as const, candidates: [] };
    f.items.push(it);
    folders.set(k, f);
  }
  for (const f of folders.values()) matchFolder(f, cat);

  // Records.
  const stock: StockRow[] = [];
  const movements: Movement[] = [];
  const checkouts = new Map<string, Checkout>();
  const skipped: { item: Item; why: string }[] = [];
  const addLine = (co: Checkout, p: Product, it: Item) => {
    const text = lineText(p, it);
    const cur = co.lines.get(text) ?? { qty: 0, text };
    cur.qty += it.qty;
    co.lines.set(text, cur);
    if (!co.date || (it.date && it.date > co.date)) co.date = it.date ?? co.date;
  };
  for (const it of items) {
    const p = productOf(it);
    const folder = it.folder ? folders.get(`${it.source}|${folderKey(it.folder)}`) : null;
    const asStock = it.kind === "stock" || it.kind === "rma" || folder?.how === "stock";
    if (asStock) {
      const location = it.location ?? (folder ? `${folder.raw}` : "Warehouse");
      p.locations.set(location, (p.locations.get(location) ?? 0) + it.qty);
      movements.push({ source_ref: it.key, product: p, location, quantity: it.qty, serial: it.serial, moved_at: it.date, notes: [it.note, it.rowRef].filter(Boolean).join(" · ") });
      if (it.serial && it.qty === 1) stock.push({ source_ref: it.key, product: p, serial: it.serial, mac: it.mac, location, status: it.kind === "rma" ? "RMA" : "In Stock", destination: null, staff: technicianId(it.rep, cat), note: it.note });
      continue;
    }
    if (!folder || folder.how === "pending" || folder.how === "new") {
      skipped.push({ item: it, why: folder ? folder.how : "no folder" });
      continue;
    }
    if (folder.how === "skip") {
      // Not a project: serialized units still get a Stock record so the serial can be found; nothing else.
      if (it.serial && it.qty === 1) stock.push({ source_ref: it.key, product: p, serial: it.serial, mac: it.mac, location: it.location, status: "On Project", destination: null, staff: technicianId(it.rep, cat), note: [folder.raw, it.note].filter(Boolean).join(" · ") });
      skipped.push({ item: it, why: "skip" });
      continue;
    }
    const projectId = folder.projectId!;
    const coKey = it.source === "sales" ? `sales:co:${folderKey(folder.raw)}|${it.group ?? ""}|${it.date ?? ""}` : `sortly:co:${folderKey(folder.raw)}|${it.group ?? ""}`;
    const co = checkouts.get(coKey) ?? {
      source_ref: coKey,
      projectId,
      technician: null,
      date: it.source === "sales" ? it.date : (it.group ? dateIn(it.group) : null),
      header: it.source === "sales" ? [it.group ?? "No PO", it.location ? `kept at ${it.location}` : null].filter(Boolean).join(" – ") : `Sortly folder: ${[it.designer, folder.raw, it.group].filter(Boolean).join(" / ")}`,
      lines: new Map(),
      source: it.source,
      folder: folder.raw,
    };
    checkouts.set(coKey, co);
    addLine(co, p, it);
    const tech = technicianId(it.rep, cat);
    if (tech && !co.technician) co.technician = tech;
    if (stockAll && it.serial && it.qty === 1) stock.push({ source_ref: it.key, product: p, serial: it.serial, mac: it.mac, location: it.location, status: "On Project", destination: projectId, staff: tech, note: it.note });
  }

  // ---------------------------------------------------------------- report
  const n = (x: number) => x.toLocaleString("en-US");
  const count = <T,>(arr: T[], f: (x: T) => string | null | undefined) => {
    const m = new Map<string, number>();
    for (const x of arr) {
      const k = f(x);
      if (k) m.set(k, (m.get(k) ?? 0) + 1);
    }
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  };
  const units = (arr: Item[]) => arr.reduce((a, i) => a + i.qty, 0);
  console.log(`\nSOURCES\n  Sortly: ${n(sortlyRows.length)} rows (${n(sortly.dupSid)} repeated SIDs kept apart by folder), ${n(sortly.superseded.length)} rows superseded by the sales export (same serial)\n  Sales:  ${n(salesRows.length)} rows, ${n(sales.blank)} blank rows skipped`);
  const byKind = (src: Source) => count(items.filter((i) => i.source === src), (i) => i.kind).map(([k, v]) => `${k} ${n(v)}`).join(", ");
  console.log(`  Sortly rows by kind: ${byKind("sortly")}\n  Sales rows by kind:  ${byKind("sales")}`);
  console.log(`\nPRODUCTS: ${n(products.size)} (${n([...products.values()].filter((p) => p.sources.has("sales") && p.sources.has("sortly")).length)} in both exports, ${n([...products.values()].filter((p) => !p.brand).length)} without a brand, ${n([...products.values()].filter((p) => p.cost === null).length)} without a cost)`);
  const brands = count([...products.values()], (p) => p.brand);
  console.log(`  Brands: ${brands.length} → ${brands.slice(0, 12).map(([b, c]) => `${brandName(b)} ${c}`).join(", ")} …`);
  console.log(`  Product type set on ${n([...products.values()].filter((p) => p.type).length)} products (${count([...products.values()], (p) => p.type).map(([k, v]) => `${k} ${v}`).join(", ")})`);
  const inStock = movements.reduce((a, m) => a + m.quantity, 0);
  console.log(`\nSTOCK ON HAND (ledger opening balances): ${n(movements.length)} movements, ${n(inStock)} units in ${n(new Set(movements.map((m) => m.location)).size)} locations`);
  for (const [loc, c] of count(movements, (m) => m.location.split(" / ").slice(0, 2).join(" / ")).slice(0, 14)) console.log(`    ${loc}: ${c}`);
  console.log(`  Stock records (serialized units): ${n(stock.length)} (${count(stock, (s) => s.status).map(([k, v]) => `${k} ${v}`).join(", ")})${stockAll ? "" : ` — with --stock-all: ${n(stock.length + items.filter((i) => i.kind === "client" && i.serial && i.qty === 1 && folders.get(`${i.source}|${folderKey(i.folder!)}`)?.projectId).length)}`}`);
  const fl = [...folders.values()];
  const matched = fl.filter((f) => f.projectId);
  const pending = fl.filter((f) => f.how === "pending" || f.how === "new");
  console.log(`\nCLIENT FOLDERS: ${n(fl.length)} (Sortly ${n(fl.filter((f) => f.source === "sortly").length)}, Sales ${n(fl.filter((f) => f.source === "sales").length)})`);
  console.log(`  Matched to a project: ${n(matched.length)} folders, ${n(matched.reduce((a, f) => a + f.items.length, 0))} rows, ${n(units(matched.flatMap((f) => f.items)))} units (${count(matched, (f) => f.how).map(([k, v]) => `${k} ${v}`).join(", ")})`);
  console.log(`  Kept as stock / skipped by your sheet: ${n(fl.filter((f) => f.how === "stock").length)} / ${n(fl.filter((f) => f.how === "skip").length)}`);
  console.log(`  Still without a project: ${n(pending.length)} folders, ${n(pending.reduce((a, f) => a + f.items.length, 0))} rows, ${n(units(pending.flatMap((f) => f.items)))} units → ${SHEET}`);
  for (const s of ["sortly", "sales"] as Source[]) {
    const rows = (fs: Folder[]) => n(fs.filter((f) => f.source === s).reduce((a, f) => a + f.items.length, 0));
    console.log(`    ${s}: matched ${rows(matched)} rows in ${n(matched.filter((f) => f.source === s).length)} folders · pending ${rows(pending)} rows in ${n(pending.filter((f) => f.source === s).length)} folders`);
  }
  const co = [...checkouts.values()];
  console.log(`\nINVENTORY CHECKOUTS: ${n(co.length)} (Sortly ${n(co.filter((c) => c.source === "sortly").length)}, Sales ${n(co.filter((c) => c.source === "sales").length)}), ${n(co.reduce((a, c) => a + c.lines.size, 0))} lines, on ${n(new Set(co.map((c) => c.projectId)).size)} projects; ${n(co.filter((c) => c.technician).length)} with a technician, ${n(co.filter((c) => !c.date).length)} without a date`);
  const reps = count(items.filter((i) => i.rep), (i) => i.rep);
  console.log(`  Representatives: ${reps.map(([r, c]) => `${r} ${c}${technicianId(r, cat) ? "" : " (no employee!)"}`).join(", ")}`);
  console.log(`\nEXAMPLES`);
  for (const c of [co.find((c) => c.source === "sales"), co.find((c) => c.source === "sortly")].filter((x): x is Checkout => Boolean(x))) {
    console.log(`  Checkout → ${cat.projectTitle.get(c.projectId)} · ${c.date ? formatDate(c.date) : "no date"} · ${c.technician ? cat.employees.find((e) => e.id === c.technician)?.name : "no technician"}`);
    console.log(`    ${c.header}`);
    for (const l of [...c.lines.values()].slice(0, 3)) console.log(`    ${String(l.qty).padStart(2, "0")} - ${l.text}`);
    if (c.lines.size > 3) console.log(`    … ${c.lines.size - 3} more lines`);
  }
  console.log(`  Top matched folders: ${matched.sort((a, b) => b.items.length - a.items.length).slice(0, 6).map((f) => `${f.raw} → ${cat.projectTitle.get(f.projectId!)} (${f.items.length})`).join(" | ")}`);
  console.log(`  Top pending folders: ${pending.sort((a, b) => b.items.length - a.items.length).slice(0, 10).map((f) => `${f.raw} (${f.items.length}${f.candidates[0] ? `, best ${f.candidates[0].title} ${f.candidates[0].score}` : ""})`).join(" | ")}`);
  console.log(`  Matched by name only (check): ${matched.filter((f) => f.how === "name").map((f) => `${f.raw} → ${cat.projectTitle.get(f.projectId!)} (${f.items.length})`).join(" | ")}`);
  const superBy = count(sortly.superseded, (i) => i.kind);
  console.log(`  Superseded Sortly rows by kind: ${superBy.map(([k, v]) => `${k} ${v}`).join(", ")}`);

  if (!flag("--no-sheet")) await writeSheet(pending, cat);

  if (!apply) {
    console.log("\nDry run only — nothing written. Re-run with --apply to load.");
    return;
  }
  await write(products, stock, movements, co, cat);
}

// ---------------------------------------------------------------- the decisions sheet

async function writeSheet(pending: Folder[], cat: Catalog) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Folders", { views: [{ state: "frozen", ySplit: 3 }] });
  const headers = ["Source", "Folder", "Designer / GC", "Rows", "Units", "First date", "Last date", "PO / subfolders", "Sample items", "Likeliest project 1", "Likeliest project 2", "YOUR DECISION", "Project name (for Other)"];
  ws.addRow(["Inventory import: client folders with no project. Fill in column L (yellow). Choices: Project 1 / Project 2 = the suggestion is right · Other = type the exact CRM project name (or #id) in column M · New = create the project (Admin › Report archive › New project from this folder, then run again) · Stock = not a client, keep the items as stock under this name · Skip = leave these items out."]);
  ws.mergeCells(1, 1, 1, headers.length);
  ws.addRow(["Example: a row with Likeliest project 1 \"Peltz, Nelson - Palm Beach (88) #1200\" and decision \"Project 1\" puts those items on that project as Inventory Checkouts. Rows you leave blank stay pending."]);
  ws.mergeCells(2, 1, 2, headers.length);
  ws.addRow(headers).font = { bold: true };
  const sorted = [...pending].sort((a, b) => a.source.localeCompare(b.source) || b.items.length - a.items.length);
  const old = cat.sheetDecisions;
  for (const f of sorted) {
    const dates = f.items.map((i) => i.date).filter((d): d is string => Boolean(d)).sort();
    const groups = [...new Set(f.items.map((i) => i.group).filter(Boolean))].slice(0, 6).join(", ");
    const sample = [...new Set(f.items.map((i) => i.name))].slice(0, 6).join(", ");
    const prev = old.get(`${f.source}|${folderKey(f.raw)}`);
    const c = (i: number) => (f.candidates[i] ? `${f.candidates[i].title} (${f.candidates[i].score}) #${f.candidates[i].id}` : "");
    ws.addRow([f.source === "sortly" ? "Sortly" : "Sales", f.raw, f.designer ?? "", f.items.length, f.items.reduce((a, i) => a + i.qty, 0), dates[0] ? formatDate(dates[0]) : "", dates.at(-1) ? formatDate(dates.at(-1)!) : "", groups, sample, c(0), c(1), prev?.decision ?? "", prev?.projectName ?? ""]);
  }
  const widths = [8, 44, 24, 6, 6, 11, 11, 30, 50, 40, 40, 16, 36];
  widths.forEach((w, i) => (ws.getColumn(i + 1).width = w));
  for (let r = 4; r < 4 + sorted.length; r++) {
    ws.getCell(r, 12).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFF2B2" } };
    ws.getCell(r, 12).dataValidation = { type: "list", allowBlank: true, formulae: ['"Project 1,Project 2,Other,New,Stock,Skip"'] };
  }
  const pl = wb.addWorksheet("Projects");
  pl.addRow(["CRM project names (for column M)"]).font = { bold: true };
  for (const t of [...cat.projectTitle.values()].sort((a, b) => a.localeCompare(b))) pl.addRow([t]);
  pl.getColumn(1).width = 50;
  await wb.xlsx.writeFile(SHEET);
  console.log(`\nWrote ${SHEET}: ${sorted.length} folders to decide${old.size ? ` (${old.size} earlier answers carried over)` : ""}.`);
}

// ---------------------------------------------------------------- write

/** Every row of a table (PostgREST answers 1,000 at a time). */
async function allRows<T>(table: string, select: string, filter?: (q: ReturnType<typeof db.from>["select"] extends (...a: never[]) => infer R ? R : never) => unknown): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += 1000) {
    let q = db.from(table).select(select).order("id").range(from, from + 999);
    if (filter) q = filter(q as never) as typeof q;
    const { data, error } = await q;
    if (error) throw new Error(`${table}: ${error.message}`);
    out.push(...((data ?? []) as T[]));
    if ((data ?? []).length < 1000) break;
  }
  return out;
}

/** New rows and updates in one batch: PostgREST would send id = null for the new ones, so the two go separately. */
async function writeRows<T extends { id?: number }>(table: string, rows: T[], select: string): Promise<Record<string, unknown>[]> {
  const out: Record<string, unknown>[] = [];
  const withId = rows.filter((r) => r.id);
  const fresh = rows.filter((r) => !r.id);
  if (withId.length) {
    const { data, error } = await db.from(table).upsert(withId, { onConflict: "id" }).select(select);
    if (error) throw new Error(`${table} update: ${error.message}`);
    out.push(...((data ?? []) as unknown as Record<string, unknown>[]));
  }
  if (fresh.length) {
    const { data, error } = await db.from(table).insert(fresh).select(select);
    if (error) throw new Error(`${table} insert: ${error.message}`);
    out.push(...((data ?? []) as unknown as Record<string, unknown>[]));
  }
  return out;
}

async function write(products: Map<string, Product>, stock: StockRow[], movements: Movement[], checkouts: Checkout[], cat: Catalog) {
  const fail = (what: string, e: { message: string } | null) => {
    if (e) throw new Error(`${what}: ${e.message}`);
  };
  // 1. Brands.
  const { data: br, error: be } = await db.from("brands").select("id, name").is("deleted_at", null);
  fail("brands", be);
  const brandId = new Map(((br ?? []) as { id: number; name: string | null }[]).filter((b) => b.name).map((b) => [brandKey(b.name!), b.id]));
  const newBrands = [...new Set([...products.values()].map((p) => p.brand).filter((b): b is string => Boolean(b)))].filter((b) => !brandId.has(b));
  if (newBrands.length) {
    const { data, error } = await db.from("brands").insert(newBrands.map((b) => ({ name: brandName(b), title: brandName(b) }))).select("id, name");
    fail("brands insert", error);
    for (const b of (data ?? []) as { id: number; name: string }[]) brandId.set(brandKey(b.name), b.id);
  }
  console.log(`✓ brands: ${newBrands.length} added`);

  // 2. Products (matched again by source key, then by model / SKU, so a re-run updates instead of duplicating).
  const exRows = await allRows<{ id: number; source_ref: string | null; model: string | null; sku: string | null }>("products", "id, source_ref, model, sku", (q) => (q as { is: (c: string, v: null) => unknown }).is("deleted_at", null));
  const byRef = new Map(exRows.filter((r) => r.source_ref).map((r) => [r.source_ref!, r.id]));
  const byModel = new Map(exRows.filter((r) => r.model).map((r) => [nk(r.model!), r.id]));
  const bySkuEx = new Map(exRows.filter((r) => r.sku).map((r) => [r.sku!, r.id]));
  let added = 0;
  const list = [...products.values()];
  for (let i = 0; i < list.length; i += 200) {
    const batch = list.slice(i, i + 200).map((p) => {
      const ref = `inv:${p.key}`;
      const id = byRef.get(ref) ?? byModel.get(p.key) ?? (p.sku ? bySkuEx.get(p.sku) : undefined);
      if (!id) added++;
      const location = [...p.locations.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
      const brand = p.brand && !nk(p.name).startsWith(nk(p.brand)) ? brandName(p.brand) : "";
      return {
        ...(id ? { id } : {}),
        source_ref: ref,
        title: joinTitleParts([{ text: brand, token: true }, { text: " ", token: false }, { text: p.name, token: true }, { text: " (", token: false }, { text: p.sku ?? "", token: true }, { text: ")", token: false }]),
        product_type: p.type,
        brand_id: p.brand ? (brandId.get(p.brand) ?? null) : null,
        sku: p.sku,
        model: p.name,
        description: productDescription(p),
        cost: p.cost,
        sell_price: p.price,
        location,
      };
    });
    const data = await writeRows("products", batch, "id, source_ref");
    for (const r of data as { id: number; source_ref: string }[]) {
      const p = products.get(r.source_ref.replace(/^inv:/, ""));
      if (p) p.id = r.id;
    }
  }
  console.log(`✓ products: ${list.length} written (${added} new)`);

  // 3. Stock movements (opening balances), one per source row.
  const mv = movements.map((m) => ({ source_ref: m.source_ref, product_id: m.product.id!, location: m.location, quantity: m.quantity, kind: "opening", serial: m.serial, notes: m.notes, moved_at: m.moved_at ? `${m.moved_at}T12:00:00-04:00` : "2021-11-15T12:00:00-05:00" }));
  for (let i = 0; i < mv.length; i += 500) {
    const { error } = await db.from("stock_movements").upsert(mv.slice(i, i + 500), { onConflict: "source_ref" });
    fail(`stock_movements ${i}`, error);
  }
  console.log(`✓ stock_movements: ${mv.length} written`);

  // 4. Stock records (serialized units) + their workflow stage.
  const sx = await allRows<{ id: number; source_ref: string | null; serial: string | null }>("stock_items", "id, source_ref, serial", (q) => (q as { is: (c: string, v: null) => unknown }).is("deleted_at", null));
  const stockByRef = new Map((sx as { id: number; source_ref: string | null }[]).filter((r) => r.source_ref).map((r) => [r.source_ref!, r.id]));
  const stockBySerial = new Map((sx as { id: number; serial: string | null }[]).filter((r) => r.serial).map((r) => [r.serial!, r.id]));
  const { data: lv } = await db.from("workflow_levels").select("id, title").eq("workflow_id", "stock_status");
  const levelId = new Map(((lv ?? []) as { id: number; title: string }[]).map((l) => [l.title, l.id]));
  let stockNew = 0;
  for (let i = 0; i < stock.length; i += 200) {
    const batch = stock.slice(i, i + 200).map((s) => {
      const id = stockByRef.get(s.source_ref) ?? stockBySerial.get(s.serial);
      if (!id) stockNew++;
      const p = s.product;
      return { ...(id ? { id } : {}), source_ref: s.source_ref, title: s.serial, product_id: p.id!, serial: s.serial, mac_address: s.mac, location: s.location, product_type: p.type, brand_id: p.brand ? (brandId.get(p.brand) ?? null) : null, model: p.name, sell_price: p.price, cost: p.cost, destination_project_id: s.destination, staff_id: s.staff, status: s.status };
    });
    const data = await writeRows("stock_items", batch, "id, status");
    const states = (data as { id: number; status: string }[]).map((r) => ({ table_name: "stock_items", record_id: r.id, workflow_id: "stock_status", level_id: levelId.get(r.status)!, entered_at: new Date().toISOString() })).filter((s) => s.level_id);
    const { error: we } = await db.from("record_workflow_state").upsert(states, { onConflict: "table_name,record_id" });
    fail(`stock workflow ${i}`, we);
  }
  console.log(`✓ stock_items: ${stock.length} written (${stockNew} new)`);

  // 5. Inventory Checkouts.
  const cx = await allRows<{ id: number; source_ref: string }>("inventory_checkouts", "id, source_ref", (q) => (q as { not: (c: string, o: string, v: null) => unknown }).not("source_ref", "is", null));
  const coByRef = new Map((cx as { id: number; source_ref: string }[]).map((r) => [r.source_ref, r.id]));
  const empName = new Map(cat.employees.map((e) => [e.id, e.name]));
  let coNew = 0;
  for (let i = 0; i < checkouts.length; i += 200) {
    const batch = checkouts.slice(i, i + 200).map((c) => {
      const id = coByRef.get(c.source_ref);
      if (!id) coNew++;
      const lines = [...c.lines.values()].sort((a, b) => a.text.localeCompare(b.text)).map((l) => `${String(l.qty).padStart(2, "0")} - ${l.text}`);
      const title = joinTitleParts([{ text: c.technician ? (empName.get(c.technician) ?? "") : "", token: true }, { text: " – ", token: false }, { text: c.date ? formatDate(c.date) : "", token: true }]) ?? c.folder;
      return { ...(id ? { id } : {}), source_ref: c.source_ref, title, type: "Materials", project_id: c.projectId, technician_id: c.technician, date: c.date, equipment: [c.header, ...lines].join("\n") };
    });
    await writeRows("inventory_checkouts", batch, "id");
  }
  console.log(`✓ inventory_checkouts: ${checkouts.length} written (${coNew} new)`);
  console.log("\nDone.");
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
