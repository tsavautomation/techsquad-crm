import Link from "next/link";
import { ExternalLink, Landmark, TriangleAlert } from "lucide-react";
import type { CurrentUser } from "@/lib/auth/session";
import { formatDate, todayET } from "@/lib/dates";
import { canSeeFinance } from "@/lib/finance/access";
import { toCardData } from "@/lib/finance/cards";
import { loadProjectProposals, loadProjectTransactions, loadReview, reliabilityFor } from "@/lib/finance/load";
import { loadFinanceSettings } from "@/lib/finance/settings";
import { figures, financialStatus, ordinal, STATUS_TONE, type FinRow } from "@/lib/finance/status";
import { proposalUrl } from "@/lib/portalio/client";
import { recordsDb } from "@/lib/records/data";
import { getTable } from "@/registry";
import { recordHref } from "@/registry/routes";
import { getT } from "@/i18n/server";
import { PortalReview } from "@/components/finance/portal-review";

// FIN-b/FIN-e (SPEC §9.1): the Finance card on a project, for people with Transactions or Finance. Everyone else
// sees only the Financial Status word in the form. Here: the figures, the P&L, every proposal / invoice / payment of
// the project, the Portal.io review cards (Refresh / Replace), the client's reliability and the commission.

type Commission = { commission_percent: number | null; commission_amount: number | null; commission_notes: string | null; c: { title: string | null } | null; o: { title: string | null } | null; owner: { id: number; title: string | null; payment_reliability: string | null; organizations: { title: string | null; payment_reliability: string | null } | null } | null };
const money = (n: number | null | undefined) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(Number(n ?? 0));

export async function FinanceCard({ projectId, user }: { projectId: number; user: CurrentUser }) {
  if (!canSeeFinance(user)) return null;
  const db = await recordsDb();
  const [{ data: fin }, { proposals }, review, { data: pr }, tx, settings] = await Promise.all([
    db.rpc("project_financials", { p_project_ids: [projectId] }),
    loadProjectProposals(db, projectId),
    loadReview(db, projectId),
    db.from("projects").select("commission_percent, commission_amount, commission_notes, c:commission_contact_id(title), o:commission_organization_id(title), owner:job_owner_id(id, title, payment_reliability, organizations:organization_id(title, payment_reliability))").eq("id", projectId).maybeSingle(),
    loadProjectTransactions(db, projectId),
    loadFinanceSettings(db),
  ]);
  const row = ((fin as FinRow[] | null) ?? [])[0];
  const com = pr as unknown as Commission | null;
  const hasCommission = Boolean(com && (com.commission_percent || com.commission_amount || com.c || com.o));
  if (!row && !proposals.length && !hasCommission && !tx.length) return null;
  const tr = await getT();
  const today = todayET();
  const f = row ? figures(row, today) : null;
  const status = row ? financialStatus(row, settings.grace_days, today) : "No data";
  const transactions = getTable("transactions");
  const reliability = com?.owner?.payment_reliability ?? com?.owner?.organizations?.payment_reliability ?? null;
  // The suggestion looks at every project of the same Job Owner.
  const { data: owned } = com?.owner ? await db.from("projects").select("id").eq("job_owner_id", com.owner.id).is("deleted_at", null) : { data: [] };
  const suggestion = await reliabilityFor(db, ((owned ?? []) as { id: number }[]).map((p) => p.id));
  const line = (t: (typeof tx)[number]) => (
    <li key={t.id} className="flex flex-wrap items-center gap-x-2 py-1.5">
      <Link href={recordHref(transactions, t.id)} className="text-primary hover:underline">
        {t.description || t.type}
      </Link>
      <span className="text-xs text-text-2">
        {t.portal_number ? `#${t.portal_number}` : ""}
        {t.is_change_order ? ` · ${tr("change order")}` : ""}
        {t.type === "Payment" && t.payment_no ? ` · ${ordinal(t.payment_no)}` : ""}
        {t.type === "Payment" && t.method ? ` · ${t.method}` : ""}
        {t.date ? ` · ${formatDate(t.date)}` : ""}
        {t.type === "Invoice" && t.due_date ? ` · ${tr("due")} ${formatDate(t.due_date)}` : ""}
      </span>
      <span className="ml-auto tabular-nums font-medium">{money(t.amount)}</span>
      {t.type === "Payment" && (t.cc_fee || t.tip || t.discount) ? (
        <span className="basis-full text-xs text-text-2">
          {t.cc_fee ? `${tr("CC Fee")} ${money(t.cc_fee)} ` : ""}
          {t.tip ? `${tr("Tip")} ${money(t.tip)} ` : ""}
          {t.discount ? `${tr("Discount")} ${money(t.discount)}` : ""}
        </span>
      ) : null}
      {t.type === "Invoice" && t.invoice_status ? <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${t.invoice_status === "Paid" ? "bg-ok-bg text-ok-fg" : t.invoice_status === "Declined" ? "bg-bad-bg text-bad-fg" : t.due_date && t.due_date < today ? "bg-bad-bg text-bad-fg" : "bg-info-bg text-info-fg"}`}>{tr(t.invoice_status)}</span> : null}
    </li>
  );
  const group = (title: string, type: string) => {
    const rows = tx.filter((t) => t.type === type);
    if (!rows.length) return null;
    return (
      <div className="mb-3">
        <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-text-2">{title}</h3>
        <ul className="divide-y text-sm">{rows.map(line)}</ul>
      </div>
    );
  };

  return (
    <section id="finance" className="mb-3.5 scroll-mt-20 rounded-2xl border bg-card px-[18px] py-4 shadow-card">
      <h2 className="mb-2 flex items-center gap-2 text-[15px] font-semibold tracking-tight">
        <Landmark className="size-4 text-primary" aria-hidden /> {tr("Finance")}
        <span className={`ml-auto rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_TONE[status]}`}>{tr(status)}</span>
      </h2>
      {f && (
        <>
          <div className="mb-2 grid grid-cols-2 gap-2 text-center sm:grid-cols-4">
            {[
              [tr("Approved"), money(f.approved), null],
              [tr("Paid"), money(f.paid), f.paidPct !== null ? `${f.paidPct}%` : null],
              [tr("Discount"), money(f.discount), null],
              [tr("Balance"), money(f.balance), f.balancePct !== null ? `${f.balancePct}%` : null],
            ].map(([label, value, sub], i) => (
              <div key={String(label)} className={`rounded-xl px-2 py-2 ${i === 3 ? (f.balance > 0 ? "bg-warn-bg text-warn-fg" : "bg-ok-bg text-ok-fg") : "bg-muted"}`}>
                <b className="block text-base font-semibold tabular-nums">{value}</b>
                <span className="text-xs">
                  {label}
                  {sub ? ` · ${sub}` : ""}
                </span>
              </div>
            ))}
          </div>
          <p className="mb-3 text-xs text-text-2">
            {tr("Invoiced {a}", { a: money(f.invoiced) })}
            {f.ccFees ? ` · ${tr("CC fees {a}", { a: money(f.ccFees) })}` : ""}
            {f.tips ? ` · ${tr("tips {a}", { a: money(f.tips) })}` : ""}
            {f.nextDue ? ` · ${tr("next due {d}", { d: formatDate(f.nextDue) })}` : ""}
            {f.daysLate ? ` · ${tr("{n} days late", { n: f.daysLate })}` : ""}
          </p>
          <div className="mb-3 rounded-xl border px-3 py-2 text-sm">
            <p className="mb-1 flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-text-2">
              {tr("P&L")} <TriangleAlert className="size-3.5 text-warn-fg" aria-hidden /> <span className="font-normal normal-case text-warn-fg">{tr("no labor yet")}</span>
            </p>
            <p className="flex flex-wrap gap-x-3 tabular-nums">
              <span>
                {tr("Sales Tax")} {money(f.salesTax)}
              </span>
              <span>
                {tr("Parts")} {money(f.parts)}
              </span>
              <span>
                {tr("Commission")} {money(f.commission)}
              </span>
              <span className="ml-auto font-semibold">
                {tr("Profit")} {money(f.profit)}
                {f.marginPct !== null ? ` (${f.marginPct}%)` : ""}
              </span>
            </p>
          </div>
        </>
      )}
      {review.length > 0 && (
        <div className="mb-3">
          <PortalReview cards={toCardData(review)} compact />
        </div>
      )}
      {group(tr("Approved proposals"), "Proposal")}
      {group(tr("Invoices"), "Invoice")}
      {group(tr("Payments"), "Payment")}
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
                  {p.payment_requests?.length ? ` · ${tr("{n} payment requests", { n: p.payment_requests.length })}` : ""}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
        {com?.owner && (
          <p>
            <span className="text-xs font-semibold uppercase tracking-wide text-text-2">{tr("Payment Reliability")}</span>{" "}
            {reliability ? tr(reliability) : tr("not rated")}
            {suggestion && <span className="text-xs text-text-2"> · {tr("suggested {level} (on average {n} days late)", { level: tr(suggestion.level), n: suggestion.avgDays })}</span>}
          </p>
        )}
        {hasCommission && com && (
          <p>
            <span className="text-xs font-semibold uppercase tracking-wide text-text-2">{tr("Commission")}</span>{" "}
            {[com.commission_percent ? `${com.commission_percent}%` : null, com.commission_amount ? money(com.commission_amount) : null].filter(Boolean).join(" · ")}
            {com.c?.title || com.o?.title ? ` → ${[com.c?.title, com.o?.title].filter(Boolean).join(" / ")}` : ""}
          </p>
        )}
      </div>
    </section>
  );
}
