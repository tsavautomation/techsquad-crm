import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/session";
import { loadPickLists, loadRecentCheckouts, loadStockUnits } from "@/lib/inventory/load";
import { recordsDb } from "@/lib/records/data";
import { getTable } from "@/registry";
import { canDo, canOpen } from "@/registry/permissions";
import { StockApp } from "@/components/inventory/stock-app";
import ListPage from "@/app/(app)/[module]/[tab]/page";
import { getT } from "@/i18n/server";

// INV-d "Estoque em Campo" (SPEC §9.1 INV-d): Inventory › Stock is the serial-centric stock app
// rebuilt from the colleague's prototype — list with search and stage chips, item sheet with history,
// Register a movement, Hand-over receipt, Dashboard — on the same tables and permissions as before.
// ?view=table still shows the ordinary Stock list.

export async function generateMetadata() {
  return { title: (await getT())("Stock") };
}

export default async function StockPage(props: PageProps<"/inventory/stock">) {
  const sp = await props.searchParams;
  if (sp.view === "table") return ListPage({ ...props, params: Promise.resolve({ module: "inventory", tab: "stock" }) } as never);
  const user = await requireUser();
  const t = getTable("stock_items");
  if (!canOpen(user.permissions, t, getTable)) notFound();
  const db = await recordsDb();
  const [units, lists, recent] = await Promise.all([loadStockUnits(db), loadPickLists(db), loadRecentCheckouts(db)]);
  return (
    <StockApp
      units={units}
      lists={lists}
      recent={recent}
      can={{ move: canDo(user.permissions, t, "modify", getTable), add: canDo(user.permissions, t, "create", getTable), handover: canDo(user.permissions, getTable("inventory_checkouts"), "create", getTable) }}
      initialTab={typeof sp.tab === "string" ? sp.tab : "stock"}
    />
  );
}
