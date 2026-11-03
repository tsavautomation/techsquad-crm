import { notFound } from "next/navigation";
import { PurchasingTable } from "@/components/finance/purchasing-table";
import { requireUser } from "@/lib/auth/session";
import { todayET } from "@/lib/dates";
import { canSeePurchasing } from "@/lib/finance/access";
import { loadPurchasing, SCOPE_STATUSES, type Scope } from "@/lib/finance/purchasing";
import { recordsDb } from "@/lib/records/data";
import { getTable } from "@/registry";
import { tableHref } from "@/registry/routes";
import { getT } from "@/i18n/server";

export async function generateMetadata() {
  return { title: (await getT())("Purchasing") };
}

// FIN-p (Fred 2026-11-03): Administrative › Purchasing, its own page and permission so the buyers see it without
// Finance: cost to buy by manufacturer, supplier or type over the proposals of the open projects, by year.

type Search = { scope?: string; year?: string };

export default async function PurchasingPage({ searchParams }: { searchParams: Promise<Search> }) {
  const tr = await getT();
  const user = await requireUser();
  if (!canSeePurchasing(user)) notFound();
  const sp = await searchParams;
  const scope: Scope = sp.scope === "all" || sp.scope === "complete" ? sp.scope : "open";
  const year = /^\d{4}$/.test(sp.year ?? "") ? Number(sp.year) : null;
  const thisYear = Number(todayET().slice(0, 4));
  const rows = await loadPurchasing(await recordsDb(), SCOPE_STATUSES[scope], year);
  return (
    <div className="mx-auto max-w-[1300px]">
      <div className="mb-4">
        <h1 className="text-[21px] font-semibold tracking-tight md:text-2xl">{tr("Purchasing")}</h1>
        <p className="text-xs text-muted-foreground">{tr("What the Low Voltage projects still need from each manufacturer, from the lines of their approved proposals; a manufacturer opens into its projects and products.")}</p>
      </div>
      <section className="rounded-2xl border bg-card px-[18px] py-4 shadow-card">
        <PurchasingTable rows={rows} scope={scope} year={year} years={[thisYear, thisYear - 1, thisYear - 2, thisYear - 3]} hrefFor={tableHref(getTable("projects"))} />
      </section>
    </div>
  );
}
