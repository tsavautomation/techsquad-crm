"use client";

import { Fragment, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { useT } from "@/i18n/client";
import { markPurchasedAction } from "@/lib/purchasing/actions";
import { lineCost, productLabel, type MaterialRow } from "@/lib/purchasing/materials";
import { CsvButton } from "./csv-button";

// PU-a: Administrative › Purchasing › To buy. Every line still to buy over the projects in scope, grouped by project
// or by manufacturer, with a checkbox per line and "Mark purchased" for the ticked ones. CSV too.

const money = (n: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);
const TD = "px-2 py-2";
const CHIP = "inline-flex min-h-9 items-center rounded-full border px-3 text-sm";

export function ToBuyList({ rows, hrefFor }: { rows: MaterialRow[]; hrefFor: string }) {
  const t = useT();
  const router = useRouter();
  const [by, setBy] = useState<"project" | "brand">("project");
  const [q, setQ] = useState("");
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const [pending, start] = useTransition();
  const shown = rows.filter((m) => !q.trim() || [m.project, m.brand, m.model, m.name].join(" ").toLowerCase().includes(q.trim().toLowerCase()));
  const groups = shown.reduce<{ key: string; href: string | null; sub: string; lines: MaterialRow[]; cost: number }[]>((acc, m) => {
    const key = by === "project" ? m.project ?? `Project #${m.project_id}` : m.brand?.trim() || t("(no brand)");
    const g = acc.find((x) => x.key === key) ?? (acc.push({ key, href: by === "project" ? `${hrefFor}/${m.project_id}#materials` : null, sub: by === "project" ? (m.job_status ?? "") : "", lines: [], cost: 0 }), acc[acc.length - 1]);
    g.lines.push(m);
    g.cost = Math.round((g.cost + lineCost(m)) * 100) / 100;
    return acc;
  }, []).sort((a, b) => b.cost - a.cost);
  const total = shown.reduce((n, m) => n + lineCost(m), 0);
  const toggle = (id: number) => setPicked((p) => {
    const n = new Set(p);
    if (n.has(id)) n.delete(id);
    else n.add(id);
    return n;
  });
  const toggleGroup = (lines: MaterialRow[]) => setPicked((p) => {
    const n = new Set(p);
    const all = lines.every((l) => n.has(l.id));
    lines.forEach((l) => (all ? n.delete(l.id) : n.add(l.id)));
    return n;
  });
  const mark = () =>
    start(async () => {
      const r = await markPurchasedAction([...picked]);
      if (!r.ok) toast.error(t(r.message));
      else {
        toast.success(t("{n} lines marked purchased.", { n: r.n }));
        setPicked(new Set());
        router.refresh();
      }
    });
  const csv = shown.map((m) => ({ project: m.project, job_status: m.job_status ?? "", brand: m.brand ?? "", model: m.model ?? "", description: m.name ?? "", supplier: m.supplier ?? "", quantity: m.quantity, on_hand: m.on_hand, unit_cost: m.unit_cost ?? "", line_cost: lineCost(m), proposal: m.proposal_number ?? "" }));

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center gap-2">
        {(["project", "brand"] as const).map((k) => (
          <button key={k} type="button" onClick={() => setBy(k)} className={cn(CHIP, by === k && "border-primary bg-primary text-primary-foreground")}>
            {k === "project" ? t("By project") : t("By manufacturer")}
          </button>
        ))}
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("Project, brand or model")} className="h-11 w-56 rounded-[10px] border bg-background px-3 text-base" />
        <span className="ml-auto flex items-center gap-2">
          <button type="button" disabled={!picked.size || pending} onClick={mark} className={cn(CHIP, "min-h-11 gap-1 border-ok-fg/30 text-ok-fg disabled:opacity-50")}>
            <Check className="size-4" aria-hidden /> {t("Mark purchased ({n})", { n: picked.size })}
          </button>
          <CsvButton rows={csv} name="to-buy" columns={[{ key: "project", label: "Project" }, { key: "job_status", label: "Job Status" }, { key: "brand", label: "Brand" }, { key: "model", label: "Model" }, { key: "description", label: "Description" }, { key: "supplier", label: "Supplier" }, { key: "quantity", label: "Qty" }, { key: "on_hand", label: "In stock" }, { key: "unit_cost", label: "Unit cost" }, { key: "line_cost", label: "Cost" }, { key: "proposal", label: "Proposal" }]} />
        </span>
      </div>
      <p className="mb-3 text-xs text-text-2">{t("{n} lines to buy over {p} projects · {c}", { n: shown.length, p: new Set(shown.map((m) => m.project_id)).size, c: money(total) })} · {t("A line leaves this list when it is marked purchased, replaced or removed on the project, or when the stock covers it.")}</p>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <tbody>
            {groups.map((g) => (
              <Fragment key={g.key}>
                <tr className="border-t bg-muted/40">
                  <td className={cn(TD, "w-8")}>
                    <input type="checkbox" aria-label={t("Select all of {x}", { x: g.key })} checked={g.lines.every((l) => picked.has(l.id))} onChange={() => toggleGroup(g.lines)} className="size-5" />
                  </td>
                  <td colSpan={3} className={cn(TD, "font-semibold")}>
                    {g.href ? (
                      <Link href={g.href} className="text-primary hover:underline">
                        {g.key}
                      </Link>
                    ) : (
                      g.key
                    )}
                    <span className="ml-2 text-xs font-normal text-text-2">
                      {g.sub ? `${g.sub} · ` : ""}
                      {t("{n} lines", { n: g.lines.length })}
                    </span>
                  </td>
                  <td className={cn(TD, "text-right tabular-nums font-semibold")}>{money(g.cost)}</td>
                </tr>
                {g.lines.map((m) => (
                  <tr key={m.id} className="border-t">
                    <td className={TD}>
                      <input type="checkbox" aria-label={productLabel(m)} checked={picked.has(m.id)} onChange={() => toggle(m.id)} className="size-5" />
                    </td>
                    <td className={TD}>
                      {productLabel(m) || m.name}
                      <span className="block max-w-[360px] truncate text-xs text-text-2">
                        {by === "brand" ? `${m.project} · ` : ""}
                        {m.name && productLabel(m) !== m.name ? m.name : ""}
                        {m.supplier ? ` · ${m.supplier}` : ""}
                        {m.on_hand > 0 ? ` · ${t("only {n} in stock", { n: m.on_hand })}` : ""}
                      </span>
                    </td>
                    <td className={cn(TD, "text-right tabular-nums")}>{m.quantity}</td>
                    <td className={cn(TD, "text-right tabular-nums")}>{m.unit_cost === null ? "—" : money(m.unit_cost)}</td>
                    <td className={cn(TD, "text-right tabular-nums font-medium")}>{m.unit_cost === null ? "—" : money(lineCost(m))}</td>
                  </tr>
                ))}
              </Fragment>
            ))}
            {!groups.length && (
              <tr>
                <td colSpan={5} className="py-6 text-center text-text-2">
                  {t("Nothing to buy for these projects.")}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
