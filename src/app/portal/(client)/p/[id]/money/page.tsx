import { notFound } from "next/navigation";
import { FileText } from "lucide-react";
import { requireClient } from "@/lib/portal/session";
import { filesFor, myProject, portalFileHref, projectTransactions } from "@/lib/portal/data";
import { money } from "@/lib/portal/format";
import { recordsDb } from "@/lib/records/data";
import { formatDate } from "@/lib/dates";
import { Empty, Pill, PortalCard } from "@/components/portal/shell";
import { getT } from "@/i18n/server";

const TONE: Record<string, "info" | "ok" | "warn" | "muted"> = { Proposal: "info", Invoice: "warn", Payment: "ok", Credit: "muted" };

/** Money: approved proposals, invoices, payments received and the balance, with the PDFs the office attached. */
export default async function MoneyPage({ params }: PageProps<"/portal/p/[id]">) {
  await requireClient();
  const { id } = await params;
  const t = await getT();
  const db = await recordsDb();
  const projectId = Number(id);
  const [p, rows] = await Promise.all([myProject(db, projectId), projectTransactions(db, projectId)]);
  if (!p) notFound();
  const files = await filesFor(db, "transactions", rows.map((r) => r.id));
  const balance = Number(p.invoiced_amount) - Number(p.paid_amount);

  return (
    <div className="flex flex-col gap-4">
      <PortalCard title={t("Summary")}>
        <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {[
            [t("Approved"), p.approved_amount, ""],
            [t("Invoiced"), p.invoiced_amount, ""],
            [t("Paid"), p.paid_amount, "text-ok-fg"],
            [t("Balance"), balance, balance > 0 ? "text-warn-fg" : ""],
          ].map(([label, value, cls]) => (
            <div key={label as string} className="rounded-xl bg-muted/60 p-3">
              <dt className="text-[11px] text-muted-foreground uppercase">{label as string}</dt>
              <dd className={`text-base font-semibold ${cls as string}`}>{money(value as number)}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-3 text-xs text-muted-foreground">{t("Balance = invoiced − paid. Questions about a charge? Call or text our office.")}</p>
      </PortalCard>
      <PortalCard title={t("Proposals, invoices and payments")}>
        {rows.length === 0 ? (
          <Empty>{t("Nothing here yet.")}</Empty>
        ) : (
          <ul className="divide-y">
            {rows.map((r) => (
              <li key={r.id} className="flex items-start gap-3 py-3 first:pt-0 last:pb-0">
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
                    <Pill tone={TONE[r.type] ?? "muted"}>{t(r.type)}</Pill>
                    {r.portal_number && <span className="text-xs text-muted-foreground">#{r.portal_number}</span>}
                    {r.date && <span className="text-xs text-muted-foreground">{formatDate(r.date)}</span>}
                  </p>
                  {r.description && <p className="mt-1 text-xs text-muted-foreground">{r.description}</p>}
                  {(files.get(r.id) ?? []).map((f) => (
                    <a key={f.id} href={portalFileHref(f.id)} target="_blank" rel="noopener" className="mt-1 inline-flex items-center gap-1 text-xs text-primary">
                      <FileText className="size-3.5" aria-hidden /> {f.file_name}
                    </a>
                  ))}
                </div>
                <p className={`text-sm font-semibold ${r.type === "Payment" ? "text-ok-fg" : ""}`}>{money(r.amount)}</p>
              </li>
            ))}
          </ul>
        )}
      </PortalCard>
    </div>
  );
}
