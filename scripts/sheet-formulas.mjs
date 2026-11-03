// FIN Prompt 2 item 3: the payment cells of Luana's sheet that hold several values ("=10000+58654.2") become one
// payment per value. exceljs gives the formula text; this prints { rows: [{ r, number, title, customer, cells: [{ col, header, formula, result, parts }] }] }.
//   node scripts/sheet-formulas.mjs "Sales Projections_Dashboard Updated 10-27-26.xlsx"
import ExcelJS from "exceljs";
const [file] = process.argv.slice(2);
if (!file) {
  console.error("Give the .xlsx path");
  process.exit(1);
}
const wb = new ExcelJS.Workbook();
await wb.xlsx.readFile(file);
const ws = wb.worksheets[0];
const cols = ws.actualColumnCount;
const text = (v) => (v === null || v === undefined ? null : v instanceof Date ? v.toISOString().slice(0, 10) : typeof v === "object" ? ("result" in v ? (v.result instanceof Date ? v.result.toISOString().slice(0, 10) : v.result) : v.richText ? v.richText.map((t) => t.text).join("") : (v.text ?? null)) : v);
let headerRow = 0;
for (let r = 1; r <= 60 && !headerRow; r++) {
  const vals = [];
  for (let c = 1; c <= cols; c++) vals.push(text(ws.getRow(r).getCell(c).value));
  if (vals.includes("Customer") && vals.includes("Amount")) headerRow = r;
}
const header = [];
for (let c = 1; c <= cols; c++) header.push(text(ws.getRow(headerRow).getCell(c).value));
const col = (name) => header.findIndex((h) => String(h ?? "").toLowerCase() === name.toLowerCase());
const cNumber = col("Invoice"), cTitle = col("Project"), cCustomer = col("Customer"), cAmount = col("Amount"), cDiscount = col("Discount");
const out = [];
for (let r = headerRow + 1; r <= ws.rowCount; r++) {
  const row = ws.getRow(r);
  const cells = [];
  for (let c = cAmount + 2; c <= (cDiscount > 0 ? cDiscount : cols); c++) {
    const v = row.getCell(c).value;
    if (v && typeof v === "object" && typeof v.formula === "string" && /[+]/.test(v.formula)) {
      const parts = v.formula.replace(/^=/, "").split("+").map((s) => Number(s.trim())).filter((n) => Number.isFinite(n));
      cells.push({ col: c, header: header[c - 1], formula: v.formula, result: v.result ?? null, parts });
    }
  }
  if (cells.length) out.push({ r, number: text(row.getCell(cNumber + 1).value), title: text(row.getCell(cTitle + 1).value), customer: text(row.getCell(cCustomer + 1).value), cells });
}
process.stdout.write(JSON.stringify({ headerRow, rows: out }));
