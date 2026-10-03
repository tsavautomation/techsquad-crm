import Link from "next/link";
import { TriangleAlert } from "lucide-react";
import type { CurrentUser } from "@/lib/auth/session";
import { canSeeCosting, loadProjectCosting } from "@/lib/costing/load";
import { formatMinutes } from "@/lib/field-day/day";
import { recordsDb } from "@/lib/records/data";
import { getTable } from "@/registry";
import { recordHref } from "@/registry/routes";
import { cn } from "@/lib/utils";
import { getT } from "@/i18n/server";

// F13-b: the Job costing card on a Project page. Only for people with the job costing key (Fred
// 2026-10-03: Lucas, Saulo, Fred, Jessica and Luana). Labour = technician-hours × each person's rate,
// materials = Sale costs sent to the project, against the approved amount.

const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

export async function JobCosting({ projectId, user }: { projectId: number; user: CurrentUser }) {
  if (!canSeeCosting(user)) return null;
  const tr = await getT();
  const db = await recordsDb();
  const data = await loadProjectCosting(db, projectId);
  if (!data) return null;
  const { costing: c, names } = data;
  const et = getTable("employees");

  const stat = (label: string, value: string, sub?: string, tone?: string) => (
    <div className="rounded-xl bg-muted/50 px-3 py-2">
      <p className="text-[11.5px] text-text-2">{label}</p>
      <p className={cn("text-lg font-semibold tracking-tight tabular-nums", tone)}>{value}</p>
      {sub && <p className="text-[11.5px] text-muted-foreground">{sub}</p>}
    </div>
  );
  const marginTone = c.margin === null ? undefined : c.margin < 0 ? "text-bad-fg" : c.marginPct !== null && c.marginPct < 20 ? "text-warn-fg" : "text-ok-fg";

  return (
    <section id="costing" className="mb-4 scroll-mt-20 rounded-2xl border bg-card px-4 py-3 shadow-card">
      <h2 className="mb-2 text-[15px] font-semibold tracking-tight">{tr("Job costing")}</h2>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {stat(tr("Approved"), c.approved ? money.format(c.approved) : "—", c.approved ? undefined : tr("no approved proposal yet"))}
        {stat(tr("Labour"), money.format(c.labourCost), tr("{t} on site", { t: formatMinutes(c.labourMin) }))}
        {stat(tr("Materials"), money.format(c.materialsCost), tr(c.materialsCount === 1 ? "{n} sale" : "{n} sales", { n: c.materialsCount }))}
        {stat(tr("Margin"), c.margin === null ? "—" : money.format(c.margin), c.marginPct === null ? tr("needs an approved amount") : tr("{pct}% of approved", { pct: c.marginPct }), marginTone)}
      </div>
      <p className="mt-2 text-[12.5px] text-text-2">{tr("Total cost {t}: labour plus materials.", { t: money.format(c.totalCost) })}</p>

      {c.labour.length > 0 && (
        <>
          <p className="mt-3 mb-1 text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">{tr("Labour per person")}</p>
          <ul className="-mx-1 divide-y">
            {c.labour.map((l) => (
              <li key={l.id} className="flex items-center justify-between gap-2 px-1 py-1.5 text-[13px]">
                <span className="min-w-0 truncate">
                  <Link href={recordHref(et, l.id)} className="hover:underline">
                    {names.get(l.id) ?? `#${l.id}`}
                  </Link>
                  <span className="text-text-2">
                    {" "}
                    · {formatMinutes(l.minutes)} · {tr(l.visits === 1 ? "{n} visit" : "{n} visits", { n: l.visits })}
                  </span>
                </span>
                <span className="shrink-0 text-right tabular-nums">
                  {l.rate !== null ? (
                    <>
                      <b>{money.format(l.cost)}</b> <span className="text-text-2">{tr("at {rate}/h", { rate: money.format(l.rate) })}</span>
                    </>
                  ) : (
                    <Link href={`${recordHref(et, l.id)}#pay-rate`} className="inline-flex items-center gap-1 text-warn-fg hover:underline">
                      <TriangleAlert className="size-3.5" aria-hidden /> {tr("no pay rate")}
                    </Link>
                  )}
                </span>
              </li>
            ))}
          </ul>
          {c.unratedMin > 0 && <p className="mt-1 text-[12.5px] text-warn-fg">{tr("{t} not costed: set the pay rate on the employee's page (Pay rate).", { t: formatMinutes(c.unratedMin) })}</p>}
        </>
      )}
      <p className="mt-2 text-[11.5px] text-muted-foreground">{tr("Labour is each person's time on site × their hourly rate on that day. Materials are the Cost of Sale records sent to this project. Only people with the Job costing permission see this.")}</p>
    </section>
  );
}
