"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, Search, X } from "lucide-react";
import { searchChoicesAction, type Choice } from "@/lib/records/field-actions";
import { useT } from "@/i18n/client";

/** TS-b: a small search-as-you-type job picker for a shift (the projects list, through the Visit form's Project field). */
export function ProjectPicker({ value, label, onChange }: { value: number | null; label: string | null; onChange: (id: number | null, label: string | null) => void }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Choice[]>([]);
  const [loading, setLoading] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef(0);

  function search(q: string, delay = 250) {
    if (timer.current) clearTimeout(timer.current);
    setLoading(true);
    timer.current = setTimeout(async () => {
      const ticket = ++latest.current;
      try {
        const r = await searchChoicesAction("visits", "project_id", q, {});
        if (ticket === latest.current) setResults(r);
      } finally {
        if (ticket === latest.current) setLoading(false);
      }
    }, delay);
  }
  useEffect(() => {
    if (open) input.current?.focus();
  }, [open]);
  function openPicker() {
    setOpen(true);
    search("", 0);
  }

  if (value !== null && !open)
    return (
      <span className="inline-flex h-11 max-w-full items-center gap-1 rounded-[10px] border bg-background pl-3 text-sm">
        <span className="truncate">{label ?? `#${value}`}</span>
        <button type="button" onClick={() => onChange(null, null)} className="inline-flex size-10 shrink-0 items-center justify-center rounded-[10px] hover:bg-muted" aria-label={t("Clear the job")}>
          <X className="size-4" aria-hidden />
        </button>
      </span>
    );

  if (!open)
    return (
      <button type="button" onClick={openPicker} className="flex h-11 w-full items-center gap-2 rounded-[10px] border bg-background px-3 text-left text-sm text-muted-foreground">
        <Search className="size-4" aria-hidden />
        {t("Job…")}
      </button>
    );

  return (
    <div className="relative">
      <div className="flex h-11 items-center gap-2 rounded-[10px] border bg-background px-3">
        <Search className="size-4 shrink-0 text-muted-foreground" aria-hidden />
        <input
          ref={input}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            search(e.target.value);
          }}
          onKeyDown={(e) => e.key === "Escape" && setOpen(false)}
          placeholder={t("Search a project")}
          aria-label={t("Search a project")}
          className="h-full min-w-0 flex-1 bg-transparent text-base outline-none"
        />
        {loading && <Loader2 className="size-4 animate-spin text-muted-foreground" aria-hidden />}
        <button type="button" onClick={() => setOpen(false)} className="inline-flex size-9 items-center justify-center rounded-md hover:bg-muted" aria-label={t("Close")}>
          <X className="size-4" aria-hidden />
        </button>
      </div>
      <ul className="absolute left-0 right-0 z-20 mt-1 max-h-64 overflow-auto rounded-[10px] border bg-card py-1 shadow-card" role="listbox">
        {results.length === 0 && !loading && <li className="px-3 py-2 text-sm text-muted-foreground">{t("Nothing found")}</li>}
        {results.map((c) => (
          <li key={c.id}>
            <button
              type="button"
              role="option"
              aria-selected={false}
              className="block w-full px-3 py-2.5 text-left text-sm hover:bg-muted"
              onClick={() => {
                onChange(Number(c.id), c.label);
                setOpen(false);
                setQuery("");
              }}
            >
              {c.label}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
