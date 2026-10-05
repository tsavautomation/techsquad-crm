import type { CurrentUser } from "@/lib/auth/session";
import { myEmployeeIds } from "@/lib/field-day/load";
import { recordsDb } from "@/lib/records/data";
import type { Scorecard } from "@/lib/reports/scorecard";
import { loadScorecards } from "@/lib/reports/scorecard-load";
import { getT } from "@/i18n/server";

// F19-e: the technician's scorecard on their Employee page (this week / this month / last month), for the
// people who see Staff Performance; never to the person themselves (P2-d).

export async function ScorecardPanel({ employeeId, user }: { employeeId: number; user: CurrentUser }) {
  if (!user.isSysadmin && !user.permissions.has("forms.staff-performance.view_all")) return null;
  const db = await recordsDb();
  if (!user.isSysadmin && (await myEmployeeIds(db, user)).includes(employeeId)) return null;
  const tr = await getT();
  const s = await loadScorecards(db, employeeId);
  if (!s.week.visits && !s.month.visits && !s.lastMonth.visits) return null;
  const pct = (n: number | null) => (n === null ? "—" : `${n} %`);
  const rows: { label: string; get: (c: Scorecard) => string }[] = [
    { label: tr("Visits owed a report"), get: (c) => String(c.visits) },
    { label: tr("On time"), get: (c) => `${c.onTime} (${pct(c.onTimePct)})` },
    { label: tr("Late"), get: (c) => String(c.late) },
    { label: tr("Missing"), get: (c) => String(c.missing) },
    { label: tr("Report completeness"), get: (c) => pct(c.completeness) },
    { label: tr("Callbacks (Partial / Not done)"), get: (c) => String(c.callbacks) },
    { label: tr("Reports with mismatches"), get: (c) => String(c.mismatches) },
  ];
  return (
    <section id="scorecard" className="mb-3.5 scroll-mt-20 rounded-2xl border bg-card px-[18px] py-4 shadow-card">
      <h2 className="mb-1 text-[15px] font-semibold tracking-tight">{tr("Scorecard")}</h2>
      <p className="mb-2 text-[13px] text-text-2">{tr("From the Visit = Report rule, the reviewed reports and the return cards. Open pending items from this person's reports: {n}.", { n: s.week.openPending })}</p>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs text-muted-foreground">
            <th className="py-1 font-medium" />
            <th className="py-1 text-right font-medium">{tr("This week")}</th>
            <th className="py-1 text-right font-medium">{tr("This month")}</th>
            <th className="py-1 text-right font-medium">{tr("Last month")}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.label} className="border-t">
              <td className="py-1.5 pr-2">{r.label}</td>
              <td className="py-1.5 text-right tabular-nums">{r.get(s.week)}</td>
              <td className="py-1.5 text-right tabular-nums">{r.get(s.month)}</td>
              <td className="py-1.5 text-right tabular-nums">{r.get(s.lastMonth)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
