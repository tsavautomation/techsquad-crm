"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Plus, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useT } from "@/i18n/client";

// INV-e: a searchable picker for long lists (1,400 products, 280 projects…). Typing filters on the
// client with `matches`; arrows, Enter and Escape work; the list is a scrollable box, so it works on
// a phone too. An optional "create" row appears at the end when nothing fits the typed text.

export type ComboItem = { id: number; label: string; hint?: string | null };

type Props<T extends ComboItem> = {
  items: T[];
  value: number | null;
  onChange: (id: number | null, item: T | null) => void;
  matches: (item: T, query: string) => boolean;
  placeholder?: string;
  disabled?: boolean;
  /** Shown as the last row when the typed text is not empty: "+ Create “…”". */
  onCreate?: (query: string) => void;
  createLabel?: string;
  limit?: number;
  className?: string;
  inputClassName?: string;
  autoFocus?: boolean;
};

export function Combobox<T extends ComboItem>({ items, value, onChange, matches, placeholder, disabled, onCreate, createLabel, limit = 50, className, inputClassName, autoFocus }: Props<T>) {
  const t = useT();
  const id = useId();
  const selected = useMemo(() => items.find((i) => i.id === value) ?? null, [items, value]);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const list = useMemo(() => (open ? items.filter((i) => matches(i, query)).slice(0, limit) : []), [items, matches, query, open, limit]);
  const showCreate = Boolean(onCreate && open && query.trim());
  const rows = list.length + (showCreate ? 1 : 0);

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (root.current && !root.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  const pick = (item: T) => {
    onChange(item.id, item);
    setQuery("");
    setOpen(false);
  };
  const clear = () => {
    onChange(null, null);
    setQuery("");
    setOpen(true);
  };
  const onKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!open && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
      setOpen(true);
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(rows - 1, a + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(0, a - 1));
    } else if (e.key === "Enter") {
      e.preventDefault(); // never submits the form around it
      if (!open) return;
      if (active < list.length) pick(list[active]);
      else if (showCreate) onCreate!(query.trim());
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  return (
    <div ref={root} className={cn("relative", className)}>
      <div className="relative">
        <input
          role="combobox"
          aria-expanded={open}
          aria-controls={`${id}-list`}
          aria-autocomplete="list"
          autoFocus={autoFocus}
          disabled={disabled}
          value={open || !selected ? query : selected.label}
          placeholder={placeholder}
          onFocus={() => setOpen(true)}
          onClick={() => setOpen(true)}
          onChange={(e) => {
            setQuery(e.target.value);
            setActive(0);
            setOpen(true);
          }}
          onKeyDown={onKey}
          className={cn("h-11 w-full rounded-lg border border-input bg-card pr-16 pl-3 text-base outline-none focus-visible:ring-3 focus-visible:ring-ring/50", inputClassName)}
          autoComplete="off"
        />
        <span className="absolute inset-y-0 right-1 flex items-center gap-0.5">
          {selected && !disabled && (
            <button type="button" onClick={clear} aria-label={t("Clear")} className="inline-flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted">
              <X className="size-4" aria-hidden />
            </button>
          )}
          <ChevronDown className="mr-1 size-4 text-muted-foreground" aria-hidden />
        </span>
      </div>
      {open && (
        <ul id={`${id}-list`} role="listbox" className="absolute z-20 mt-1 max-h-64 w-full overflow-y-auto rounded-lg border bg-card py-1 shadow-card">
          {list.map((item, i) => (
            <li key={item.id} role="option" aria-selected={item.id === value}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(item)}
                onMouseEnter={() => setActive(i)}
                className={cn("flex w-full items-center gap-2 px-3 py-2 text-left text-sm", i === active ? "bg-muted" : "", item.id === value && "font-semibold")}
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate">{item.label}</span>
                  {item.hint && <span className="block truncate text-xs text-text-2">{item.hint}</span>}
                </span>
                {item.id === value && <Check className="size-4 shrink-0 text-primary" aria-hidden />}
              </button>
            </li>
          ))}
          {list.length === 0 && !showCreate && <li className="px-3 py-2 text-sm text-muted-foreground">{t("Nothing matches.")}</li>}
          {list.length === limit && <li className="px-3 py-1 text-xs text-muted-foreground">{t("Keep typing to narrow the list.")}</li>}
          {showCreate && (
            <li role="option" aria-selected={false}>
              <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => onCreate!(query.trim())} onMouseEnter={() => setActive(list.length)} className={cn("flex w-full items-center gap-2 px-3 py-2 text-left text-sm font-medium text-primary", active === list.length && "bg-muted")}>
                <Plus className="size-4" aria-hidden /> {createLabel ?? t("Create")} “{query.trim()}”
              </button>
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
