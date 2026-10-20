/**
 * Read the old "DROPBOX OLD INVOICES / TECH SQUAD" OneDrive folder (OFFICE › Melissa TS; one folder per
 * client, with the proposals and invoices from before Portal.io) and pull out of each document the
 * client name, job address, e-mail and phone, for the Report archive decisions sheet (F16-d).
 *
 *   npx tsx --conditions=react-server --env-file=.env.local scripts/list-old-invoices.ts <sharing link> [--fresh]
 *
 * Writes docs/old-invoices.json (git-ignored: client data). Resumable: folders already done are
 * skipped. Reads OneDrive only. PDFs are read with unpdf, .docx by unzipping, .xlsx with exceljs.
 */
import ExcelJS from "exceljs";
import { unzipSync } from "fflate";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { extractText, getDocumentProxy } from "unpdf";
import { downloadShared, listShared, type DriveChild } from "@/lib/files/onedrive";

const OUT = "docs/old-invoices.json";
const URL = process.argv[2];
const fresh = process.argv.includes("--fresh");
const MAX_DOCS = 6; // documents read per client folder
const MAX_BYTES = 8 * 1024 * 1024;
export type OldDoc = { name: string; client: string; clientAddress: string; project: string; addresses: string[]; emails: string[]; phones: string[]; billTo: string[]; head: string; text: string };
export type OldFolder = { folder: string; files: string[]; docs: OldDoc[]; error?: string };

const DOC = /\.(pdf|docx|xlsx)$/i;
const prefer = (n: string) => (/proposal|estimate|quote|contract/i.test(n) ? 0 : /invoice/i.test(n) ? 1 : 2);

async function textOf(name: string, bytes: Buffer): Promise<string> {
  if (/\.pdf$/i.test(name)) {
    const pdf = await getDocumentProxy(new Uint8Array(bytes));
    const { text } = await extractText(pdf, { mergePages: true });
    return text;
  }
  if (/\.docx$/i.test(name)) {
    const files = unzipSync(new Uint8Array(bytes));
    const xml = Buffer.from(files["word/document.xml"] ?? new Uint8Array()).toString("utf8");
    return xml.replace(/<\/w:p>/g, "\n").replace(/<[^>]+>/g, "").replace(/&amp;/g, "&");
  }
  if (/\.xlsx$/i.test(name)) {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(bytes as unknown as ArrayBuffer);
    const lines: string[] = [];
    for (const ws of wb.worksheets) ws.eachRow((r) => lines.push((r.values as unknown[]).slice(1).map((v) => (v == null ? "" : typeof v === "object" ? String((v as { result?: unknown; text?: unknown }).result ?? (v as { text?: unknown }).text ?? "") : String(v))).filter(Boolean).join(" ")));
    return lines.join("\n");
  }
  return "";
}

const STREET = /\b(ave|avenue|st|street|dr|drive|rd|road|blvd|boulevard|ct|court|ln|lane|way|ter|terrace|pl|place|cir|circle|hwy|highway|isle|island|pkwy|parkway|trail|tr|path|key|point|pointe|cove|run)\b\.?/i;
function parse(text: string) {
  const lines = text.split(/\r?\n/).map((l) => l.replace(/\s+/g, " ").trim()).filter(Boolean);
  const addresses = new Set<string>();
  const emails = new Set<string>();
  const phones = new Set<string>();
  const billTo = new Set<string>();
  for (const [i, l] of lines.entries()) {
    for (const m of l.matchAll(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g)) emails.add(m[0]);
    for (const m of l.matchAll(/\(?\b\d{3}\)?[ .-]?\d{3}[ .-]\d{4}\b/g)) phones.add(m[0]);
    // "City, FL 33139" closes an address; the street is on the same line or the one before.
    const city = l.match(/^(.*?)([A-Za-z .']+,?\s*(?:FL|Florida)\.?\s*\d{5}(?:-\d{4})?)\b/i);
    if (city) {
      const before = city[1].trim();
      const street = /^\d{1,6}\s/.test(before) ? before : /^\d{1,6}\s/.test(lines[i - 1] ?? "") && STREET.test(lines[i - 1]) ? lines[i - 1] : "";
      addresses.add(((street ? street + ", " : "") + city[2]).replace(/\s+,/g, ","));
    } else if (/^\d{1,6}\s+[A-Za-z0-9#. '-]+$/.test(l) && STREET.test(l) && !/\d{5}$/.test(l) && /^[A-Za-z .']+,?\s*(FL|Florida)/i.test(lines[i + 1] ?? "")) addresses.add(l + ", " + lines[i + 1]);
    if (/^(bill to|ship to|customer|client|sold to|job|name|attn|attention|prepared for|to):?$/i.test(l) || /^(bill to|ship to|customer|client|sold to|prepared for|attn):\s*\S/i.test(l)) {
      const same = l.replace(/^[^:]*:\s*/, "").trim();
      const next = lines[i + 1] ?? "";
      const v = /^(bill to|ship to|customer|client|sold to|job|name|attn|attention|prepared for|to):?$/i.test(l) ? next : same;
      if (v && v.length < 80 && !/^\d/.test(v)) billTo.add(v);
    }
  }
  // QuickBooks estimate / invoice layout: "Name / Address" (or "Bill To") block = client name + address,
  // then "Project Name" / "Project" block = the job, until Tech Squad's own address or the totals.
  const STOP = /^(project name|project|total|date|estimate|invoice|tech squad llc|20374 vera cruz|boca raton, fl 33498|33498|p\.o\. no\.|terms|due date|ship to|description|qty|item)/i;
  const block = (header: RegExp) => {
    const at = lines.findIndex((l) => header.test(l));
    if (at < 0) return [];
    const out: string[] = [];
    for (const l of lines.slice(at + 1, at + 8)) { if (STOP.test(l)) break; out.push(l); }
    return out;
  };
  const who = block(/^(name \/ address|bill to|sold to|customer)$/i);
  const project = block(/^project( name)?$/i);
  const own = (s: string) => /20374 vera cruz|33498/i.test(s);
  return {
    client: who[0] ?? "",
    clientAddress: who.slice(1).filter((l) => !own(l)).join(", "),
    project: project.filter((l) => !own(l)).join(", "),
    addresses: [...addresses].filter((a) => !own(a)).slice(0, 8),
    emails: [...emails].slice(0, 6),
    phones: [...phones].slice(0, 6),
    billTo: [...billTo].slice(0, 6),
    head: lines.slice(0, 12).join(" | ").slice(0, 600),
    text: lines.join("\n").slice(0, 2500),
  };
}

async function main() {
  if (!URL) throw new Error("pass the OneDrive sharing link");
  const have: Record<string, OldFolder> = !fresh && existsSync(OUT) ? JSON.parse(readFileSync(OUT, "utf8")) : {};
  const top = (await listShared(URL)).filter((c) => c.folder && !/^#|^quickbooks|brochures|^logo$|^coi$|^cameras$|^crestron$|^applications$/i.test(c.name));
  const todo = top.filter((t) => !have[t.name]);
  console.log(`${top.length} client folders, ${todo.length} to read`);
  let i = 0, n = 0;
  const worker = async () => {
    while (i < todo.length) {
      const t = todo[i++];
      const rec: OldFolder = { folder: t.name, files: [], docs: [] };
      try {
        const kids = await listShared(URL, t.name);
        const files: { path: string; item: DriveChild }[] = kids.filter((k) => k.file).map((k) => ({ path: `${t.name}/${k.name}`, item: k }));
        for (const d of kids.filter((k) => k.folder).slice(0, 10)) {
          const sub = await listShared(URL, `${t.name}/${d.name}`).catch(() => [] as DriveChild[]);
          files.push(...sub.filter((k) => k.file).map((k) => ({ path: `${t.name}/${d.name}/${k.name}`, item: k })));
        }
        rec.files = files.map((f) => f.path.slice(t.name.length + 1));
        const docs = files.filter((f) => DOC.test(f.item.name) && (f.item.size ?? 0) <= MAX_BYTES).sort((a, b) => prefer(a.item.name) - prefer(b.item.name) || (b.item.lastModifiedDateTime ?? "").localeCompare(a.item.lastModifiedDateTime ?? "")).slice(0, MAX_DOCS);
        for (const d of docs) {
          try {
            const text = await textOf(d.item.name, await downloadShared(URL, d.path));
            rec.docs.push({ name: d.path.slice(t.name.length + 1), ...parse(text) });
          } catch (e) {
            rec.docs.push({ name: d.path.slice(t.name.length + 1), client: "", clientAddress: "", project: "", addresses: [], emails: [], phones: [], billTo: [], head: "ERR " + (e as Error).message.slice(0, 120), text: "" });
          }
        }
      } catch (e) {
        rec.error = (e as Error).message;
      }
      have[t.name] = rec;
      if (++n % 10 === 0) { writeFileSync(OUT, JSON.stringify(have, null, 1)); console.log(`${n}/${todo.length}`); }
    }
  };
  await Promise.all([worker(), worker(), worker()]);
  writeFileSync(OUT, JSON.stringify(have, null, 1));
  const all = Object.values(have);
  console.log(`-> ${OUT}: ${all.length} folders, ${all.filter((f) => f.docs.some((d) => d.addresses.length)).length} with an address, ${all.filter((f) => f.error).length} errors`);
}
main().catch((e) => { console.error(e); process.exit(1); });
