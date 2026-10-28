"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Download } from "lucide-react";
import type { ClientKey, ClientTotals, FinanceProject, PaymentStatus } from "@/lib/finance/load";
import { formatDate } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { useT } from "@/i18n/client";

// PI-h (SPEC §9.1): Administrative › Finance › Projects (filter by payment status, client, text) and By client
// (grouped totals in a date range, CSV). Figures arrive computed from the server; nothing here stores anything.

const money = (n: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
const TONE: Record<string, string> = { Paid: "bg-ok-bg text-ok-fg", Current: "bg-info-bg text-info-fg", Overdue: "bg-bad-bg text-bad-fg", "No data": "bg-muted text-text-2" };
const STATUSES: PaymentStatus[] = ["Overdue", "Current", "Paid", "No data"];
const INPUT = "h-11 rounded-[10px] border bg-background px-3 text-base";

export function StatusPill({ status }: { status: string }) {
  const t = useT();
  return <span className={cn("inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap", TONE[status] ?? TONE["No data"])}>{t(status)}</span>;
}

export function ProjectsTable({ rows, hrefFor }: { rows: FinanceProject[]; hrefFor: string }) {
  const t = useT();
  const [status, setStatus] = useState<"All" | PaymentStatus>("All");
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<{ key: keyof FinanceProject; dir: 1 | -1 }>({ key: "title", dir: 1 });
  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const list = rows.filter((r) => (status === "All" || r.status === status) && (!needle || [r.title, r.owner, r.owner_org, r.design_firm, r.general_contractor, r.builder].some((x) => (x ?? "").toLowerCase().includes(needle))));
    return list.sort((a, b) => {
      const va = a[sort.key] ?? "";
      const vb = b[sort.key] ?? "";
      return (typeof va === "number" && typeof vb === "number" ? va - vb : String(va).localeCompare(String(vb))) * sort.dir;
    });
  }, [rows, status, q, sort]);
  const counts = useMemo(() => Object.fromEntries(STATUSES.map((s) => [s, rows.filter((r) => r.status === s).length])) as Record<PaymentStatus, number>, [rows]);
  const totals = shown.reduce((a, r) => ({ approved: a.approved + r.approved, invoiced: a.invoiced + r.invoiced, paid: a.paid + r.paid, balance: a.balance + r.balance }), { approved: 0, invoiced: 0, paid: 0, balance: 0 });
  const th = (label: string, key: keyof FinanceProject, right?: boolean) => (
    <th className={cn("px-2 py-1.5 font-medium", right && "text-right")}>
      <button type="button" onClick={() => setSort((s) => ({ key, dir: s.key === key ? ((s.dir * -1) as 1 | -1) : 1 }))} className="hover:underline">
        {label}
        {sort.key === key ? (sort.dir === 1 ? " ↑" : " ↓") : ""}
      </button>
    </th>
  );

  return (
    <div>
      <div className="mb-3 flex flex-col gap-2 md:flex-row md:items-center">
        <div className="flex flex-wrap gap-1.5">
          {(["All", ...STATUSES] as const).map((s) => (
            <button key={s} type="button" onClick={() => setStatus(s)} className={cn("min-h-9 rounded-full border px-3 text-xs font-medium", status === s ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted")}>
              {t(s)} <span className="opacity-70">{s === "All" ? rows.length : counts[s]}</span>
            </button>
          ))}
        </div>
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("Project or client")} className={cn(INPUT, "md:ml-auto md:w-64")} />
      </div>
      {/* Cards on phones, a table from md up. */}
      <ul className="flex flex-col gap-2 md:hidden">
        {shown.map((r) => (
          <li key={r.id} className="rounded-xl border px-3 py-2 text-sm">
            <div className="flex items-start justify-between gap-2">
              <Link href={`${hrefFor}/${r.id}`} className="font-semibold text-primary hover:underline">
                {r.title}
              </Link>
              <StatusPill status={r.status} />
            </div>
            <p className="text-xs text-text-2">{[r.owner, r.owner_org].filter(Boolean).join(" · ")}</p>
            <p className="mt-1 text-xs">
              {t("Approved")} {money(r.approved)} · {t("Invoiced")} {money(r.invoiced)} · {t("Paid")} {money(r.paid)} · <b>{t("Balance")} {money(r.balance)}</b>
              {r.next_due ? ` · ${t("Next due")} ${formatDate(r.next_due)}` : ""}
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
              {th(t("Invoiced"), "invoiced", true)}
              {th(t("Paid"), "paid", true)}
              {th(t("Balance"), "balance", true)}
              {th(t("Next due"), "next_due")}
              {th(t("Status"), "status")}
            </tr>
          </thead>
          <tbody className="divide-y">
            {shown.map((r) => (
              <tr key={r.id} className="hover:bg-muted/50">
                <td className="px-2 py-1.5">
                  <Link href={`${hrefFor}/${r.id}`} className="font-medium text-primary hover:underline">
                    {r.title}
                  </Link>
                </td>
                <td className="px-2 py-1.5 text-text-2">{[r.owner, r.owner_org].filter(Boolean).join(" · ")}</td>
                <td className="px-2 py-1.5 text-right tabular-nums">{money(r.approved)}</td>
                <td className="px-2 py-1.5 text-right tabular-nums">{money(r.invoiced)}</td>
                <td className="px-2 py-1.5 text-right tabular-nums">{money(r.paid)}</td>
                <td className={cn("px-2 py-1.5 text-right font-semibold tabular-nums", r.balance > 0 && "text-warn-fg")}>{money(r.balance)}</td>
                <td className="px-2 py-1.5 whitespace-nowrap">{r.next_due ? formatDate(r.next_due) : ""}</td>
                <td className="px-2 py-1.5">
                  <StatusPill status={r.status} />
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot className="text-xs font-semibold">
            <tr>
              <td className="px-2 py-1.5" colSpan={2}>
                {t("{n} projects", { n: shown.length })}
              </td>
              <td className="px-2 py-1.5 text-right tabular-nums">{money(totals.approved)}</td>
              <td className="px-2 py-1.5 text-right tabular-nums">{money(totals.invoiced)}</td>
              <td className="px-2 py-1.5 text-right tabular-nums">{money(totals.paid)}</td>
              <td className="px-2 py-1.5 text-right tabular-nums">{money(totals.balance)}</td>
              <td colSpan={2} />
            </tr>
          </tfoot>
        </table>
      </div>
      {!shown.length && <p className="py-6 text-center text-sm text-text-2">{t("No project matches.")}</p>}
    </div>
  );
}

export function ByClientTable({ groups, keys, current, from, to, hrefFor }: { groups: ClientTotals[]; keys: { key: ClientKey; label: string }[]; current: ClientKey; from: string; to: string; hrefFor: string }) {
  const t = useT();
  const [open, setOpen] = useState<Set<string>>(new Set());
  const toggle = (c: string) => setOpen((s) => (s.has(c) ? new Set([...s].filter((x) => x !== c)) : new Set([...s, c])));
  const total = groups.reduce((a, g) => ({ approved: a.approved + g.approved, invoiced: a.invoiced + g.invoiced, paid: a.paid + g.paid, balance: a.balance + g.balance }), { approved: 0, invoiced: 0, paid: 0, balance: 0 });
  const csv = () => {
    const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const lines = [["Client", "Project", "Approved", "Invoiced", "Paid", "Balance"].map(esc).join(",")];
    for (const g of groups) {
      lines.push([g.client, "", g.approved.toFixed(2), g.invoiced.toFixed(2), g.paid.toFixed(2), g.balance.toFixed(2)].map(esc).join(","));
      for (const p of g.projects) lines.push([g.client, `${p.title} (#${p.id})`, p.approved.toFixed(2), p.invoiced.toFixed(2), p.paid.toFixed(2), (p.invoiced - p.paid).toFixed(2)].map(esc).join(","));
    }
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([`﻿${lines.join("\r\n")}`], { type: "text/csv;charset=utf-8" }));
    a.download = `finance-by-client-${from || "start"}-${to || "today"}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <div>
      <form method="get" className="mb-3 flex flex-col gap-2 md:flex-row md:flex-wrap md:items-end">
        <input type="hidden" name="tab" value="clients" />
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
        <button type="button" onClick={csv} disabled={!groups.length} className="inline-flex h-11 items-center gap-1.5 rounded-[10px] border px-4 text-sm font-medium hover:bg-muted disabled:opacity-50 md:ml-auto">
          <Download className="size-4" aria-hidden /> {t("Download CSV")}
        </button>
      </form>
      <p className="mb-2 text-xs text-text-2">{t("Transactions dated in the period, summed per project and grouped by the chosen client field. Tap a client to see its projects.")}</p>
      <ul className="divide-y rounded-xl border text-sm">
        {groups.map((g) => (
          <li key={g.client}>
            <button type="button" onClick={() => toggle(g.client)} className="flex min-h-11 w-full flex-wrap items-center gap-x-3 px-3 py-2 text-left hover:bg-muted/50">
              <span className="font-semibold">{g.client}</span>
              <span className="text-xs text-text-2">{t("{n} projects", { n: g.projects.length })}</span>
              <span className="ml-auto text-xs tabular-nums">
                {t("Approved")} {money(g.approved)} · {t("Invoiced")} {money(g.invoiced)} · {t("Paid")} <b>{money(g.paid)}</b>
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
                      {money(p.approved)} · {money(p.invoiced)} · {money(p.paid)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
        {!groups.length && <li className="px-3 py-6 text-center text-text-2">{t("No transactions in this period.")}</li>}
      </ul>
      {groups.length > 0 && (
        <p className="mt-2 text-right text-xs font-semibold tabular-nums">
          {t("Total")}: {t("Approved")} {money(total.approved)} · {t("Invoiced")} {money(total.invoiced)} · {t("Paid")} {money(total.paid)} · {t("Balance")} {money(total.balance)}
        </p>
      )}
    </div>
  );
}
