import { notFound } from "next/navigation";
import { SalesBoard } from "@/components/ebay/sales-board";
import { requireUser } from "@/lib/auth/session";
import { canSeeEbay, loadSales } from "@/lib/ebay/load";
import { recordsDb } from "@/lib/records/data";
import { getT } from "@/i18n/server";

export async function generateMetadata() {
  return { title: (await getT())("Ebay sales") };
}

// F32 Inventory › Ebay (Fred 2026-10-26): every eBay sale from eBay's two emails, one tile per sale with what
// the office needs to ship it, Mark shipped with the tracking number, then the history.

export default async function EbayPage() {
  const tr = await getT();
  const user = await requireUser();
  if (!canSeeEbay(user)) notFound();
  const sales = await loadSales(await recordsDb());
  return (
    <div className="mx-auto max-w-[1300px]">
      <div className="mb-4">
        <h1 className="text-[21px] font-semibold tracking-tight md:text-2xl">{tr("Ebay sales")}</h1>
        <p className="text-xs text-muted-foreground">{tr("Sales from eBay's emails: what to ship, with the buyer's address and the label; mark shipped with the tracking number.")}</p>
      </div>
      <SalesBoard toShip={sales.toShip} shipped={sales.shipped} />
    </div>
  );
}
