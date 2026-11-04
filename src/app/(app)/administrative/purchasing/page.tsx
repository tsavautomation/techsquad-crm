import Link from "next/link";
import { notFound } from "next/navigation";
import { PurchasingTable } from "@/components/finance/purchasing-table";
import { ToBuyList } from "@/components/finance/to-buy-list";
import { requireUser } from "@/lib/auth/session";
import { todayET } from "@/lib/dates";
import { canSeePurchasing } from "@/lib/finance/access";
import { SCOPE_STATUSES, toPurchaseItems, type Scope } from "@/lib/finance/purchasing";
import { loadAllMaterials } from "@/lib/purchasing/load";
import { stillToBuy } from "@/lib/purchasing/materials";
import { recordsDb } from "@/lib/records/data";
import { cn } from "@/lib/utils";
import { getTable } from "@/registry";
import { tableHref } from "@/registry/routes";
import { getT } from "@/i18n/server";

export async function generateMetadata() {
  return { title: (await getT())("Purchasing") };
}

// FIN-p (Fred 2026-11-03): Administrative › Purchasing, its own page and permission so the buyers see it without
// Finance. PU-a: both tabs read the projects' materials pick lists, so a line bought, replaced, removed or covered
// by the stock today leaves the numbers. Estimate = cost by manufacturer / supplier / type; To buy = the lines.

type Search = { scope?: string; year?: string; tab?: string };

export default async function PurchasingPage({ searchParams }: { searchParams: Promise<Search> }) {
  const tr = await getT();
  const user = await requireUser();
  if (!canSeePurchasing(user)) notFound();
  const sp = await searchParams;
  const scope: Scope = sp.scope === "all" || sp.scope === "complete" ? sp.scope : "open";
  const year = /^\d{4}$/.test(sp.year ?? "") ? Number(sp.year) : null;
  const tab = sp.tab === "buy" ? "buy" : "estimate";
  const thisYear = Number(todayET().slice(0, 4));
  const rows = stillToBuy(await loadAllMaterials(await recordsDb(), SCOPE_STATUSES[scope], year));
  const href = (tb: string) => `/administrative/purchasing?tab=${tb}&scope=${scope}${year ? `&year=${year}` : ""}`;
  const TAB = "inline-flex min-h-11 items-center rounded-full px-4 text-sm font-medium";
  return (
    <div className="mx-auto max-w-[1300px]">
      <div className="mb-4">
        <h1 className="text-[21px] font-semibold tracking-tight md:text-2xl">{tr("Purchasing")}</h1>
        <p className="text-xs text-muted-foreground">{tr("What the Low Voltage projects still need to buy, from the materials lists of their proposals: what was bought, replaced, removed or is in stock stays out.")}</p>
      </div>
      <div className="mb-3 flex gap-1 rounded-full bg-muted p-1 w-fit">
        <Link href={href("estimate")} className={cn(TAB, tab === "estimate" && "bg-card shadow-card")}>
          {tr("By manufacturer")}
        </Link>
        <Link href={href("buy")} className={cn(TAB, tab === "buy" && "bg-card shadow-card")}>
          {tr("To buy")} <span className="ml-1.5 rounded-full bg-warn-bg px-2 py-0.5 text-xs text-warn-fg">{rows.length}</span>
        </Link>
      </div>
      <section className="rounded-2xl border bg-card px-[18px] py-4 shadow-card">
        {tab === "estimate" ? (
          <PurchasingTable rows={toPurchaseItems(rows)} scope={scope} year={year} years={[thisYear, thisYear - 1, thisYear - 2, thisYear - 3]} hrefFor={tableHref(getTable("projects"))} />
        ) : (
          <>
            <ScopeChips scope={scope} year={year} years={[thisYear, thisYear - 1, thisYear - 2, thisYear - 3]} />
            <ToBuyList rows={rows} hrefFor={tableHref(getTable("projects"))} />
          </>
        )}
      </section>
    </div>
  );
}

/** The scope / year chips of the To buy tab (the estimate tab draws its own). */
async function ScopeChips({ scope, year, years }: { scope: Scope; year: number | null; years: number[] }) {
  const tr = await getT();
  const CHIP = "inline-flex min-h-9 items-center rounded-full border px-3 text-sm";
  const on = "border-primary bg-primary text-primary-foreground";
  const href = (sc: Scope, y: number | null) => `/administrative/purchasing?tab=buy&scope=${sc}${y ? `&year=${y}` : ""}`;
  const scopes: { id: Scope; label: string }[] = [
    { id: "open", label: tr("Approved and in progress") },
    { id: "complete", label: tr("Complete") },
    { id: "all", label: tr("All (ON HOLD too)") },
  ];
  return (
    <div className="mb-3 flex flex-wrap items-center gap-2">
      {scopes.map((x) => (
        <Link key={x.id} href={href(x.id, year)} className={cn(CHIP, scope === x.id && on)}>
          {x.label}
        </Link>
      ))}
      <span className="mx-1 text-text-2">·</span>
      <Link href={href(scope, null)} className={cn(CHIP, !year && on)}>
        {tr("All years")}
      </Link>
      {years.map((y) => (
        <Link key={y} href={href(scope, y)} className={cn(CHIP, year === y && on)}>
          {y === years[0] ? tr("{y} (YTD)", { y }) : String(y)}
        </Link>
      ))}
    </div>
  );
}
