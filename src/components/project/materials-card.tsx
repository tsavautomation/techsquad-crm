import Link from "next/link";
import { ShoppingCart } from "lucide-react";
import type { CurrentUser } from "@/lib/auth/session";
import { canSeePurchasing } from "@/lib/finance/access";
import { loadProjectMaterials } from "@/lib/purchasing/load";
import { needsPurchasing } from "@/lib/purchasing/materials";
import { recordsDb } from "@/lib/records/data";
import { getT } from "@/i18n/server";
import { MaterialsList } from "./materials-list";

// PU-a (Fred 2026-11-03): the Materials card under the project's fields, for the people with Administrative ›
// Purchasing (Finance / Transactions too): the pick list of everything the linked proposals say the project needs,
// what the stock already covers, what was bought, replaced or removed, and the "Needs purchasing" flag.

export async function MaterialsCard({ projectId, user }: { projectId: number; user: CurrentUser }) {
  if (!canSeePurchasing(user)) return null;
  const tr = await getT();
  const rows = await loadProjectMaterials(await recordsDb(), projectId);
  const flag = needsPurchasing(rows);
  return (
    <section id="materials" className="mt-4 rounded-2xl border bg-card px-4 py-3 shadow-card">
      <div className="mb-1 flex flex-wrap items-center gap-2">
        <h2 className="text-sm font-semibold">{tr("Materials")}</h2>
        {flag && (
          <span className="inline-flex items-center gap-1 rounded-full bg-warn-bg px-2 py-0.5 text-[11px] font-medium text-warn-fg">
            <ShoppingCart className="size-3" aria-hidden /> {tr("Needs purchasing")}
          </span>
        )}
        <Link href="/administrative/purchasing?tab=buy" className="ml-auto text-xs text-primary hover:underline">
          {tr("Everything to buy")}
        </Link>
      </div>
      <MaterialsList rows={rows} projectId={projectId} />
    </section>
  );
}
