// FIN-m helper: the first worksheet of an .xlsx as a JSON grid on stdout ({ rows: [[cell, …], …] }); dates become
// "yyyy-mm-dd", formulas their result. Kept in plain JavaScript because exceljs hangs under tsx (seen 2026-10-28).
import ExcelJS from "exceljs";
const [file] = process.argv.slice(2);
if (!file) {
  console.error("Give the .xlsx path");
  process.exit(1);
}
const wb = new ExcelJS.Workbook();
await wb.xlsx.readFile(file);
const ws = wb.worksheets[0];
const val = (c) => {
  const v = c.value;
  if (v === null || v === undefined) return null;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "object") {
    if ("result" in v) return v.result instanceof Date ? v.result.toISOString().slice(0, 10) : (v.result ?? null);
    if (v.richText) return v.richText.map((t) => t.text).join("");
    if (typeof v.text === "string") return v.text;
    return null;
  }
  return v;
};
const cols = ws.actualColumnCount; // the sheet claims 90 columns; walking the empty ones past 62 never finished (2026-10-28)
const rows = [];
for (let r = 1; r <= ws.rowCount; r++) {
  const row = ws.getRow(r);
  const out = [];
  for (let c = 1; c <= cols; c++) out.push(val(row.getCell(c)));
  rows.push(out);
}
const out = JSON.stringify({ rows });
process.stdout.write(out);
