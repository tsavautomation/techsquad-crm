import { NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { getSession } from "@/lib/auth/session";
import { canSeeCosting } from "@/lib/costing/load";
import { formatDate, todayET } from "@/lib/dates";
import { hours, periodCsv } from "@/lib/payroll/engine";
import { loadOverrides, loadPeriod, loadSchedule } from "@/lib/payroll/load";
import { periodFor } from "@/lib/payroll/periods";
import { recordsDb } from "@/lib/records/data";

/**
 * TC-g: a pay period as CSV or Excel (name, frequency, period, hours, regular / overtime, PTO, rate, overtime rate,
 * trip premium, amount, adjustments, total, shifts to review). A download to the person's device only: nothing is written to OneDrive or Storage, and
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
  const rows = data.lines.map((l) => ({ name: l.person.title, frequency: schedule.name, period: label, line: l.line, timesheet: l.approval.required ? (l.approval.status === "Approved" ? "Approved" : "Not approved") : "Not required", approvedBy: l.approval.approver ?? "" }));
  const base = `pay-period-${schedule.name.toLowerCase().replace(/[^a-z0-9]/g, "")}-${period.starts_on}`;

  if (format === "csv") {
    return new NextResponse(periodCsv(rows), { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${base}.csv"`, "Cache-Control": "no-store" } });
  }
  const wb = new ExcelJS.Workbook();
  wb.creator = "TechSquad CRM";
  const ws = wb.addWorksheet("Pay period");
  ws.columns = [
    { header: "Name", key: "name", width: 28 },
    { header: "Pay schedule", key: "frequency", width: 16 },
    { header: "Period", key: "period", width: 24 },
    { header: "Hours", key: "hours", width: 10 },
    { header: "Regular hours", key: "regular", width: 12 },
    { header: "Overtime hours", key: "overtime", width: 12 },
    { header: "PTO hours", key: "pto", width: 10 },
    { header: "Rate", key: "rate", width: 18 },
    { header: "Overtime rate", key: "overtimeRate", width: 18 },
    { header: "Trip premium", key: "premium", width: 12 },
    { header: "Amount", key: "amount", width: 12 },
    { header: "Adjustments", key: "adjustments", width: 12 },
    { header: "Total", key: "total", width: 12 },
    { header: "Needs review", key: "review", width: 12 },
    { header: "Timesheet", key: "timesheet", width: 14 },
    { header: "Approved by", key: "approvedBy", width: 20 },
  ];
  ws.getRow(1).font = { bold: true };
  for (const r of rows) ws.addRow({ name: r.name, frequency: r.frequency, period: r.period, hours: hours(r.line.minutes), regular: hours(r.line.regularMinutes), overtime: hours(r.line.overtimeMinutes), pto: hours(r.line.ptoMinutes), rate: r.line.rateText, overtimeRate: r.line.missingOvertimeRateDays.length ? `${r.line.overtimeRateText} (no overtime rate)` : r.line.overtimeRateText, premium: r.line.premiumAmount, amount: r.line.amount, adjustments: r.line.adjustments, total: r.line.total, review: r.line.toReview, timesheet: r.timesheet, approvedBy: r.approvedBy });
  for (const key of ["premium", "amount", "adjustments", "total"]) ws.getColumn(key).numFmt = '"$"#,##0.00';
  ws.addRow({});
  ws.addRow({ name: `Totals (${data.lines.length} people)`, hours: hours(data.totals.minutes), regular: hours(data.totals.regularMinutes), overtime: hours(data.totals.overtimeMinutes), pto: hours(data.totals.ptoMinutes), premium: data.totals.premiumAmount, amount: data.totals.amount, adjustments: data.totals.adjustments, total: data.totals.total }).font = { bold: true };
  ws.addRow({ name: data.locked ? `Approved and locked on ${formatDate(data.locked.approved_at)}` : `Not approved yet (exported ${formatDate(todayET())})` });
  const buffer = await wb.xlsx.writeBuffer();
  return new NextResponse(new Uint8Array(buffer as ArrayBuffer), { headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": `attachment; filename="${base}.xlsx"`, "Cache-Control": "no-store" } });
}
