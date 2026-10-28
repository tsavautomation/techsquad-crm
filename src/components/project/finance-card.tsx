import Link from "next/link";
import { ExternalLink, Landmark } from "lucide-react";
import type { CurrentUser } from "@/lib/auth/session";
import { formatDate, nowMs } from "@/lib/dates";
import { toCardData } from "@/lib/finance/cards";
import { loadProjectProposals, loadReview } from "@/lib/finance/load";
import { canSeeFinance } from "@/lib/portalio/actions";
import { proposalUrl } from "@/lib/portalio/client";
import { OPEN_REQUEST } from "@/lib/portalio/match";
import { recordsDb } from "@/lib/records/data";
import { getTable } from "@/registry";
import { recordHref } from "@/registry/routes";
import { getT } from "@/i18n/server";
import { PortalReview } from "@/components/finance/portal-review";

// PI-f / PI-g (SPEC §9.1): the Finance card on a project, for people with Transactions or Finance. Everyone else
// sees only the Payment status word in the form. Here: the amounts, each Portal.io payment request, the linked
// proposals (with Refresh / Replace when one changed), and the commission set for the project.

type Money = { approved_amount: number; invoiced_amount: number; paid_amount: number };
type Commission = { commission_percent: number | null; commission_amount: number | null; commission_notes: string | null; c: { title: string | null } | null; o: { title: string | null } | null };
const money = (n: number | null | undefined) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(Number(n ?? 0));

export async function FinanceCard({ projectId, user }: { projectId: number; user: CurrentUser }) {
  if (!canSeeFinance(user)) return null;
  const db = await recordsDb();
  const [{ data: fin }, { proposals, requests }, review, { data: pr }] = await Promise.all([
    db.rpc("project_financials", { p_project_ids: [projectId] }),
    loadProjectProposals(db, projectId),
    loadReview(db, projectId),
    db.from("projects").select("commission_percent, commission_amount, commission_notes, c:commission_contact_id(title), o:commission_organization_id(title)").eq("id", projectId).maybeSingle(),
  ]);
  const m = ((fin as Money[] | null) ?? [])[0];
  const com = pr as unknown as Commission | null;
  const hasCommission = Boolean(com && (com.commission_percent || com.commission_amount || com.c || com.o));
  // commission_notes is the WebAuthor field (shown with a referral); here it only adds to a commission that is set.
  if (!m && !proposals.length && !hasCommission) return null;
  const tr = await getT();
  const balance = Number(m?.invoiced_amount ?? 0) - Number(m?.paid_amount ?? 0);
  const transactions = getTable("transactions");

  return (
    <section id="finance" className="mb-3.5 scroll-mt-20 rounded-2xl border bg-card px-[18px] py-4 shadow-card">
      <h2 className="mb-2 flex items-center gap-2 text-[15px] font-semibold tracking-tight">
        <Landmark className="size-4 text-primary" aria-hidden /> {tr("Finance")}
      </h2>
      <div className="mb-3 grid grid-cols-2 gap-2 text-center sm:grid-cols-4">
        {[
          [tr("Approved"), money(m?.approved_amount)],
          [tr("Invoiced"), money(m?.invoiced_amount)],
          [tr("Paid"), money(m?.paid_amount)],
          [tr("Balance"), money(balance)],
        ].map(([label, value], i) => (
          <div key={label} className={`rounded-xl px-2 py-2 ${i === 3 ? (balance > 0 ? "bg-warn-bg text-warn-fg" : "bg-ok-bg text-ok-fg") : "bg-muted"}`}>
            <b className="block text-base font-semibold tabular-nums">{value}</b>
            <span className="text-xs">{label}</span>
          </div>
        ))}
      </div>
      {review.length > 0 && (
        <div className="mb-3">
          <PortalReview cards={toCardData(review)} compact />
        </div>
      )}
      {requests.length > 0 && (
        <div className="mb-3">
          <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-text-2">{tr("Payment requests in Portal.io")}</h3>
          <ul className="divide-y text-sm">
            {requests.map((r, i) => {
              const open = OPEN_REQUEST(r.status);
              const late = open && r.dueDate && new Date(r.dueDate).getTime() < nowMs();
              return (
                <li key={`${r.id ?? i}`} className="flex flex-wrap items-center gap-x-2 py-1.5">
                  <span className="tabular-nums font-medium">{money(r.amount)}</span>
                  <span className="text-xs text-text-2">
                    {r.description || `#${r.proposal ?? ""}`}
                    {r.dueDate ? ` · ${tr("due")} ${formatDate(r.dueDate)}` : ""}
                  </span>
                  <span className={`ml-auto rounded-full px-2 py-0.5 text-xs font-semibold ${late ? "bg-bad-bg text-bad-fg" : open ? "bg-info-bg text-info-fg" : "bg-ok-bg text-ok-fg"}`}>{late ? tr("Overdue") : tr(r.status ?? "")}</span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
      {proposals.length > 0 && (
        <div className="mb-3">
          <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-text-2">{tr("Portal.io proposals")}</h3>
          <ul className="divide-y text-sm">
            {proposals.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center gap-x-2 py-1.5">
                <a href={proposalUrl(p.id)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline">
                  #{p.number ?? p.id} · {p.name} <ExternalLink className="size-3" aria-hidden />
                </a>
                <span className="text-xs text-text-2">
                  {p.status ? tr(p.status) : ""} · {money(p.total)}
                  {p.change_orders?.length ? ` · ${tr("{n} change orders", { n: p.change_orders.length })}` : ""}
                </span>
                {p.transaction_id && (
                  <Link href={recordHref(transactions, p.transaction_id)} className="ml-auto text-xs text-primary hover:underline">
                    {tr("Transaction")}
                  </Link>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
      {hasCommission && com && (
        <div>
          <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-text-2">{tr("Commission")}</h3>
          <p className="text-sm">
            {[com.commission_percent ? `${com.commission_percent}%` : null, com.commission_amount ? money(com.commission_amount) : null].filter(Boolean).join(" · ")}
            {com.c?.title || com.o?.title ? ` → ${[com.c?.title, com.o?.title].filter(Boolean).join(" / ")}` : ""}
          </p>
          {com.commission_notes && <p className="text-xs text-text-2">{com.commission_notes}</p>}
        </div>
      )}
    </section>
  );
}
