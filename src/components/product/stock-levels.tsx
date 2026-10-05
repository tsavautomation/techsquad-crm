import type { CurrentUser } from "@/lib/auth/session";
import { formatDate, toDateTimeLocalET } from "@/lib/dates";
import { recordsDb } from "@/lib/records/data";
import { getTable } from "@/registry";
import { canOpen } from "@/registry/permissions";
import { getT } from "@/i18n/server";

// INV-b Inventory import (SPEC §9.1 INV-b): how many of this product are on hand, per location.
// The numbers are sums of the stock ledger (stock_movements → stock_levels view); nothing is stored
// on the product and nothing is edited by hand. Read with the viewer's permissions (Stock page).

type Level = { location: string; on_hand: number; serials: number; last_moved_at: string | null };

export async function StockLevels({ productId, user }: { productId: number; user: CurrentUser }) {
  if (!canOpen(user.permissions, getTable("stock_items"), getTable)) return null;
  const tr = await getT();
  const db = await recordsDb();
  const { data } = await db.from("stock_levels").select("location, on_hand, serials, last_moved_at").eq("product_id", productId).order("on_hand", { ascending: false });
  const rows = ((data ?? []) as Level[]).map((r) => ({ ...r, on_hand: Number(r.on_hand), serials: Number(r.serials) }));
  if (!rows.length) return null;
  const total = rows.reduce((n, r) => n + r.on_hand, 0);
  const last = rows.map((r) => r.last_moved_at).filter((x): x is string => Boolean(x)).sort().at(-1) ?? null;
  const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2));

  return (
    <section id="stock" className="mb-4 scroll-mt-20 rounded-2xl border bg-card px-4 py-3 shadow-card">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-[15px] font-semibold tracking-tight">{tr("Stock by location")}</h2>
        <span className="rounded-full bg-ok-bg px-2 py-0.5 text-xs font-medium text-ok-fg">{tr("{n} units", { n: fmt(total) })}</span>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-xl bg-muted/50 px-3 py-2">
          <p className="text-xs text-text-2">{tr("Total on hand")}</p>
          <p className="text-lg font-semibold tracking-tight tabular-nums">{fmt(total)}</p>
          {last && <p className="text-xs text-muted-foreground">{tr("Last movement {date}", { date: formatDate(toDateTimeLocalET(last).slice(0, 10)) })}</p>}
        </div>
        <div className="rounded-xl bg-muted/50 px-3 py-2">
          <p className="text-xs text-text-2">{tr("Locations")}</p>
          <p className="text-lg font-semibold tracking-tight tabular-nums">{rows.length}</p>
        </div>
      </div>
      <ul className="-mx-1 mt-2 divide-y">
        {rows.map((r) => (
          <li key={r.location} className="flex items-center justify-between gap-3 px-1 py-2 text-[13px]">
            <span className="min-w-0 flex-1 break-words text-text-2">{r.location || tr("No location")}</span>
            <span className="shrink-0 text-right font-medium tabular-nums whitespace-nowrap">
              {fmt(r.on_hand)}
              {r.serials > 0 && <span className="ml-1 text-xs font-normal text-muted-foreground">· {tr("{n} with serial", { n: r.serials })}</span>}
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-xs text-muted-foreground">{tr("Opening balance from the Sortly / sales imports; checkouts and purchases will move it (Phase 2).")}</p>
    </section>
  );
}
