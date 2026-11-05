import Link from "next/link";
import { ShoppingCart } from "lucide-react";
import type { CurrentUser } from "@/lib/auth/session";
import { canSeePurchasing } from "@/lib/finance/access";
import { loadProjectMaterials } from "@/lib/purchasing/load";
import { needsPurchasing, summarize } from "@/lib/purchasing/materials";
import { CollapsedCard } from "@/components/ui/collapsed-card";
import { recordsDb } from "@/lib/records/data";
import { getT } from "@/i18n/server";
import { MaterialsList } from "./materials-list";

// PU-a (Fred 2026-11-03): the Materials card under the project's fields, for the people with Administrative ›
// Purchasing (Finance / Transactions too): the pick list of everything the linked proposals say the project needs,
// what the stock already covers, what was bought, replaced or removed, and the "Needs purchasing" flag.
// PU-d: the units installed / staged on the job (Stock) are laid over the lines: only the rest is still to buy.

export async function MaterialsCard({ projectId, user }: { projectId: number; user: CurrentUser }) {
  if (!canSeePurchasing(user)) return null;
  const tr = await getT();
  const { rows, extras } = await loadProjectMaterials(await recordsDb(), projectId);
  const flag = needsPurchasing(rows);
  const s = summarize(rows);
  const warnings = extras.filter((e) => !e.ignored_id).length;
  return (
    <CollapsedCard
      id="materials"
      className="mt-4"
      title={
        <>
          <h2 className="text-sm font-semibold">{tr("Materials")}</h2>
          {flag && (
            <span className="inline-flex items-center gap-1 rounded-full bg-warn-bg px-2 py-0.5 text-[11px] font-medium text-warn-fg">
              <ShoppingCart className="size-3" aria-hidden /> {tr("Needs purchasing")}
            </span>
          )}
          {warnings > 0 && <span className="rounded-full bg-bad-bg px-2 py-0.5 text-[11px] font-medium text-bad-fg">{tr("{n} on the job but not on the list", { n: warnings })}</span>}
        </>
      }
      meta={s.toBuy ? tr("{n} lines · to buy {b}", { n: s.lines, b: s.toBuy }) : tr("{n} lines", { n: s.lines })}
    >
      <Link href="/administrative/purchasing?tab=buy" className="mb-2 inline-block text-xs text-primary hover:underline">
        {tr("Everything to buy")}
      </Link>
      <MaterialsList rows={rows} extras={extras} projectId={projectId} />
    </CollapsedCard>
  );
}
