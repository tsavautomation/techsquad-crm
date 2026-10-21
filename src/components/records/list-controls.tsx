"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Search, SlidersHorizontal, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useT } from "@/i18n/client";
import type { FieldDef } from "@/registry/types";
import { LookupPicker } from "./lookup-picker";

export type ListFilter = {
  name: string;
  label: string;
  kind: "select" | "boolean" | "lookup" | "date";
  options?: { label: string; value: string }[];
  /** Lookups: the registry field, for the search picker. */
  field?: FieldDef;
  /** One of the table's quick filters: also shown inline on wide screens. */
  quick?: boolean;
};

type Props = {
  table: string;
  filters: ListFilter[];
  /** Names of the linked records currently picked as filters: field → (id → title). */
  labels: Record<string, Record<string, string>>;
};

/** "2026-10-21" → "10/21/2026" for the chips. */
const mdy = (d: string) => (/^\d{4}-\d{2}-\d{2}$/.test(d) ? `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}/${d.slice(0, 4)}` : d);

/**
 * Search box (applies as you type, after a short pause), the archived toggle and the filters (SPEC §9.1 J-p):
 * the quick dropdowns inline on wide screens, every filter in a panel behind the Filters button, the active
 * ones as chips with × and Clear all. Filters combine (all must match) and live in the address, so a filtered
 * list can be shared or reopened.
 */
export function ListControls({ table, filters, labels }: Props) {
  const tr = useT();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [q, setQ] = useState(params.get("q") ?? "");
  const [open, setOpen] = useState(false);

  function apply(changes: Record<string, string | null>) {
    const next = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(changes)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    next.delete("page");
    router.replace(`${pathname}${next.size ? `?${next}` : ""}`, { scroll: false });
  }

  useEffect(() => {
    if (q === (params.get("q") ?? "")) return;
    const t = setTimeout(() => apply({ q: q.trim() || null }), 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const value = (k: string) => params.get(`f.${k}`) ?? "";
  const archived = params.get("archived") === "1";
  const box = "h-11 rounded-lg border border-input bg-card px-3 text-base md:text-sm";

  /** What is set right now, as chips: one per value (a date range gives up to two). */
  const chips = filters.flatMap((f) => {
    if (f.kind === "date")
      return (["from", "to"] as const).flatMap((end) => {
        const v = value(`${f.name}.${end}`);
        return v ? [{ key: `f.${f.name}.${end}`, text: `${f.label} ${tr(end === "from" ? "from {date}" : "to {date}", { date: mdy(v) })}` }] : [];
      });
    const v = value(f.name);
    if (!v) return [];
    const yes = v === "true";
    const shown = f.kind === "boolean" ? tr(yes ? "Yes" : "No") : f.kind === "lookup" ? (labels[f.name]?.[v] ?? `#${v}`) : (f.options?.find((o) => o.value === v)?.label ?? v);
    return [{ key: `f.${f.name}`, text: `${f.label}: ${shown}` }];
  });
  const clearAll = () => apply(Object.fromEntries([...params.keys()].filter((k) => k.startsWith("f.")).map((k) => [k, null])));

  const selectInput = (f: ListFilter, allLabel: string, className?: string) => (
    <select aria-label={f.label} className={cn(box, "w-full", className)} value={value(f.name)} onChange={(e) => apply({ [`f.${f.name}`]: e.target.value || null })}>
      <option value="">{allLabel}</option>
      {(f.kind === "boolean" ? [{ label: tr("Yes"), value: "true" }, { label: tr("No"), value: "false" }] : (f.options ?? [])).map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );

  return (
    <div className="mb-4 flex flex-col gap-2">
      <div className="flex flex-col gap-2 md:flex-row md:flex-wrap md:items-center">
        <label className="relative md:w-72">
          <span className="sr-only">{tr("Search")}</span>
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <input type="search" placeholder={tr("Search names, projects, people, text…")} value={q} onChange={(e) => setQ(e.target.value)} className={cn(box, "w-full pl-9")} />
        </label>
        <div className="flex flex-wrap gap-2">
          {filters
            .filter((f) => f.quick && (f.kind === "select" || f.kind === "boolean"))
            .map((f) => (
              <div key={f.name} className="hidden md:block">
                {selectInput(f, tr("{label}: all", { label: f.label }), "w-auto")}
              </div>
            ))}
          <button
            type="button"
            aria-expanded={open}
            onClick={() => setOpen((o) => !o)}
            className={cn(box, "inline-flex items-center gap-1.5 text-sm", (open || chips.length > 0) && "border-foreground")}
          >
            <SlidersHorizontal className="size-4" aria-hidden />
            {tr("Filters")}
            {chips.length > 0 && <span className="inline-flex min-w-5 items-center justify-center rounded-full bg-foreground px-1.5 text-xs font-semibold text-background">{chips.length}</span>}
          </button>
          <button
            type="button"
            aria-pressed={archived}
            onClick={() => apply({ archived: archived ? null : "1" })}
            className={cn(box, "text-sm", archived && "border-foreground bg-foreground text-background")}
          >
            {tr(archived ? "Showing archived" : "Archived")}
          </button>
        </div>
      </div>

      {open && (
        <div className="rounded-2xl border bg-card p-3 shadow-card">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {filters.map((f) => (
              <label key={f.name} className="block text-sm font-medium">
                {f.label}
                {f.kind === "date" ? (
                  <div className="mt-1 grid grid-cols-2 gap-2">
                    <input type="date" aria-label={`${f.label}: ${tr("From")}`} className={cn(box, "w-full")} value={value(`${f.name}.from`)} onChange={(e) => apply({ [`f.${f.name}.from`]: e.target.value || null })} />
                    <input type="date" aria-label={`${f.label}: ${tr("To")}`} className={cn(box, "w-full")} value={value(`${f.name}.to`)} onChange={(e) => apply({ [`f.${f.name}.to`]: e.target.value || null })} />
                  </div>
                ) : f.kind === "lookup" && f.field ? (
                  <div className="mt-1">
                    <LookupPicker
                      table={table}
                      field={{ ...f.field, multiple: false, required: false }}
                      value={value(f.name) ? Number(value(f.name)) : null}
                      onChange={(v) => apply({ [`f.${f.name}`]: v ? String(v) : null })}
                      form={{}}
                      labels={labels[f.name] ?? {}}
                      onAutofill={() => {}}
                    />
                  </div>
                ) : (
                  <div className="mt-1">{selectInput(f, tr("All"))}</div>
                )}
              </label>
            ))}
          </div>
          <div className="mt-3 flex flex-wrap justify-end gap-2">
            {chips.length > 0 && (
              <button type="button" onClick={clearAll} className={cn(box, "text-sm")}>
                {tr("Clear all")}
              </button>
            )}
            <button type="button" onClick={() => setOpen(false)} className={cn(box, "border-foreground bg-foreground text-sm text-background")}>
              {tr("Close")}
            </button>
          </div>
        </div>
      )}

      {chips.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          {chips.map((c) => (
            <span key={c.key} className="inline-flex min-h-9 items-center gap-1 rounded-full border bg-card py-1 pr-1 pl-3">
              {c.text}
              <button type="button" onClick={() => apply({ [c.key]: null })} aria-label={tr("Remove")} className="inline-flex size-7 items-center justify-center rounded-full text-muted-foreground hover:bg-muted">
                <X className="size-3.5" aria-hidden />
              </button>
            </span>
          ))}
          <button type="button" onClick={clearAll} className="min-h-9 px-2 underline underline-offset-4">
            {tr("Clear all")}
          </button>
        </div>
      )}
    </div>
  );
}
