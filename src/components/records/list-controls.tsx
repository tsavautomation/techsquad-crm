"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Search } from "lucide-react";
import { cn } from "@/lib/utils";

type Filter = { name: string; label: string; options: { label: string; value: string }[] };

/** Search box (applies as you type, after a short pause), quick filters and the archived toggle. */
export function ListControls({ filters }: { filters: Filter[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [q, setQ] = useState(params.get("q") ?? "");

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

  const archived = params.get("archived") === "1";
  const box = "h-11 rounded-lg border border-input bg-background px-3 text-base md:text-sm";

  return (
    <div className="mb-4 flex flex-col gap-2 md:flex-row md:flex-wrap md:items-center">
      <label className="relative md:w-72">
        <span className="sr-only">Search</span>
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <input type="search" placeholder="Search by name…" value={q} onChange={(e) => setQ(e.target.value)} className={cn(box, "w-full pl-9")} />
      </label>
      <div className="flex flex-wrap gap-2">
        {filters.map((f) => (
          <select
            key={f.name}
            aria-label={f.label}
            className={box}
            value={params.get(`f.${f.name}`) ?? ""}
            onChange={(e) => apply({ [`f.${f.name}`]: e.target.value || null })}
          >
            <option value="">{f.label}: all</option>
            {f.options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        ))}
        <button
          type="button"
          aria-pressed={archived}
          onClick={() => apply({ archived: archived ? null : "1" })}
          className={cn(box, "text-sm", archived && "border-foreground bg-foreground text-background")}
        >
          {archived ? "Showing archived" : "Archived"}
        </button>
      </div>
    </div>
  );
}
