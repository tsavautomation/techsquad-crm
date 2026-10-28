/**
 * FIN-m: import Luana's "Sales Projections" sheet into sheet_proposals, with project suggestions, and link by itself
 * the rows whose Portal.io proposal is already linked to a project. Safe to run again: rows are keyed by number +
 * title and only new or changed ones are written; linked and ignored rows keep their state.
 *
 *   npx tsx scripts/import-sales-sheet.ts "Sales Projections_Dashboard Updated 10-27-26.xlsx" [--apply]
 *
 * Without --apply it only reports. Reads .env.local (NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SECRET_KEY).
 * The sheet is read by scripts/sheet-to-json.mjs (exceljs), spawned as plain node.
 */
import fs from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { parseSheet, type SheetRow } from "../src/lib/finance/sheet";
import { linkSheetRow, sheetSuggestions } from "../src/lib/finance/sheet-link";
import { loadProjectIndex } from "../src/lib/portalio/project-index";

async function main() {
  const [file, ...flags] = process.argv.slice(2);
  if (!file) throw new Error("Give the .xlsx path");
  const apply = flags.includes("--apply");
  const env = Object.fromEntries(fs.readFileSync(".env.local", "utf8").split(/\r?\n/).filter((l) => l.includes("=") && !l.startsWith("#")).map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim().replace(/^"|"$/g, "")]));
  const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });

  // exceljs hangs under tsx, so a plain-JavaScript helper turns the sheet into a JSON grid.
  const json = execFileSync(process.execPath, [path.join(__dirname, "sheet-to-json.mjs"), file], { maxBuffer: 256 * 1024 * 1024 }).toString("utf8");
  const grid = (JSON.parse(json) as { rows: (string | number | boolean | null)[][] }).rows;
  const cells = (r: number) => grid[r - 1] ?? [];
  let headerRow = 0;
  for (let r = 1; r <= 60 && !headerRow; r++) if (cells(r).some((v) => v === "Customer") && cells(r).some((v) => v === "Amount")) headerRow = r;
  if (!headerRow) throw new Error("Header row (Customer, Amount, …) not found");
  const rows: (string | number | boolean | null)[][] = [];
  for (let r = headerRow + 1; r <= grid.length; r++) rows.push(cells(r));
  const parsed = parseSheet(cells(headerRow), rows);
  console.error(`${parsed.length} rows read (header on line ${headerRow})`);

  const { data: existing } = await db.from("sheet_proposals").select("id, row_key, link_status, amount, payments").limit(5000);
  const byKey = new Map(((existing ?? []) as { id: number; row_key: string; link_status: string; amount: number; payments: unknown }[]).map((r) => [r.row_key, r]));
  console.error("existing rows", (existing ?? []).length);
  const index = await loadProjectIndex(db);
  console.error("index", index.projects.length);
  const { data: mirror } = await db.from("portal_proposals").select("number, project_id, projects:project_id(title)").eq("link_status", "linked").not("project_id", "is", null);
  const mirrorLinks = new Map(((mirror ?? []) as unknown as { number: number; project_id: number; projects: { title: string | null } | null }[]).map((m) => [m.number, { project_id: m.project_id, title: m.projects?.title ?? null }]));

  let created = 0, updated = 0, unchanged = 0, autoLinkable = 0;
  const toLink: number[] = [];
  let i = 0;
  for (const row of parsed) {
    if (++i % 100 === 0) console.error("row", i);
    const prev = byKey.get(row.row_key);
    const suggestions = sheetSuggestions(row, index.projects, index.txByNumber, mirrorLinks);
    const values: SheetRow & { suggestions: unknown; imported_at: string } = { ...row, suggestions, imported_at: new Date().toISOString() };
    if (suggestions[0]?.score === 100 && row.main_number && mirrorLinks.has(row.main_number)) { autoLinkable++; if (!apply) console.error("auto", row.number, "->", mirrorLinks.get(row.main_number)?.title); }
    if (!prev) {
      created++;
      if (apply) {
        const { data, error } = await db.from("sheet_proposals").insert(values).select("id").single();
        if (error) throw new Error(`${row.number}: ${error.message}`);
        if (row.main_number && mirrorLinks.has(row.main_number)) toLink.push((data as { id: number }).id);
      }
    } else if (prev.link_status !== "new") unchanged++;
    else {
      const changed = Number(prev.amount) !== row.amount || JSON.stringify(prev.payments) !== JSON.stringify(row.payments);
      if (changed) updated++;
      else unchanged++;
      if (apply) {
        const { error } = await db.from("sheet_proposals").update(values).eq("id", prev.id);
        if (error) throw new Error(`${row.number}: ${error.message}`);
        if (row.main_number && mirrorLinks.has(row.main_number)) toLink.push(prev.id);
      }
    }
  }
  console.log({ created, updated, unchanged, autoLinkable, apply });
  if (!apply) return;
  let linked = 0;
  for (const id of toLink) {
    const { data } = await db.from("sheet_proposals").select("main_number").eq("id", id).maybeSingle();
    const m = (data as { main_number: number } | null)?.main_number;
    const target = m ? mirrorLinks.get(m) : undefined;
    if (!target) continue;
    const r = await linkSheetRow(db, id, target.project_id, { actor: null, auto: true });
    if (r.ok) linked++;
    else console.log(`row ${id}: ${r.message}`);
  }
  console.log(`${linked} rows linked by themselves (their Portal.io proposal is linked)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
