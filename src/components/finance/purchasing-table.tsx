"use client";

import { useState } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { useT } from "@/i18n/client";
import { groupItems, groupLines, type GroupKey, type PurchaseItem } from "@/lib/finance/purchasing";
import { CsvButton } from "./csv-button";

// FIN-p: Finance › Purchasing. How much the open projects still need from each manufacturer (or supplier, or type),
// from the proposals' lines; a group opens into its lines by project. Everything downloads as CSV.

const money = (n: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
const money2 = (n: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);
const TH = "px-2 py-2 font-medium";
const TD = "px-2 py-2";
const CHIP = "inline-flex min-h-9 items-center rounded-full border px-3 text-sm";

export function PurchasingTable({ rows, scope, hrefFor }: { rows: PurchaseItem[]; scope: "open" | "all"; hrefFor: string }) {
  const t = useT();
  const [by, setBy] = useState<GroupKey>("brand");
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const groups = groupItems(rows, by).filter((g) => !q.trim() || g.key.toLowerCase().includes(q.trim().toLowerCase()));
  const tot = groups.reduce((a, g) => ({ cost: a.cost + g.cost, sell: a.sell + g.sell, msrp: a.msrp + g.msrp, items: a.items + g.items }), { cost: 0, sell: 0, msrp: 0, items: 0 });
  const projects = new Set(rows.map((r) => r.project_id)).size;
  const lines = open ? groupLines(rows, by, open) : [];
  const csvGroups = groups.map((g) => ({ group: g.key, projects: g.projects, items: g.items, quantity: g.quantity, cost: g.cost, msrp: g.msrp, sell: g.sell, without_cost: g.withoutCost }));
  const csvLines = lines.map((l) => ({ project: l.project, job_status: l.job_status ?? "", brand: l.brand ?? "", model: l.model ?? "", description: l.name ?? "", supplier: l.supplier ?? "", quantity: l.quantity, unit_cost: l.cost ?? "", line_cost: l.line_cost, msrp: l.msrp ?? "", sell_price: l.sell_price ?? "" }));
  const label = (k: GroupKey) => (k === "brand" ? t("Manufacturer") : k === "supplier" ? t("Supplier") : t("Type"));

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <Link href="/administrative/finance?tab=purchasing" className={cn(CHIP, scope === "open" && "border-primary bg-primary text-primary-foreground")}>
          {t("Approved and under way")}
        </Link>
        <Link href="/administrative/finance?tab=purchasing&scope=all" className={cn(CHIP, scope === "all" && "border-primary bg-primary text-primary-foreground")}>
          {t("Complete and ON HOLD too")}
        </Link>
        <span className="mx-1 text-text-2">·</span>
        {(["brand", "supplier", "type"] as GroupKey[]).map((k) => (
          <button key={k} type="button" onClick={() => (setBy(k), setOpen(null))} className={cn(CHIP, by === k && "border-primary bg-primary text-primary-foreground")}>
            {label(k)}
          </button>
        ))}
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={label(by)} className="h-11 w-48 rounded-[10px] border bg-background px-3 text-base" />
        <span className="ml-auto">
          <CsvButton rows={csvGroups} name={`purchasing-${by}-${scope}`} columns={[{ key: "group", label: label(by) }, { key: "projects", label: "Projects" }, { key: "items", label: "Lines" }, { key: "quantity", label: "Quantity" }, { key: "cost", label: "Cost" }, { key: "msrp", label: "MSRP" }, { key: "sell", label: "Sell" }, { key: "without_cost", label: "Lines without cost" }]} />
        </span>
      </div>
      <p className="mb-3 text-xs text-text-2">
        {t("{n} projects · {i} equipment and material lines · cost to buy {c} · MSRP {m} · sold for {s}", { n: projects, i: tot.items, c: money(tot.cost), m: money(tot.msrp), s: money(tot.sell) })}
        {" · "}
        {t("Cost = unit cost × quantity as Portal.io has it; lines without a cost are counted apart. Labor and fee lines stay out.")}
      </p>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="text-xs text-text-2">
            <tr>
              <th className={TH}>{label(by)}</th>
              <th className={cn(TH, "text-right")}>{t("Projects")}</th>
              <th className={cn(TH, "text-right")}>{t("Lines")}</th>
              <th className={cn(TH, "text-right")}>{t("Qty")}</th>
              <th className={cn(TH, "text-right")}>{t("Cost")}</th>
              <th className={cn(TH, "text-right")}>MSRP</th>
              <th className={cn(TH, "text-right")}>{t("Sold for")}</th>
            </tr>
          </thead>
          <tbody>
            {groups.map((g) => (
              <tr key={g.key} className={cn("border-t", open === g.key && "bg-muted/50")}>
                <td className={TD}>
                  <button type="button" onClick={() => setOpen(open === g.key ? null : g.key)} className="text-left text-primary hover:underline">
                    {g.key}
                  </button>
                  {g.withoutCost ? <span className="ml-1 text-xs text-warn-fg">{t("{n} without cost", { n: g.withoutCost })}</span> : null}
                </td>
                <td className={cn(TD, "text-right tabular-nums")}>{g.projects}</td>
                <td className={cn(TD, "text-right tabular-nums")}>{g.items}</td>
                <td className={cn(TD, "text-right tabular-nums")}>{g.quantity}</td>
                <td className={cn(TD, "text-right tabular-nums font-medium")}>{money2(g.cost)}</td>
                <td className={cn(TD, "text-right tabular-nums")}>{money2(g.msrp)}</td>
                <td className={cn(TD, "text-right tabular-nums")}>{money2(g.sell)}</td>
              </tr>
            ))}
            {!groups.length && (
              <tr>
                <td colSpan={7} className="py-6 text-center text-text-2">
                  {t("No proposal lines for these projects yet (they come with the Portal.io sync).")}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {open && (
        <div className="mt-4 rounded-xl border px-3 py-2">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-semibold">
              {open} · {t("{n} lines", { n: lines.length })}
            </h3>
            <span className="ml-auto">
              <CsvButton rows={csvLines} name={`purchasing-${open}`} columns={[{ key: "project", label: "Project" }, { key: "job_status", label: "Job Status" }, { key: "brand", label: "Brand" }, { key: "model", label: "Model" }, { key: "description", label: "Description" }, { key: "supplier", label: "Supplier" }, { key: "quantity", label: "Qty" }, { key: "unit_cost", label: "Unit cost" }, { key: "line_cost", label: "Cost" }, { key: "msrp", label: "MSRP" }, { key: "sell_price", label: "Sell price" }]} />
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-xs text-text-2">
                <tr>
                  <th className={TH}>{t("Project")}</th>
                  <th className={TH}>{t("Model")}</th>
                  <th className={TH}>{t("Supplier")}</th>
                  <th className={cn(TH, "text-right")}>{t("Qty")}</th>
                  <th className={cn(TH, "text-right")}>{t("Unit cost")}</th>
                  <th className={cn(TH, "text-right")}>{t("Cost")}</th>
                  <th className={cn(TH, "text-right")}>MSRP</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((l) => (
                  <tr key={l.id} className="border-t">
                    <td className={TD}>
                      <Link href={`${hrefFor}/${l.project_id}#finance`} className="text-primary hover:underline">
                        {l.project}
                      </Link>
                      <span className="block text-xs text-text-2">{l.job_status}</span>
                    </td>
                    <td className={TD}>
                      {[l.brand, l.model].filter(Boolean).join(" ")}
                      <span className="block max-w-[320px] truncate text-xs text-text-2">{l.name}</span>
                    </td>
                    <td className={cn(TD, "text-xs")}>{l.supplier}</td>
                    <td className={cn(TD, "text-right tabular-nums")}>{l.quantity}</td>
                    <td className={cn(TD, "text-right tabular-nums")}>{l.cost === null ? "—" : money2(l.cost)}</td>
                    <td className={cn(TD, "text-right tabular-nums font-medium")}>{money2(l.line_cost)}</td>
                    <td className={cn(TD, "text-right tabular-nums")}>{l.msrp === null ? "—" : money2(l.msrp)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
