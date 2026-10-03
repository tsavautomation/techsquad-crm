import type { CurrentUser } from "@/lib/auth/session";
import { canSeeCosting, loadPayRates } from "@/lib/costing/load";
import { formatDate, todayET } from "@/lib/dates";
import { recordsDb } from "@/lib/records/data";
import { getT } from "@/i18n/server";
import { PayRateForm } from "./pay-rate-form";

// F13-a: the Pay rate panel on an Employee page, for people with the job costing key. A new row each
// time the rate changes; job costing uses the rate in force on each visit's day.

const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

export async function PayRatePanel({ employeeId, user }: { employeeId: number; user: CurrentUser }) {
  if (!canSeeCosting(user)) return null;
  const tr = await getT();
  const db = await recordsDb();
  const rates = await loadPayRates(db, [employeeId]);
  const today = todayET();
  const current = rates.find((r) => r.effective_from <= today) ?? null;

  return (
    <section id="pay-rate" className="mb-4 scroll-mt-20 rounded-2xl border bg-card px-[18px] py-4 shadow-card">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-[15px] font-semibold tracking-tight">{tr("Pay rate")}</h2>
        <span className="text-xs text-text-2">{tr("Only people with the Job costing permission see this.")}</span>
      </div>
      <p className="text-sm">
        {current ? (
          <>
            <b className="text-lg tabular-nums">{money.format(current.hourly_rate)}</b> <span className="text-text-2">{tr("per hour, since {date}", { date: formatDate(current.effective_from) })}</span>
          </>
        ) : (
          <span className="text-warn-fg">{tr("No pay rate yet: this person's hours aren't costed on projects.")}</span>
        )}
      </p>
      <PayRateForm employeeId={employeeId} today={today} rates={rates.map((r) => ({ id: r.id, rate: r.hourly_rate, from: r.effective_from, note: r.note }))} />
    </section>
  );
}
