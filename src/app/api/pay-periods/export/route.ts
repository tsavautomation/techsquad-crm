import { NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { getSession } from "@/lib/auth/session";
import { canSeeCosting } from "@/lib/costing/load";
import { formatDate, todayET } from "@/lib/dates";
import { CSV_HEAD, exportCells, hours, periodCsv, type ExportRow } from "@/lib/payroll/engine";
import { loadOverrides, loadPeriod, loadSchedule } from "@/lib/payroll/load";
import { periodFor } from "@/lib/payroll/periods";
import { recordsDb } from "@/lib/records/data";

/**
 * TC-g / PC-a: a pay period as CSV or Excel: regular hours, overtime approved / refused, time off paid / unpaid,
 * absences without a request (count and dates), the bank at the period's end, trip days and premium (on regular and
 * on overtime), rates, amount, adjustments, total, shifts to review, the timesheet approval. A download to the person's device only: nothing is written to OneDrive or Storage, and
 * only the Job costing permission may ask for it (the same rule that protects pay rates).
 */
export async function GET(req: Request) {
  const s = await getSession();
  if (s.status !== "active") return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  if (!canSeeCosting(s.user)) return NextResponse.json({ error: "Not allowed." }, { status: 403 });
  const url = new URL(req.url);
  const scheduleId = Number(url.searchParams.get("schedule"));
  const startsOn = url.searchParams.get("period") ?? "";
  const format = url.searchParams.get("format") === "xlsx" ? "xlsx" : "csv";
  if (!Number.isInteger(scheduleId) || !/^\d{4}-\d{2}-\d{2}$/.test(startsOn)) return NextResponse.json({ error: "Pick a period." }, { status: 400 });
  const db = await recordsDb();
  // PS-a: the period comes from the pay schedule (group) and its moved pay days.
  const schedule = await loadSchedule(db, scheduleId);
  if (!schedule) return NextResponse.json({ error: "Pick a period." }, { status: 400 });
  const period = periodFor(schedule, startsOn, await loadOverrides(db, scheduleId));
  const data = await loadPeriod(db, period);
  const label = `${formatDate(period.starts_on)} – ${formatDate(period.ends_on)}`;
  // TS-c: the person's timesheet approval for the period (Approved / Not approved / Not required) and who approved it.
  // PC-a: the closing summary columns (engine CSV_HEAD) are the same in the CSV and in the Excel sheet.
  const rows: ExportRow[] = data.lines.map((l) => ({ name: l.person.title, frequency: schedule.name, period: label, line: l.line, off: l.off, timesheet: l.approval.required ? (l.approval.status === "Approved" ? "Approved" : "Not approved") : "Not required", approvedBy: l.approval.approver ?? "" }));
  const base = `pay-period-${schedule.name.toLowerCase().replace(/[^a-z0-9]/g, "")}-${period.starts_on}`;

  if (format === "csv") {
    return new NextResponse(periodCsv(rows), { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${base}.csv"`, "Cache-Control": "no-store" } });
  }
  const wb = new ExcelJS.Workbook();
  wb.creator = "TechSquad CRM";
  const ws = wb.addWorksheet("Pay period");
  ws.columns = CSV_HEAD.map((header, i) => ({ header, key: `c${i}`, width: i === 0 ? 28 : i === 2 ? 24 : Math.max(12, Math.min(26, header.length + 2)) }));
  ws.getRow(1).font = { bold: true };
  for (const row of rows) ws.addRow(exportCells(row));
  const money = ["Trip premium on regular", "Trip premium on overtime", "Amount", "Adjustments", "Total"];
  for (const name of money) ws.getColumn(CSV_HEAD.indexOf(name) + 1).numFmt = '"$"#,##0.00';
  ws.addRow([]);
  const totals: (string | number)[] = CSV_HEAD.map(() => "");
  const put = (name: string, v: string | number | null) => (totals[CSV_HEAD.indexOf(name)] = v ?? "");
  put("Name", `Totals (${data.lines.length} people)`);
  put("Regular hours", hours(data.totals.regularMinutes));
  put("Overtime approved", hours(data.totals.overtimeMinutes));
  put("Overtime refused ($0)", hours(data.totals.refusedMinutes));
  put("Time off paid (h)", hours(data.totals.ptoMinutes));
  put("Time off unpaid (h)", hours(data.totals.unpaidOffMinutes));
  put("Absences without request", data.totals.absences);
  put("Trip days", data.totals.tripDays);
  put("Trip premium on regular", data.totals.premiumRegular);
  put("Trip premium on overtime", data.totals.premiumOvertime);
  put("Amount", data.totals.amount);
  put("Adjustments", data.totals.adjustments);
  put("Total", data.totals.total);
  ws.addRow(totals).font = { bold: true };
  ws.addRow([data.locked ? `Approved and locked on ${formatDate(data.locked.approved_at)}` : `Not approved yet (exported ${formatDate(todayET())})`]);
  const buffer = await wb.xlsx.writeBuffer();
  return new NextResponse(new Uint8Array(buffer as ArrayBuffer), { headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": `attachment; filename="${base}.xlsx"`, "Cache-Control": "no-store" } });
}
