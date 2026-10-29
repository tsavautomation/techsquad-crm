import { NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { getSession } from "@/lib/auth/session";
import { canSeeCosting } from "@/lib/costing/load";
import { formatDate, todayET } from "@/lib/dates";
import { hours, periodCsv } from "@/lib/payroll/engine";
import { loadPayrollSettings, loadPeriod } from "@/lib/payroll/load";
import { isFrequency, periodFor } from "@/lib/payroll/periods";
import { recordsDb } from "@/lib/records/data";

/**
 * TC-g: a pay period as CSV or Excel (name, frequency, period, hours, PTO, rate, amount, adjustments, total,
 * shifts to review). A download to the person's device only: nothing is written to OneDrive or Storage, and
 * only the Job costing permission may ask for it (the same rule that protects pay rates).
 */
export async function GET(req: Request) {
  const s = await getSession();
  if (s.status !== "active") return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  if (!canSeeCosting(s.user)) return NextResponse.json({ error: "Not allowed." }, { status: 403 });
  const url = new URL(req.url);
  const frequency = url.searchParams.get("frequency");
  const startsOn = url.searchParams.get("period") ?? "";
  const format = url.searchParams.get("format") === "xlsx" ? "xlsx" : "csv";
  if (!isFrequency(frequency) || !/^\d{4}-\d{2}-\d{2}$/.test(startsOn)) return NextResponse.json({ error: "Pick a period." }, { status: 400 });
  const db = await recordsDb();
  const period = periodFor(frequency, startsOn, await loadPayrollSettings(db));
  const data = await loadPeriod(db, period);
  const label = `${formatDate(period.starts_on)} – ${formatDate(period.ends_on)}`;
  const rows = data.lines.map((l) => ({ name: l.person.title, frequency, period: label, line: l.line }));
  const base = `pay-period-${frequency.toLowerCase().replace(/[^a-z]/g, "")}-${period.starts_on}`;

  if (format === "csv") {
    return new NextResponse(periodCsv(rows), { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${base}.csv"`, "Cache-Control": "no-store" } });
  }
  const wb = new ExcelJS.Workbook();
  wb.creator = "TechSquad CRM";
  const ws = wb.addWorksheet("Pay period");
  ws.columns = [
    { header: "Name", key: "name", width: 28 },
    { header: "Pay frequency", key: "frequency", width: 14 },
    { header: "Period", key: "period", width: 24 },
    { header: "Hours", key: "hours", width: 10 },
    { header: "PTO hours", key: "pto", width: 10 },
    { header: "Rate", key: "rate", width: 18 },
    { header: "Amount", key: "amount", width: 12 },
    { header: "Adjustments", key: "adjustments", width: 12 },
    { header: "Total", key: "total", width: 12 },
    { header: "Needs review", key: "review", width: 12 },
  ];
  ws.getRow(1).font = { bold: true };
  for (const r of rows) ws.addRow({ name: r.name, frequency: r.frequency, period: r.period, hours: hours(r.line.minutes), pto: hours(r.line.ptoMinutes), rate: r.line.rateText, amount: r.line.amount, adjustments: r.line.adjustments, total: r.line.total, review: r.line.toReview });
  for (const key of ["amount", "adjustments", "total"]) ws.getColumn(key).numFmt = '"$"#,##0.00';
  ws.addRow({});
  ws.addRow({ name: `Totals (${data.lines.length} people)`, hours: hours(data.totals.minutes), pto: hours(data.totals.ptoMinutes), amount: data.totals.amount, adjustments: data.totals.adjustments, total: data.totals.total }).font = { bold: true };
  ws.addRow({ name: data.locked ? `Approved and locked on ${formatDate(data.locked.approved_at)}` : `Not approved yet (exported ${formatDate(todayET())})` });
  const buffer = await wb.xlsx.writeBuffer();
  return new NextResponse(new Uint8Array(buffer as ArrayBuffer), { headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": `attachment; filename="${base}.xlsx"`, "Cache-Control": "no-store" } });
}
