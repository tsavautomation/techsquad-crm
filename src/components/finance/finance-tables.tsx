"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { formatDate } from "@/lib/dates";
import { setGraceDaysAction } from "@/lib/finance/actions";
import type { ClientKey, ClientTotals, Dashboard, FinanceProject, PartnerKey, PaymentLine, ProposalLine } from "@/lib/finance/load";
import { STATUS_TONE, STATUSES, ordinal, type FinancialStatus } from "@/lib/finance/status";
import { cn } from "@/lib/utils";
import { useT } from "@/i18n/client";
import { CsvButton } from "./csv-button";

// FIN-f (SPEC §9.1, Fred 2026-10-28): the Low Voltage finance screens, replacing Luana's "Sales Projections" sheet.
// Everything arrives computed from the server; the lists filter on the client and download as CSV.

const money = (n: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
const money2 = (n: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);
const pct = (n: number | null) => (n === null ? "—" : `${n}%`);
const INPUT = "h-11 rounded-[10px] border bg-background px-3 text-base";
const CHIP = (on: boolean) => cn("min-h-9 rounded-full border px-3 text-xs font-medium", on ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted");
const TH = "px-2 py-1.5 font-medium";
const TD = "px-2 py-1.5";
const NUM = "px-2 py-1.5 text-right tabular-nums";

export function StatusPill({ status }: { status: string }) {
  const t = useT();
  return <span className={cn("inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap", STATUS_TONE[status] ?? STATUS_TONE["No data"])}>{t(status)}</span>;
}

function Tile({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: string }) {
  return (
    <div className={cn("rounded-xl px-3 py-2", tone ?? "bg-muted")}>
      <p className="text-xs">{label}</p>
      <p className="text-lg font-semibold tracking-tight tabular-nums">{value}</p>
      {sub && <p className="text-xs opacity-80">{sub}</p>}
    </div>
  );
}

/** Period + extra controls as a GET form that keeps the current tab. */
export function PeriodForm({ tab, from, to, children }: { tab: string; from: string; to: string; children?: React.ReactNode }) {
  const t = useT();
  return (
    <form method="get" className="mb-3 flex flex-col gap-2 md:flex-row md:flex-wrap md:items-end">
      <input type="hidden" name="tab" value={tab} />
      {children}
      <label className="flex flex-col gap-1 text-xs text-text-2">
        {t("From")}
        <input type="date" name="from" defaultValue={from} className={cn(INPUT, "text-foreground")} />
      </label>
      <label className="flex flex-col gap-1 text-xs text-text-2">
        {t("To")}
        <input type="date" name="to" defaultValue={to} className={cn(INPUT, "text-foreground")} />
      </label>
      <button type="submit" className="inline-flex h-11 items-center rounded-[10px] bg-primary px-4 text-sm font-semibold text-primary-foreground">
        {t("Apply")}
      </button>
    </form>
  );
}

// ---------------------------------------------------------------- dashboard

export function ReceivablesDashboard({ d, hrefFor, canSetGrace }: { d: Dashboard; hrefFor: string; canSetGrace: boolean }) {
  const t = useT();
  const order: FinancialStatus[] = ["Past Due", "Delinquent", "Current"];
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Tile label={t("Total to receive")} value={money(d.open)} sub={t("ON HOLD apart: {n}", { n: money(d.onHold.amount) })} tone="bg-primary/10 text-foreground" />
        {order.map((s) => (
          <Tile key={s} label={t(s)} value={money(d.byStatus[s]?.amount ?? 0)} sub={t("{n} projects", { n: d.byStatus[s]?.projects ?? 0 })} tone={STATUS_TONE[s]} />
        ))}
      </div>
      <div>
        <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-text-2">{t("By payment reliability of the client")}</h3>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {(["High", "Medium", "Low", "Unknown"] as const).map((k) => (
            <Tile key={k} label={k === "Unknown" ? t("Not rated") : t(k)} value={money(d.byReliability[k] ?? 0)} tone={k === "High" ? "bg-ok-bg text-ok-fg" : k === "Medium" ? "bg-warn-bg text-warn-fg" : k === "Low" ? "bg-bad-bg text-bad-fg" : "bg-muted"} />
          ))}
        </div>
      </div>
      <div>
        <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-text-2">{t("Invoices by due date")}</h3>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Tile label={t("Already due")} value={money(d.due.late)} tone="bg-bad-bg text-bad-fg" />
          <Tile label={t("Next 30 days")} value={money(d.due.d30)} />
          <Tile label={t("31 to 60 days")} value={money(d.due.d60)} />
          <Tile label={t("61 to 90 days")} value={money(d.due.d90)} />
        </div>
        <p className="mt-1 text-xs text-text-2">{t("Only invoices with a Due Date count here. ON HOLD projects are left out.")}</p>
      </div>
      <div>
        <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-text-2">{t("Profit & Loss (all Low Voltage projects)")}</h3>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Tile label={t("Approved")} value={money(d.approved)} />
          <Tile label={t("Profit")} value={money(d.profit)} sub={t("no labor yet")} tone="bg-warn-bg text-warn-fg" />
          <Tile label={t("CC fees collected")} value={money(d.ccFees)} />
          <Tile label={t("Tips")} value={money(d.tips)} />
        </div>
        <p className="mt-1 flex items-center gap-1 text-xs text-warn-fg">
          <TriangleAlert className="size-3.5" aria-hidden /> {t("Labor is not in the P&L yet (the rule is still to be defined), so Profit is Approved − Sales Tax − Parts − Commission.")}
        </p>
      </div>
      {d.missing.length > 0 && (
        <div className="rounded-xl border border-warn-fg/40 px-3 py-2">
          <h3 className="mb-1 flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-warn-fg">
            <TriangleAlert className="size-3.5" aria-hidden /> {t("Approved or further along, but no Approved Proposal recorded ({n})", { n: d.missing.length })}
          </h3>
          <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
            {d.missing.map((p) => (
              <li key={p.id}>
                <Link href={`${hrefFor}/${p.id}`} className="text-primary hover:underline">
                  {p.title}
                </Link>{" "}
                <span className="text-xs text-text-2">{p.job_status ? t(p.job_status) : ""}</span>
              </li>
            ))}
          </ul>
          <p className="mt-1 text-xs text-text-2">{t("Probably a proposal that did not sync or was not linked yet: check Finance › Portal.io.")}</p>
        </div>
      )}
      {canSetGrace && <GraceDays value={d.graceDays} />}
    </div>
  );
}

function GraceDays({ value }: { value: number }) {
  const t = useT();
  const router = useRouter();
  const [days, setDays] = useState(String(value));
  const [pending, start] = useTransition();
  const save = () =>
    start(async () => {
      const r = await setGraceDaysAction(Number(days));
      if (!r.ok) return void toast.error(t(r.message));
      toast.success(t("Saved."));
      router.refresh();
    });
  return (
    <div className="flex flex-wrap items-end gap-2 rounded-xl bg-muted/50 px-3 py-2">
      <label className="flex flex-col gap-1 text-xs text-text-2">
        {t("Grace days before an open invoice counts as Past Due")}
        <input type="number" min={0} max={120} value={days} onChange={(e) => setDays(e.target.value)} className={cn(INPUT, "w-28 text-foreground")} />
      </label>
      <button type="button" onClick={save} disabled={pending || days === String(value)} className="inline-flex h-11 items-center rounded-[10px] border bg-card px-4 text-sm font-medium hover:bg-muted disabled:opacity-50">
        {t("Save")}
      </button>
    </div>
  );
}

// ---------------------------------------------------------------- projects

export function ProjectsTable({ rows, hrefFor }: { rows: FinanceProject[]; hrefFor: string }) {
  const t = useT();
  const [status, setStatus] = useState<"All" | "ON HOLD" | FinancialStatus>("All");
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<{ key: keyof FinanceProject; dir: 1 | -1 }>({ key: "title", dir: 1 });
  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const list = rows.filter((r) => (status === "All" ? true : status === "ON HOLD" ? r.onHold : r.status === status && !r.onHold) && (!needle || [r.title, r.owner, r.owner_org, r.design_firm, r.general_contractor, r.builder].some((x) => (x ?? "").toLowerCase().includes(needle))));
    return list.sort((a, b) => {
      const va = a[sort.key] ?? "";
      const vb = b[sort.key] ?? "";
      return (typeof va === "number" && typeof vb === "number" ? va - vb : String(va).localeCompare(String(vb))) * sort.dir;
    });
  }, [rows, status, q, sort]);
  const counts = useMemo(() => {
    const c: Record<string, number> = { "ON HOLD": rows.filter((r) => r.onHold).length };
    for (const s of STATUSES) c[s] = rows.filter((r) => r.status === s && !r.onHold).length;
    return c;
  }, [rows]);
  const totals = shown.reduce((a, r) => ({ approved: a.approved + r.approved, paid: a.paid + r.paid, balance: a.balance + r.balance }), { approved: 0, paid: 0, balance: 0 });
  const th = (label: string, key: keyof FinanceProject, right?: boolean) => (
    <th className={cn(TH, right && "text-right")}>
      <button type="button" onClick={() => setSort((s) => ({ key, dir: s.key === key ? ((s.dir * -1) as 1 | -1) : 1 }))} className="hover:underline">
        {label}
        {sort.key === key ? (sort.dir === 1 ? " ↑" : " ↓") : ""}
      </button>
    </th>
  );
  const csvRows = shown.map((r) => ({ project: r.title, client: r.owner ?? r.owner_org ?? "", job_status: r.job_status ?? "", status: r.onHold ? "ON HOLD" : r.status, approved: r.approved, paid: r.paid, discount: r.discount, balance: r.balance, paid_pct: r.paidPct ?? "", next_due: r.nextDue ?? "", days_late: r.daysLate, reliability: r.reliability ?? "" }));

  return (
    <div>
      <div className="mb-3 flex flex-col gap-2 md:flex-row md:items-center">
        <div className="flex flex-wrap gap-1.5">
          {(["All", ...STATUSES, "ON HOLD"] as const).map((s) => (
            <button key={s} type="button" onClick={() => setStatus(s)} className={CHIP(status === s)}>
              {t(s)} <span className="opacity-70">{s === "All" ? rows.length : counts[s]}</span>
            </button>
          ))}
        </div>
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("Project or client")} className={cn(INPUT, "md:ml-auto md:w-64")} />
        <CsvButton rows={csvRows} name="finance-projects" columns={[{ key: "project", label: "Project" }, { key: "client", label: "Client" }, { key: "job_status", label: "Job Status" }, { key: "status", label: "Financial Status" }, { key: "approved", label: "Approved" }, { key: "paid", label: "Paid" }, { key: "discount", label: "Discount" }, { key: "balance", label: "Balance" }, { key: "paid_pct", label: "Paid %" }, { key: "next_due", label: "Next due" }, { key: "days_late", label: "Days late" }, { key: "reliability", label: "Reliability" }]} />
      </div>
      <ul className="flex flex-col gap-2 md:hidden">
        {shown.map((r) => (
          <li key={r.id} className="rounded-xl border px-3 py-2 text-sm">
            <div className="flex items-start justify-between gap-2">
              <Link href={`${hrefFor}/${r.id}`} className="font-semibold text-primary hover:underline">
                {r.title}
              </Link>
              <StatusPill status={r.onHold ? "ON HOLD" : r.status} />
            </div>
            <p className="text-xs text-text-2">{[r.owner, r.owner_org, r.reliability ? t("reliability {r}", { r: t(r.reliability) }) : null].filter(Boolean).join(" · ")}</p>
            <p className="mt-1 text-xs">
              {t("Approved")} {money(r.approved)} · {t("Paid")} {money(r.paid)} ({pct(r.paidPct)}) · <b>{t("Balance")} {money(r.balance)}</b>
              {r.nextDue ? ` · ${t("Next due")} ${formatDate(r.nextDue)}` : ""}
              {r.daysLate ? ` · ${t("{n} days late", { n: r.daysLate })}` : ""}
            </p>
          </li>
        ))}
      </ul>
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full text-left text-sm">
          <thead className="text-xs text-text-2">
            <tr>
              {th(t("Project"), "title")}
              {th(t("Client"), "owner")}
              {th(t("Approved"), "approved", true)}
              {th(t("Paid"), "paid", true)}
              {th(t("Paid %"), "paidPct", true)}
              {th(t("Balance"), "balance", true)}
              {th(t("Next due"), "nextDue")}
              {th(t("Days late"), "daysLate", true)}
              {th(t("Reliability"), "reliability")}
              {th(t("Status"), "status")}
            </tr>
          </thead>
          <tbody className="divide-y">
            {shown.map((r) => (
              <tr key={r.id} className="hover:bg-muted/50">
                <td className={TD}>
                  <Link href={`${hrefFor}/${r.id}`} className="font-medium text-primary hover:underline">
                    {r.title}
                  </Link>
                  {r.missingProposal && <TriangleAlert className="ml-1 inline size-3.5 text-warn-fg" aria-label={t("no Approved Proposal")} />}
                </td>
                <td className={cn(TD, "text-text-2")}>{[r.owner, r.owner_org].filter(Boolean).join(" · ")}</td>
                <td className={NUM}>{money(r.approved)}</td>
                <td className={NUM}>{money(r.paid)}</td>
                <td className={NUM}>{pct(r.paidPct)}</td>
                <td className={cn(NUM, "font-semibold", r.balance > 0 && "text-warn-fg")}>{money(r.balance)}</td>
                <td className={cn(TD, "whitespace-nowrap")}>{r.nextDue ? formatDate(r.nextDue) : ""}</td>
                <td className={cn(NUM, r.daysLate > 0 && "text-bad-fg")}>{r.daysLate || ""}</td>
                <td className={TD}>{r.reliability ? t(r.reliability) : ""}</td>
                <td className={TD}>
                  <StatusPill status={r.onHold ? "ON HOLD" : r.status} />
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot className="text-xs font-semibold">
            <tr>
              <td className={TD} colSpan={2}>
                {t("{n} projects", { n: shown.length })}
              </td>
              <td className={NUM}>{money(totals.approved)}</td>
              <td className={NUM}>{money(totals.paid)}</td>
              <td />
              <td className={NUM}>{money(totals.balance)}</td>
              <td colSpan={4} />
            </tr>
          </tfoot>
        </table>
      </div>
      {!shown.length && <p className="py-6 text-center text-sm text-text-2">{t("No project matches.")}</p>}
    </div>
  );
}

// ---------------------------------------------------------------- payments

export function PaymentsTable({ rows, from, to, hrefFor, txHref }: { rows: PaymentLine[]; from: string; to: string; hrefFor: string; txHref: string }) {
  const t = useT();
  const [method, setMethod] = useState("All");
  const methods = useMemo(() => ["All", ...new Set(rows.map((r) => r.method ?? "—"))], [rows]);
  const shown = rows.filter((r) => method === "All" || (r.method ?? "—") === method);
  const tot = shown.reduce((a, r) => ({ amount: a.amount + r.amount, fee: a.fee + r.cc_fee, tip: a.tip + r.tip, discount: a.discount + r.discount }), { amount: 0, fee: 0, tip: 0, discount: 0 });
  const csv = shown.map((r) => ({ date: r.date ?? "", project: r.project, client: r.client ?? "", description: r.description ?? "", portal: r.portal_number ?? "", payment_no: r.payment_no ? ordinal(r.payment_no) : "", amount: r.amount, cc_fee: r.cc_fee, tip: r.tip, discount: r.discount, method: r.method ?? "", reference: r.reference ?? "" }));
  return (
    <div>
      <PeriodForm tab="payments" from={from} to={to}>
        <label className="flex flex-col gap-1 text-xs text-text-2">
          {t("Method")}
          <select value={method} onChange={(e) => setMethod(e.target.value)} className={cn(INPUT, "text-foreground")}>
            {methods.map((m) => (
              <option key={m} value={m}>
                {m === "All" ? t("All") : m}
              </option>
            ))}
          </select>
        </label>
      </PeriodForm>
      <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-text-2">
        <span>
          {t("{n} payments", { n: shown.length })} · {t("Amount")} <b>{money2(tot.amount)}</b> · {t("CC Fee")} {money2(tot.fee)} · {t("Tip")} {money2(tot.tip)} · {t("Discount")} {money2(tot.discount)}
        </span>
        <span className="ml-auto">
          <CsvButton rows={csv} name={`payments-${from}-${to}`} columns={[{ key: "date", label: "Date" }, { key: "project", label: "Project" }, { key: "client", label: "Client" }, { key: "description", label: "Description" }, { key: "portal", label: "Portal #" }, { key: "payment_no", label: "Payment #" }, { key: "amount", label: "Amount" }, { key: "cc_fee", label: "CC Fee" }, { key: "tip", label: "Tip" }, { key: "discount", label: "Discount" }, { key: "method", label: "Method" }, { key: "reference", label: "Reference #" }]} />
        </span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="text-xs text-text-2">
            <tr>
              <th className={TH}>{t("Date")}</th>
              <th className={TH}>{t("Project")}</th>
              <th className={TH}>{t("Description")}</th>
              <th className={TH}>#</th>
              <th className={cn(TH, "text-right")}>{t("Amount")}</th>
              <th className={cn(TH, "text-right")}>{t("CC Fee")}</th>
              <th className={cn(TH, "text-right")}>{t("Tip")}</th>
              <th className={cn(TH, "text-right")}>{t("Discount")}</th>
              <th className={TH}>{t("Method")}</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {shown.map((r) => (
              <tr key={r.id} className="hover:bg-muted/50">
                <td className={cn(TD, "whitespace-nowrap")}>{r.date ? formatDate(r.date) : ""}</td>
                <td className={TD}>
                  <Link href={`${hrefFor}/${r.project_id}`} className="text-primary hover:underline">
                    {r.project}
                  </Link>
                  {r.client && <span className="block text-xs text-text-2">{r.client}</span>}
                </td>
                <td className={TD}>
                  <Link href={`${txHref}/${r.id}`} className="hover:underline">
                    {r.description}
                  </Link>
                  {r.portal_number && <span className="ml-1 text-xs text-text-2">#{r.portal_number}</span>}
                </td>
                <td className={cn(TD, "text-xs text-text-2")}>{r.payment_no ? ordinal(r.payment_no) : ""}</td>
                <td className={cn(NUM, "font-medium")}>{money2(r.amount)}</td>
                <td className={NUM}>{r.cc_fee ? money2(r.cc_fee) : ""}</td>
                <td className={NUM}>{r.tip ? money2(r.tip) : ""}</td>
                <td className={NUM}>{r.discount ? money2(r.discount) : ""}</td>
                <td className={cn(TD, "text-xs")}>
                  {r.method ?? ""}
                  {r.reference && <span className="block text-text-2">{r.reference}</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!shown.length && <p className="py-6 text-center text-sm text-text-2">{t("No payments in this period.")}</p>}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- proposals (by period and by partner)

export function ProposalsTable({ rows, from, to, partner, partners, hrefFor, txHref }: { rows: ProposalLine[]; from: string; to: string; partner: PartnerKey; partners: { key: PartnerKey; label: string }[]; hrefFor: string; txHref: string }) {
  const t = useT();
  const [group, setGroup] = useState(false);
  const total = rows.reduce((a, r) => a + r.amount, 0);
  const commission = rows.reduce((a, r) => a + r.commission, 0);
  const groups = useMemo(() => {
    const m = new Map<string, { partner: string; amount: number; commission: number; rows: ProposalLine[] }>();
    for (const r of rows) {
      const k = r.partner ?? "(none)";
      const g = m.get(k) ?? { partner: k, amount: 0, commission: 0, rows: [] };
      g.amount += r.amount;
      g.commission += r.commission;
      g.rows.push(r);
      m.set(k, g);
    }
    return [...m.values()].sort((a, b) => b.amount - a.amount);
  }, [rows]);
  const csv = rows.map((r) => ({ date: r.date ?? "", project: r.project, client: r.client ?? "", description: r.description ?? "", portal: r.portal_number ?? "", change_order: r.is_change_order ? "yes" : "", amount: r.amount, sales_tax: r.sales_tax, parts_cost: r.parts_cost, partner: r.partner ?? "", commission: r.commission }));
  return (
    <div>
      <PeriodForm tab="proposals" from={from} to={to}>
        <label className="flex flex-col gap-1 text-xs text-text-2">
          {t("Partner")}
          <select name="partner" defaultValue={partner} className={cn(INPUT, "text-foreground")}>
            {partners.map((k) => (
              <option key={k.key} value={k.key}>
                {t(k.label)}
              </option>
            ))}
          </select>
        </label>
      </PeriodForm>
      <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-text-2">
        <span>
          {t("{n} approved proposals", { n: rows.length })} · {t("Total")} <b>{money2(total)}</b> · {t("Commission")} {money2(commission)}
        </span>
        <button type="button" onClick={() => setGroup((g) => !g)} className={cn(CHIP(group), "ml-auto")}>
          {t("Group by partner")}
        </button>
        <CsvButton rows={csv} name={`proposals-${from}-${to}`} columns={[{ key: "date", label: "Date" }, { key: "project", label: "Project" }, { key: "client", label: "Client" }, { key: "description", label: "Title" }, { key: "portal", label: "Portal #" }, { key: "change_order", label: "Change order" }, { key: "amount", label: "Amount" }, { key: "sales_tax", label: "Sales Tax" }, { key: "parts_cost", label: "Parts" }, { key: "partner", label: "Partner" }, { key: "commission", label: "Commission" }]} />
      </div>
      {group ? (
        <ul className="divide-y rounded-xl border text-sm">
          {groups.map((g) => (
            <li key={g.partner} className="px-3 py-2">
              <p className="flex flex-wrap items-center gap-x-3">
                <b>{g.partner === "(none)" ? t("(no partner)") : g.partner}</b>
                <span className="text-xs text-text-2">{t("{n} proposals", { n: g.rows.length })}</span>
                <span className="ml-auto text-xs tabular-nums">
                  {money2(g.amount)} · {t("Commission")} <b>{money2(g.commission)}</b>
                </span>
              </p>
            </li>
          ))}
        </ul>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-xs text-text-2">
              <tr>
                <th className={TH}>{t("Date")}</th>
                <th className={TH}>{t("Project")}</th>
                <th className={TH}>{t("Title")}</th>
                <th className={cn(TH, "text-right")}>{t("Amount")}</th>
                <th className={cn(TH, "text-right")}>{t("Sales Tax")}</th>
                <th className={cn(TH, "text-right")}>{t("Parts")}</th>
                <th className={TH}>{t("Partner")}</th>
                <th className={cn(TH, "text-right")}>{t("Commission")}</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows.map((r) => (
                <tr key={r.id} className="hover:bg-muted/50">
                  <td className={cn(TD, "whitespace-nowrap")}>{r.date ? formatDate(r.date) : ""}</td>
                  <td className={TD}>
                    <Link href={`${hrefFor}/${r.project_id}`} className="text-primary hover:underline">
                      {r.project}
                    </Link>
                  </td>
                  <td className={TD}>
                    <Link href={`${txHref}/${r.id}`} className="hover:underline">
                      {r.description}
                    </Link>
                    <span className="ml-1 text-xs text-text-2">
                      {r.portal_number ? `#${r.portal_number}` : ""}
                      {r.is_change_order ? ` · ${t("change order")}` : ""}
                    </span>
                  </td>
                  <td className={cn(NUM, "font-medium")}>{money2(r.amount)}</td>
                  <td className={NUM}>{r.sales_tax ? money2(r.sales_tax) : ""}</td>
                  <td className={NUM}>{r.parts_cost ? money2(r.parts_cost) : ""}</td>
                  <td className={cn(TD, "text-xs")}>{r.partner ?? ""}</td>
                  <td className={NUM}>{r.commission ? money2(r.commission) : ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!rows.length && <p className="py-6 text-center text-sm text-text-2">{t("No approved proposals in this period.")}</p>}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- by client

export function ByClientTable({ groups, keys, current, from, to, hrefFor }: { groups: ClientTotals[]; keys: { key: ClientKey; label: string }[]; current: ClientKey; from: string; to: string; hrefFor: string }) {
  const t = useT();
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [q, setQ] = useState("");
  const toggle = (c: string) => setOpen((s) => (s.has(c) ? new Set([...s].filter((x) => x !== c)) : new Set([...s, c])));
  const shown = groups.filter((g) => !q.trim() || g.client.toLowerCase().includes(q.trim().toLowerCase()));
  const total = shown.reduce((a, g) => ({ approved: a.approved + g.approved, invoiced: a.invoiced + g.invoiced, paid: a.paid + g.paid, balance: a.balance + g.balance }), { approved: 0, invoiced: 0, paid: 0, balance: 0 });
  const csv = shown.flatMap((g) => [{ client: g.client, project: "", approved: g.approved, invoiced: g.invoiced, paid: g.paid, balance: g.balance }, ...g.projects.map((p) => ({ client: g.client, project: `${p.title} (#${p.id})`, approved: p.approved, invoiced: p.invoiced, paid: p.paid, balance: p.approved - p.paid }))]);
  return (
    <div>
      <PeriodForm tab="clients" from={from} to={to}>
        <label className="flex flex-col gap-1 text-xs text-text-2">
          {t("Group by")}
          <select name="by" defaultValue={current} className={cn(INPUT, "text-foreground")}>
            {keys.map((k) => (
              <option key={k.key} value={k.key}>
                {t(k.label)}
              </option>
            ))}
          </select>
        </label>
      </PeriodForm>
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("Client")} className={cn(INPUT, "w-64")} />
        <span className="ml-auto">
          <CsvButton rows={csv} name={`by-client-${from}-${to}`} columns={[{ key: "client", label: "Client" }, { key: "project", label: "Project" }, { key: "approved", label: "Approved" }, { key: "invoiced", label: "Invoiced" }, { key: "paid", label: "Paid" }, { key: "balance", label: "Balance" }]} />
        </span>
      </div>
      <p className="mb-2 text-xs text-text-2">{t("Transactions dated in the period, summed per project and grouped by the chosen client field. Tap a client to see its projects.")}</p>
      <ul className="divide-y rounded-xl border text-sm">
        {shown.map((g) => (
          <li key={g.client}>
            <button type="button" onClick={() => toggle(g.client)} className="flex min-h-11 w-full flex-wrap items-center gap-x-3 px-3 py-2 text-left hover:bg-muted/50">
              <span className="font-semibold">{g.client}</span>
              <span className="text-xs text-text-2">{t("{n} projects", { n: g.projects.length })}</span>
              <span className="ml-auto text-xs tabular-nums">
                {t("Approved")} {money(g.approved)} · {t("Paid")} <b>{money(g.paid)}</b>
                {g.balance !== 0 && <span className={g.balance > 0 ? " text-warn-fg" : ""}> · {t("Balance")} {money(g.balance)}</span>}
              </span>
            </button>
            {open.has(g.client) && (
              <ul className="bg-muted/30 px-3 pb-2 text-[13px]">
                {g.projects.map((p) => (
                  <li key={p.id} className="flex flex-wrap items-center gap-x-3 py-1">
                    <Link href={`${hrefFor}/${p.id}`} className="text-primary hover:underline">
                      {p.title}
                    </Link>
                    <span className="ml-auto text-xs tabular-nums text-text-2">
                      {money(p.approved)} · {money(p.paid)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
        {!shown.length && <li className="px-3 py-6 text-center text-text-2">{t("No transactions in this period.")}</li>}
      </ul>
      {shown.length > 0 && (
        <p className="mt-2 text-right text-xs font-semibold tabular-nums">
          {t("Total")}: {t("Approved")} {money(total.approved)} · {t("Paid")} {money(total.paid)} · {t("Balance")} {money(total.balance)}
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- P&L per project

export function PnLTable({ rows, hrefFor }: { rows: FinanceProject[]; hrefFor: string }) {
  const t = useT();
  const [q, setQ] = useState("");
  const shown = rows.filter((r) => r.approved > 0 && (!q.trim() || [r.title, r.owner, r.owner_org].some((x) => (x ?? "").toLowerCase().includes(q.trim().toLowerCase())))).sort((a, b) => b.approved - a.approved);
  const tot = shown.reduce((a, r) => ({ approved: a.approved + r.approved, tax: a.tax + r.salesTax, parts: a.parts + r.parts, commission: a.commission + r.commission, profit: a.profit + r.profit }), { approved: 0, tax: 0, parts: 0, commission: 0, profit: 0 });
  const csv = shown.map((r) => ({ project: r.title, client: r.owner ?? r.owner_org ?? "", approved: r.approved, sales_tax: r.salesTax, parts: r.parts, labor: "", commission: r.commission, profit: r.profit, margin_pct: r.marginPct ?? "" }));
  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("Project or client")} className={cn(INPUT, "w-64")} />
        <span className="flex items-center gap-1 text-xs text-warn-fg">
          <TriangleAlert className="size-3.5" aria-hidden /> {t("no labor yet")}
        </span>
        <span className="ml-auto">
          <CsvButton rows={csv} name="pnl-projects" columns={[{ key: "project", label: "Project" }, { key: "client", label: "Client" }, { key: "approved", label: "Approved" }, { key: "sales_tax", label: "Sales Tax" }, { key: "parts", label: "Parts" }, { key: "labor", label: "Labor" }, { key: "commission", label: "Commission" }, { key: "profit", label: "Profit" }, { key: "margin_pct", label: "Margin %" }]} />
        </span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="text-xs text-text-2">
            <tr>
              <th className={TH}>{t("Project")}</th>
              <th className={cn(TH, "text-right")}>{t("Approved")}</th>
              <th className={cn(TH, "text-right")}>{t("Sales Tax")}</th>
              <th className={cn(TH, "text-right")}>{t("Parts")}</th>
              <th className={cn(TH, "text-right")}>{t("Labor")}</th>
              <th className={cn(TH, "text-right")}>{t("Commission")}</th>
              <th className={cn(TH, "text-right")}>{t("Profit")}</th>
              <th className={cn(TH, "text-right")}>{t("Margin %")}</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {shown.map((r) => (
              <tr key={r.id} className="hover:bg-muted/50">
                <td className={TD}>
                  <Link href={`${hrefFor}/${r.id}`} className="text-primary hover:underline">
                    {r.title}
                  </Link>
                  <span className="block text-xs text-text-2">{[r.owner, r.owner_org].filter(Boolean).join(" · ")}</span>
                </td>
                <td className={NUM}>{money2(r.approved)}</td>
                <td className={NUM}>{r.salesTax ? money2(r.salesTax) : ""}</td>
                <td className={NUM}>{r.parts ? money2(r.parts) : ""}</td>
                <td className={cn(NUM, "text-text-2")}>—</td>
                <td className={NUM}>{r.commission ? money2(r.commission) : ""}</td>
                <td className={cn(NUM, "font-semibold", r.profit < 0 && "text-bad-fg")}>{money2(r.profit)}</td>
                <td className={cn(NUM, r.marginPct !== null && r.marginPct < 20 && "text-warn-fg")}>{pct(r.marginPct)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot className="text-xs font-semibold">
            <tr>
              <td className={TD}>{t("{n} projects", { n: shown.length })}</td>
              <td className={NUM}>{money2(tot.approved)}</td>
              <td className={NUM}>{money2(tot.tax)}</td>
              <td className={NUM}>{money2(tot.parts)}</td>
              <td className={NUM}>—</td>
              <td className={NUM}>{money2(tot.commission)}</td>
              <td className={NUM}>{money2(tot.profit)}</td>
              <td className={NUM}>{tot.approved ? `${Math.round((tot.profit / tot.approved) * 1000) / 10}%` : "—"}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
