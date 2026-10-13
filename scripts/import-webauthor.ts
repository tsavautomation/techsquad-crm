/**
 * M14: load the WebAuthor grid exports (WA_*.csv, see memory "webauthor-export") into the CRM.
 *
 *   npx tsx --env-file=.env.local scripts/import-webauthor.ts --dir "C:/Users/Fred/Downloads"           # dry run
 *   npx tsx --env-file=.env.local scripts/import-webauthor.ts --dir "C:/Users/Fred/Downloads" --apply   # load
 *
 * Records keep their WebAuthor ids (our primary keys are plain bigints), so every link resolves.
 * Columns are matched to registry fields by label. Run scripts/sql/import-pre.sql before --apply
 * (it removes the test records and lets the import keep created/modified dates) and
 * scripts/sql/import-post.sql after it (triggers back on, sequences moved past the imported ids).
 */
import { createCipheriv, randomBytes } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { fromDateTimeLocalET, formatDate, formatDateTime } from "../src/lib/dates";
import { joinTitleParts } from "../src/lib/records/title-format";
import { getTable } from "../src/registry";
import type { FieldDef, TableDef } from "../src/registry/types";

const apply = process.argv.includes("--apply");
const dirArg = process.argv[process.argv.indexOf("--dir") + 1];
const DIR = process.argv.includes("--dir") && dirArg ? dirArg : "C:/Users/Fred/Downloads";
/** --only payouts,transactions: load just those lists (the others are left untouched, so later edits in the CRM survive). */
const onlyArg = process.argv[process.argv.indexOf("--only") + 1];
const ONLY = process.argv.includes("--only") && onlyArg ? new Set(onlyArg.split(",").map((s) => s.trim())) : null;
/** Exports without a "Record ID" column (Fred's own report exports): ids are given by row order from this base, so a re-run of the same file updates the same rows. */
const ROW_IDS: Record<string, number> = { payouts: 1000 };
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const secret = process.env.SUPABASE_SECRET_KEY;
if (!url || !secret) throw new Error("Run with --env-file=.env.local (NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SECRET_KEY)");
const db = createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });

// Load order respects the links between tables. Self-links and cycles are filled in afterwards.
const FILES: [table: string, file: string][] = [
  ["suppliers", "WA_Suppliers.csv"],
  ["brands", "WA_Brands.csv"],
  ["organizations", "WA_Organizations.csv"],
  ["buildings", "WA_Buildings.csv"],
  ["employees", "WA_Employees.csv"],
  ["contacts", "WA_Contacts.csv"],
  ["vehicles", "WA_Fleet.csv"],
  ["projects", "WA_Projects.csv"],
  ["permits", "WA_Permits.csv"],
  ["punch_list_items", "WA_PunchList.csv"],
  ["tasks", "WA_Tasks.csv"],
  ["rmas", "WA_RMA.csv"],
  ["products", "WA_Products.csv"],
  ["stock_items", "WA_Stock.csv"],
  ["inventory_checkouts", "WA_InventoryCheckout.csv"],
  ["job_reports", "WA_JobReports.csv"],
  ["tv_installations", "WA_TVInstallation.csv"],
  ["survey_proposals", "WA_SurveyProposals.csv"],
  ["form_notes", "WA_Notes.csv"],
  ["staff_performance", "WA_StaffPerformance.csv"],
  // Fred's own Payroll export (2026-10-02; no Record ID column, see ROW_IDS). Loaded with --only payouts.
  ["payouts", "Payouts.csv"],
  ["transactions", "WA_Transactions.csv"],
];
/** Links written in a second pass (the target table is loaded later, or it is the same table). */
const DEFERRED: Record<string, string[]> = { contacts: ["referred_by_contact_id"], projects: ["permit_id"] };
/** Workflows: the column that names the stage, and the stage date columns ("WF Date: <stage>"). */
const WORKFLOWS: Record<string, { workflow: string; field?: string; column?: string }> = {
  projects: { workflow: "project_proposal", field: "job_status" },
  punch_list_items: { workflow: "punch_list", column: "WF Level" },
  stock_items: { workflow: "stock_status", column: "WF Level" },
};
/** Logins ↔ Employee records (WebAuthor's employee emails differ from the CRM logins). */
const EMPLOYEE_EMAIL: Record<string, string> = { "Frederico Smiliansky": "fred@tsav.net", "Lucas Oliveira": "lucas@tsav.net", "Saulo da Silva": "saulo@tsav.net", "JESSICA VILLEGAS": "jessica@tsav.net", "Luana Freitas": "luana@tsav.net", "Roberto Pizini": "roberto@techsquadfl.com", "Ulisses Dias Filho": "uli@tsav.net" };
const SKIP_TYPES = new Set(["file", "image", "signature", "computed", "user", "group"]);

// ---------------------------------------------------------------- csv

function parseCsv(s: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let q = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) {
      if (c === '"') {
        if (s[i + 1] === '"') {
          cell += '"';
          i++;
        } else q = false;
      } else cell += c;
    } else if (c === '"') q = true;
    else if (c === ",") {
      row.push(cell);
      cell = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && s[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += c;
  }
  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((r) => r.length > 1);
}

/** WebAuthor doesn't quote header labels, so a label with a comma arrives as several header cells. */
function repairHeader(header: string[], t: TableDef): string[] {
  const out = [...header];
  for (const f of t.fields) {
    if (!f.label.includes(",")) continue;
    const parts = f.label.split(",");
    for (let i = 0; i + parts.length <= out.length; i++) {
      if (parts.every((p, k) => out[i + k].trim() === p.trim())) {
        out.splice(i, parts.length, f.label);
        break;
      }
    }
  }
  return out;
}

// ---------------------------------------------------------------- helpers

const ENC_PREFIX = "enc:v1:";
function encrypt(plain: string): string {
  const raw = process.env.ENCRYPTION_KEY;
  if (!raw) throw new Error("ENCRYPTION_KEY is not set");
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", Buffer.from(raw, "base64"), iv);
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return `${ENC_PREFIX}${iv.toString("base64")}:${cipher.getAuthTag().toString("base64")}:${data.toString("base64")}`;
}

const blank = (v: string | undefined) => v === undefined || v.trim() === "";
/** "2025-10-15 13:18:39.183" (Eastern) → ISO. */
const toIso = (v: string): string | null => {
  const m = v.trim().match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2})/);
  return m ? fromDateTimeLocalET(`${m[1]}T${m[2]}`) : null;
};
const toDate = (v: string) => v.trim().slice(0, 10);
const toBool = (v: string) => /^(1|yes|true)$/i.test(v.trim());
const toNum = (v: string) => {
  const n = Number(v.replace(/[$,\s]/g, ""));
  return Number.isFinite(n) ? n : null;
};
const ids = (v: string) => v.split("^").map((x) => Number(x.trim())).filter((n) => Number.isInteger(n) && n > 0);

type Row = Record<string, unknown>;
type Loaded = { t: TableDef; rows: Row[]; joins: { table: string; record_id: number; target_id: number }[]; states: { workflow: string; record_id: number; level: string; at: string | null }[]; deferred: Row[]; warnings: string[] };

const titles = new Map<string, Map<number, string>>(); // table → id → title
const titleOf = (table: string, id: number) => titles.get(table)?.get(id) ?? `#${id}`;

function title(t: TableDef, row: Row, csvTitle: string | undefined): string | null {
  if (!t.titleFormula) return csvTitle?.trim() || (row.title as string) || null;
  const fields = new Map(t.fields.map((f) => [f.name, f]));
  const parts = t.titleFormula.split(/(\{\w+\})/).map((piece) => {
    const m = piece.match(/^\{(\w+)\}$/);
    if (!m) return { text: piece, token: false };
    const name = m[1];
    if (name === "id") return { text: String(row.id), token: true };
    if (name === "date_created") return { text: row.created_at ? formatDate(String(row.created_at).slice(0, 10)) : "", token: true };
    const f = fields.get(name);
    const v = (row as Record<string, unknown>)[name] ?? (row as Record<string, unknown>)[`_join_${name}`];
    if (v === null || v === undefined || v === "" || (Array.isArray(v) && !v.length)) return { text: "", token: true };
    if (f?.type === "lookup" && f.lookup) return { text: (Array.isArray(v) ? v : [v]).map((x) => titleOf(f.lookup!.table, Number(x))).join(", "), token: true };
    if (f?.options) return { text: f.options.find((o) => o.value === v)?.label ?? String(v), token: true };
    if (f?.type === "date") return { text: formatDate(String(v)), token: true };
    if (f?.type === "datetime") return { text: formatDateTime(String(v)), token: true };
    return { text: String(v).split("\n")[0].slice(0, 60), token: true };
  });
  return joinTitleParts(parts) ?? csvTitle?.trim() ?? null;
}

// ---------------------------------------------------------------- one table

function load(table: string, file: string, profiles: Map<string, string>): Loaded | null {
  const t = getTable(table);
  const path = join(DIR, file);
  if (!existsSync(path)) {
    console.log(`\n## ${table}: ${file} not found, skipped`);
    return null;
  }
  const raw = parseCsv(readFileSync(path, "utf8"));
  const header = repairHeader(raw[0], t);
  const data = raw.slice(1);
  const warnings: string[] = [];
  const norm = (s: string) => s.replace(/\s+/g, " ").trim();
  const col = (label: string, nth = 0) => {
    let seen = 0;
    for (let i = 0; i < header.length; i++) if (norm(header[i]) === norm(label)) if (seen++ === nth) return i;
    return -1;
  };
  /** System columns: the last one of that name (grids also show a "Date Created" like "9 days ago (…)"). */
  const lastCol = (label: string) => {
    let found = -1;
    for (let i = 0; i < header.length; i++) if (norm(header[i]) === norm(label)) found = i;
    return found;
  };
  // Field → column index; duplicate labels are taken in registry order (the export follows the form order too).
  const labelCount = new Map<string, number>();
  const index = new Map<string, number>();
  const missing: string[] = [];
  for (const f of t.fields) {
    if (SKIP_TYPES.has(f.type) || f.name === "clock_group" || (f.legacy.fieldId === 0 && !header.some((h) => h.trim() === f.label))) continue;
    const nth = labelCount.get(f.label) ?? 0;
    labelCount.set(f.label, nth + 1);
    const i = f.type === "address" ? col(`${f.label}: Address Line 1`) : col(f.label, nth);
    if (i < 0) missing.push(`${f.name} (${f.label})`);
    else index.set(f.name, i);
  }
  const idCol = col("Record ID");
  if (idCol < 0 && ROW_IDS[table] === undefined) throw new Error(`${file}: no Record ID column`);
  const sys = { created: lastCol("Date Created"), modified: lastCol("Date Modified"), createdBy: lastCol("Created By (Name)"), modifiedBy: lastCol("Modified By (Name)"), locked: lastCol("Locked"), submitted: lastCol("Date Submitted"), title: lastCol("Title") };
  const used = new Set(header.filter((h, i) => [...index.values()].includes(i) || Object.values(sys).includes(i) || i === idCol));
  const addressLabels = new Set(t.fields.filter((f) => f.type === "address").map((f) => norm(f.label)));
  const ignored = header.filter((h) => !used.has(h) && !addressLabels.has(norm(h)) && !/^(WF Date|WF Level|WF Modified|Date Last Updated|Date Created|Date Modified|Title$|.*\(DRU\)$|Tags$|Created By$|Modified By$|Draft\?$|.*Hours to Today$|Organization\/Agency$|.*: Address Line 2$|.*: City$|.*: State$|.*: Zip\/Postal Code$|.*\(Summary\)$)/.test(h.trim()));
  console.log(`\n## ${table} ← ${file}: ${data.length} rows, ${index.size} fields matched${missing.length ? `, no column for: ${missing.join(", ")}` : ""}${ignored.length ? `, columns not loaded: ${ignored.join(" | ")}` : ""}`);

  const rows: Row[] = [];
  const joins: Loaded["joins"] = [];
  const states: Loaded["states"] = [];
  const deferred: Row[] = [];
  const wf = WORKFLOWS[table];
  const tmap = new Map<number, string>();
  titles.set(table, tmap);
  for (const [rowIndex, r] of data.entries()) {
    if (r.length !== header.length) warnings.push(`row with ${r.length} cells (header ${header.length}), id ${r[idCol] ?? "?"}`);
    const id = idCol >= 0 ? Number(r[idCol]) : ROW_IDS[table] + rowIndex;
    if (!Number.isInteger(id)) {
      warnings.push(`row without a numeric Record ID: ${r.slice(0, 3).join(" | ")}`);
      continue;
    }
    const row: Row = { id };
    const later: Row = { id };
    for (const f of t.fields) {
      const i = index.get(f.name);
      if (i === undefined) continue;
      if (f.type === "address") {
        const g = (suffix: string) => {
          const k = col(`${f.label}: ${suffix}`);
          return k >= 0 ? (r[k] ?? "").trim() : "";
        };
        const a = { street: g("Address Line 1"), address_2: g("Address Line 2"), city: g("City"), state: g("State"), zip: g("Zip/Postal Code") };
        row[f.name] = Object.values(a).some(Boolean) ? Object.fromEntries(Object.entries(a).filter(([, v]) => v)) : null;
        continue;
      }
      const v = r[i] ?? "";
      if (blank(v)) {
        if (f.type === "boolean") row[f.name] = false;
        else if (f.type === "checkboxes") row[f.name] = [];
        else if (f.type !== "lookup" || !f.multiple) row[f.name] = null;
        continue;
      }
      switch (f.type) {
        case "lookup": {
          const list = ids(v);
          if (f.multiple) {
            row[`_join_${f.name}`] = list;
            for (const target of list) joins.push({ table: `${table}_${f.name.replace(/_ids$/, "")}`, record_id: id, target_id: target });
          } else if (!list.length) warnings.push(`#${id} ${f.label}: "${v}" is not an id, left empty`);
          else if (DEFERRED[table]?.includes(f.name)) later[f.name] = list[0];
          else row[f.name] = list[0];
          break;
        }
        case "checkboxes":
          row[f.name] = v.split("^").map((x) => x.trim()).filter(Boolean);
          break;
        case "boolean":
          row[f.name] = toBool(v);
          break;
        case "date":
          row[f.name] = toDate(v);
          break;
        case "datetime":
          row[f.name] = toIso(v);
          break;
        case "money":
        case "number":
          row[f.name] = toNum(v);
          break;
        case "select":
        case "radio":
          if (f.options && !f.options.some((o) => o.value === v.trim())) warnings.push(`#${id} ${f.label}: "${v.trim()}" is not one of the options (kept)`);
          row[f.name] = v.trim();
          break;
        default:
          row[f.name] = f.sensitive ? encrypt(v) : v;
      }
    }
    if (table === "employees") {
      const full = `${row.first_name ?? ""} ${row.last_name ?? ""}`.trim();
      const login = EMPLOYEE_EMAIL[full] ?? EMPLOYEE_EMAIL[Object.keys(EMPLOYEE_EMAIL).find((k) => k.toLowerCase() === full.toLowerCase()) ?? ""];
      if (login) row.email = login;
    }
    const created = sys.created >= 0 ? toIso(r[sys.created] ?? "") : null;
    const modified = sys.modified >= 0 ? toIso(r[sys.modified] ?? "") : null;
    if (created) row.created_at = created;
    if (modified ?? created) row.updated_at = modified ?? created;
    if (sys.createdBy >= 0) row.created_by = profiles.get((r[sys.createdBy] ?? "").trim().toLowerCase()) ?? null;
    if (sys.modifiedBy >= 0) row.updated_by = profiles.get((r[sys.modifiedBy] ?? "").trim().toLowerCase()) ?? null;
    if (sys.locked >= 0 && t.fields.some(() => true) && ["projects", "punch_list_items", "stock_items", "job_reports"].includes(table)) {
      row.locked = toBool(r[sys.locked] ?? "");
      const submitted = sys.submitted >= 0 ? toIso(r[sys.submitted] ?? "") : null;
      if (submitted) row.submitted_at = submitted;
    }
    row.title = title(t, row, sys.title >= 0 ? r[sys.title] : undefined);
    tmap.set(id, (row.title as string) ?? `#${id}`);
    if (wf) {
      const stage = wf.column ? ((r[lastCol(wf.column)] ?? "").trim() || null) : ((row[wf.field!] as string | null) ?? null);
      if (stage) {
        const k = col(`WF Date: ${stage}`);
        states.push({ workflow: wf.workflow, record_id: id, level: stage, at: (k >= 0 ? toIso(r[k] ?? "") : null) ?? (row.created_at as string | null) ?? null });
      }
    }
    for (const key of Object.keys(row)) if (key.startsWith("_join_")) delete row[key];
    rows.push(row);
    if (Object.keys(later).length > 1) deferred.push(later);
  }
  return { t, rows, joins, states, deferred, warnings };
}

// ---------------------------------------------------------------- main

async function main() {
  const { data: prof, error } = await db.from("profiles").select("id, first_name, last_name, email");
  if (error) throw error;
  const profiles = new Map<string, string>();
  for (const p of prof ?? []) {
    profiles.set(`${p.first_name ?? ""} ${p.last_name ?? ""}`.trim().toLowerCase(), p.id);
    if (p.email === "fred@tsav.net") profiles.set("frederico smiliansky", p.id);
  }
  const { data: lv } = await db.from("workflow_levels").select("id, workflow_id, title");
  const levelId = new Map(((lv ?? []) as { id: number; workflow_id: string; title: string }[]).map((l) => [`${l.workflow_id}:${l.title}`, l.id]));

  const toLoad = FILES.filter(([table]) => !ONLY || ONLY.has(table));
  // Titles of lookup targets that are not in this run (e.g. employees on a payroll-only run) come from the CRM, so the titles built here name people, not numbers.
  for (const [table] of toLoad) {
    for (const f of getTable(table).fields) {
      if (f.type !== "lookup" || !f.lookup || titles.has(f.lookup.table) || toLoad.some(([x]) => x === f.lookup!.table)) continue;
      const { data: rows } = await db.from(f.lookup.table).select("id, title");
      titles.set(f.lookup.table, new Map(((rows ?? []) as { id: number; title: string | null }[]).map((r) => [r.id, r.title ?? `#${r.id}`])));
    }
  }
  const loaded: Loaded[] = [];
  for (const [table, file] of toLoad) {
    const l = load(table, file, profiles);
    if (l) loaded.push(l);
  }

  // Links that point at records missing from the export are blanked (and reported).
  const known = new Map(loaded.map((l) => [l.t.name, new Set(l.rows.map((r) => r.id as number))]));
  for (const l of loaded) {
    for (const f of l.t.fields) {
      if (f.type !== "lookup" || f.multiple || !f.lookup || !known.has(f.lookup.table)) continue;
      for (const row of [...l.rows, ...l.deferred]) {
        const v = row[f.name];
        if (typeof v === "number" && !known.get(f.lookup.table)!.has(v)) {
          l.warnings.push(`#${row.id} ${f.label}: ${f.lookup.table} #${v} is not in the export, left empty`);
          row[f.name] = null;
        }
      }
    }
    l.joins = l.joins.filter((j) => {
      const target = l.t.fields.find((f) => `${l.t.name}_${f.name.replace(/_ids$/, "")}` === j.table)?.lookup?.table;
      const ok = !target || !known.has(target) || known.get(target)!.has(j.target_id);
      if (!ok) l.warnings.push(`#${j.record_id} ${j.table}: ${target} #${j.target_id} is not in the export, dropped`);
      return ok;
    });
  }

  for (const l of loaded) {
    const w = l.warnings;
    console.log(`${l.t.name}: ${l.rows.length} records, ${l.joins.length} links, ${l.states.length} workflow stages, ${l.deferred.length} deferred links${w.length ? `, ${w.length} warnings` : ""}`);
    for (const x of w.slice(0, 12)) console.log(`   ! ${x}`);
    if (w.length > 12) console.log(`   ! … ${w.length - 12} more`);
  }
  if (!apply) {
    console.log("\nDry run only — nothing written. Re-run with --apply to load.");
    return;
  }

  for (const l of loaded) {
    for (let i = 0; i < l.rows.length; i += 200) {
      const { error } = await db.from(l.t.name).upsert(l.rows.slice(i, i + 200), { onConflict: "id" });
      if (error) throw new Error(`${l.t.name} rows ${i}–${i + 200}: ${error.message}`);
    }
    for (const j of l.joins) {
      const { error } = await db.from(j.table).upsert({ record_id: j.record_id, target_id: j.target_id }, { ignoreDuplicates: true });
      if (error) throw new Error(`${j.table}: ${error.message}`);
    }
    if (l.states.length) {
      const rows = l.states.map((s) => ({ table_name: l.t.name, record_id: s.record_id, workflow_id: s.workflow, level_id: levelId.get(`${s.workflow}:${s.level}`), entered_at: s.at ?? new Date().toISOString() })).filter((s) => s.level_id);
      const { error } = await db.from("record_workflow_state").upsert(rows, { onConflict: "table_name,record_id" });
      if (error) throw new Error(`workflow state ${l.t.name}: ${error.message}`);
      const unknown = l.states.filter((s) => !levelId.has(`${s.workflow}:${s.level}`));
      if (unknown.length) console.log(`   ! ${l.t.name}: ${unknown.length} records with a stage that isn't a workflow level: ${[...new Set(unknown.map((u) => u.level))].join(", ")}`);
    }
    console.log(`✓ ${l.t.name}: ${l.rows.length} loaded`);
  }
  for (const l of loaded) {
    for (const row of l.deferred) {
      const { id, ...patch } = row;
      const { error } = await db.from(l.t.name).update(patch).eq("id", id);
      if (error) throw new Error(`${l.t.name} #${id} deferred links: ${error.message}`);
    }
    if (l.deferred.length) console.log(`✓ ${l.t.name}: ${l.deferred.length} deferred links written`);
  }
  console.log("\nDone. Now run scripts/sql/import-post.sql (triggers back on, sequences).");
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
