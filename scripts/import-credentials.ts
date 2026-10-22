/**
 * F30: import the office's password spreadsheet (sheets "Distributors" and "Accounts": COMPANY, WEBSITE, LOGIN,
 * PASSWORD, PIN, NUMERO, FAX, ACCT #, CONTACT) into the credentials table, secrets encrypted with the CRM's key.
 * Rows whose Site / service already exists (same title, case-insensitive) are skipped, so the import can be run again.
 *
 *   npx tsx --conditions=react-server --env-file=.env.local scripts/import-credentials.ts <file.xlsx> [--apply]
 *
 * Without --apply it only prints what it would do. Secrets are never printed.
 */
import { createClient } from "@supabase/supabase-js";
import ExcelJS from "exceljs";
import { encrypt } from "../src/lib/crypto";

const file = process.argv[2];
const apply = process.argv.includes("--apply");
if (!file) {
  console.error("usage: import-credentials.ts <file.xlsx> [--apply]");
  process.exit(1);
}
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false } });

type Row = { title: string; category: string; url: string | null; username: string | null; password: string | null; pin: string | null; phone: string | null; fax: string | null; account_number: string | null; contact: string | null };

const text = (v: unknown): string | null => {
  if (v === null || v === undefined) return null;
  if (typeof v === "object") {
    const o = v as { text?: unknown; result?: unknown; richText?: { text: string }[]; hyperlink?: string };
    if (o.richText) return o.richText.map((r) => r.text).join("").trim() || null;
    if (o.text !== undefined) return text(o.text);
    if (o.result !== undefined) return text(o.result);
    if (o.hyperlink) return String(o.hyperlink).trim() || null;
    return null;
  }
  const s = String(v).trim();
  return s || null;
};

/** The Accounts sheet is mixed: a few names say what they are; the rest is "Software and services". */
function categoryFor(sheet: string, company: string): string {
  if (sheet.toLowerCase().startsWith("distrib")) return "Supplier";
  const n = company.toLowerCase();
  if (/apple|icloud|itunes/.test(n)) return "Apple ID";
  if (/amazon|ebay|walmart|best ?buy|home ?depot|lowe|b&h|crutchfield|monoprice|newegg|costco|staples|office ?depot/.test(n)) return "Shopping";
  if (/facebook|instagram|linkedin|youtube|twitter|tiktok|yelp|google my business/.test(n)) return "Social media";
  if (/fpl|florida power|comcast|xfinity|at&t|att\b|verizon|t-mobile|water|gas|electric|utility|toll|sunpass/.test(n)) return "Utilities";
  return "Software and services";
}

async function main() {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(file);
  const rows: Row[] = [];
  for (const ws of wb.worksheets) {
    const header = (ws.getRow(1).values as unknown[]).slice(1).map((h) => String(text(h) ?? "").toUpperCase());
    const col = (name: string) => header.findIndex((h) => h === name);
    const c = { company: col("COMPANY"), url: col("WEBSITE"), login: col("LOGIN"), password: col("PASSWORD"), pin: col("PIN"), phone: col("NUMERO"), fax: col("FAX"), acct: col("ACCT #"), contact: col("CONTACT") };
    if (c.company < 0) continue;
    ws.eachRow({ includeEmpty: false }, (row, n) => {
      if (n === 1) return;
      const v = (row.values as unknown[]).slice(1);
      const title = text(v[c.company]);
      if (!title) return;
      rows.push({
        title,
        category: categoryFor(ws.name, title),
        url: c.url >= 0 ? text(v[c.url]) : null,
        username: c.login >= 0 ? text(v[c.login]) : null,
        password: c.password >= 0 ? text(v[c.password]) : null,
        pin: c.pin >= 0 ? text(v[c.pin]) : null,
        phone: c.phone >= 0 ? text(v[c.phone]) : null,
        fax: c.fax >= 0 ? text(v[c.fax]) : null,
        account_number: c.acct >= 0 ? text(v[c.acct]) : null,
        contact: c.contact >= 0 ? text(v[c.contact]) : null,
      });
    });
  }
  const { data: existing } = await db.from("credentials").select("title").is("deleted_at", null);
  const have = new Set(((existing ?? []) as { title: string | null }[]).map((r) => (r.title ?? "").trim().toLowerCase()));
  const fresh = rows.filter((r) => !have.has(r.title.trim().toLowerCase()));
  const byCat = new Map<string, number>();
  for (const r of fresh) byCat.set(r.category, (byCat.get(r.category) ?? 0) + 1);
  console.log(`${rows.length} rows in the file, ${fresh.length} new, ${rows.length - fresh.length} already in the CRM`);
  console.log("by category:", Object.fromEntries(byCat));
  console.log("without password:", fresh.filter((r) => !r.password).map((r) => r.title).join(", ") || "none");
  if (!apply) return console.log("dry run: add --apply to write");
  let done = 0;
  for (const r of fresh) {
    const { error } = await db.from("credentials").insert({
      title: r.title,
      category: r.category,
      url: r.url && /^https?:\/\//i.test(r.url) ? r.url : r.url ? `https://${r.url}` : null,
      username: r.username,
      password: r.password ? encrypt(r.password) : null,
      pin: r.pin ? encrypt(r.pin) : null,
      phone: r.phone,
      fax: r.fax,
      account_number: r.account_number,
      contact: r.contact,
      notes: "Imported from the password spreadsheet (2026-10-22). Check the category.",
      status: "Active",
    });
    if (error) console.error(`${r.title}: ${error.message}`);
    else done++;
  }
  console.log(`written: ${done}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
