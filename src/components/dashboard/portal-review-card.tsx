import Link from "next/link";
import { FileCheck2 } from "lucide-react";
import type { CurrentUser } from "@/lib/auth/session";
import { toCardData } from "@/lib/finance/cards";
import { loadReview } from "@/lib/finance/load";
import { canSeeFinance } from "@/lib/finance/access";
import { recordsDb } from "@/lib/records/data";
import { getT } from "@/i18n/server";
import { PortalReview } from "@/components/finance/portal-review";

// PI-c: Today › Portal.io proposals to review, for people with Finance / Transactions. Nothing waiting → no card.

export async function PortalReviewCard({ user }: { user: CurrentUser }) {
  if (!canSeeFinance(user)) return null;
  const cards = await loadReview(await recordsDb());
  if (!cards.length) return null;
  const tr = await getT();
  return (
    <section id="portal-review" className="scroll-mt-20 rounded-2xl border border-warn-fg/30 bg-card px-[18px] py-4 shadow-card">
      <h2 className="mb-1 flex items-center gap-2 text-[15px] font-semibold tracking-tight text-warn-fg">
        <FileCheck2 className="size-4" aria-hidden /> {tr("Portal.io proposals to review")}
        <span className="rounded-full bg-warn-bg px-2 py-0.5 text-xs">{cards.length}</span>
        <Link href="/administrative/finance?tab=portal" className="ml-auto text-xs font-medium text-primary hover:underline">
          {tr("Finance")}
        </Link>
      </h2>
      <p className="mb-3 text-[13px] text-text-2">{tr("Accepted in Portal.io, not yet a transaction here. Pick the project (or ignore); a new project needs you to choose or create the client.")}</p>
      <PortalReview cards={toCardData(cards.slice(0, 5))} />
      {cards.length > 5 && (
        <p className="mt-2 text-xs text-text-2">
          <Link href="/administrative/finance?tab=portal" className="text-primary hover:underline">
            {tr("{n} more on the Finance tab", { n: cards.length - 5 })}
          </Link>
        </p>
      )}
    </section>
  );
}
