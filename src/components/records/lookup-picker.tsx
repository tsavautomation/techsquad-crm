"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, Search, X } from "lucide-react";
import { autofillAction, searchChoicesAction, type Choice } from "@/lib/records/field-actions";
import type { Values } from "@/lib/rules/evaluate";
import { cn } from "@/lib/utils";
import type { FieldDef } from "@/registry/types";

type Props = {
  table: string;
  field: FieldDef;
  value: unknown;
  onChange: (v: unknown) => void;
  /** Current form values (for filters like "same Type as this contact"). */
  form: Values;
  /** Known labels by id, from the server. */
  labels: Record<string, string>;
  /** Apply auto-filled values from the picked record (SPEC §2.2). */
  onAutofill: (v: Values, labels: Record<string, Record<string, string>>) => void;
  disabled?: boolean;
  invalid?: boolean;
};

/** Search-as-you-type picker for linked records, users and groups; single or multiple. */
export function LookupPicker({ table, field: f, value, onChange, form, labels, onAutofill, disabled, invalid }: Props) {
  const multiple = Boolean(f.multiple);
  const numeric = f.type !== "user";
  const selected: string[] = (multiple ? ((value as unknown[]) ?? []) : value === null || value === undefined ? [] : [value]).map(String);

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Choice[]>([]);
  const [loading, setLoading] = useState(false);
  const [known, setKnown] = useState<Record<string, string>>(labels);
  const input = useRef<HTMLInputElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef(0);
  const formRef = useRef(form);
  useEffect(() => {
    formRef.current = form;
  }, [form]);

  /** Search after a short pause in typing; only the newest request's answer is shown. */
  function search(q: string, delay = 250) {
    if (timer.current) clearTimeout(timer.current);
    setLoading(true);
    timer.current = setTimeout(async () => {
      const ticket = ++latest.current;
      try {
        const r = await searchChoicesAction(table, f.name, q, formRef.current);
        if (ticket === latest.current) setResults(r);
      } finally {
        if (ticket === latest.current) setLoading(false);
      }
    }, delay);
  }

  function openPicker() {
    setOpen(true);
    search(query, 0);
  }

  useEffect(() => {
    if (open) input.current?.focus();
  }, [open]);
  const toValue = (id: string) => (numeric ? Number(id) : id);

  async function pick(c: Choice) {
    setKnown((k) => ({ ...k, [c.id]: c.label }));
    if (multiple) {
      onChange(selected.includes(c.id) ? selected.filter((x) => x !== c.id).map(toValue) : [...selected, c.id].map(toValue));
      return;
    }
    onChange(toValue(c.id));
    setOpen(false);
    setQuery("");
    if (f.lookup?.autofill?.length) {
      const filled = await autofillAction(table, f.name, Number(c.id));
      onAutofill(filled.values, filled.labels);
    }
  }

  function remove(id: string) {
    onChange(multiple ? selected.filter((x) => x !== id).map(toValue) : null);
  }

  const filterNeedsValue = Object.values(f.lookup?.filter ?? {}).find((v) => typeof v === "object" && !Array.isArray(v)) as { sameAs: string } | undefined;
  const blockedBy = filterNeedsValue && (form[filterNeedsValue.sameAs] === null || form[filterNeedsValue.sameAs] === undefined);

  return (
    <div className={cn("rounded-lg border bg-background", invalid && "border-destructive")}>
      {selected.length > 0 && (
        <ul className="flex flex-wrap gap-2 p-2">
          {selected.map((id) => (
            <li key={id} className="inline-flex min-h-9 items-center gap-1 rounded-full border bg-muted/50 pl-3 text-sm">
              {known[id] ?? labels[id] ?? `#${id}`}
              {!disabled && (
                <button type="button" onClick={() => remove(id)} className="inline-flex size-9 items-center justify-center rounded-full hover:bg-muted" aria-label={`Remove ${known[id] ?? id}`}>
                  <X className="size-4" aria-hidden />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {!disabled && !open && (multiple || selected.length === 0) && (
        <button
          type="button"
          id={`f-${f.name}`}
          disabled={Boolean(blockedBy)}
          onClick={openPicker}
          className="flex h-11 w-full items-center gap-2 px-3 text-left text-base text-muted-foreground disabled:opacity-60"
        >
          <Search className="size-4" aria-hidden />
          {blockedBy ? "Choose the Type first" : multiple && selected.length ? "Add another…" : "Choose…"}
        </button>
      )}
      {!disabled && !open && !multiple && selected.length > 0 && (
        <button type="button" id={`f-${f.name}`} onClick={openPicker} className="h-10 w-full border-t px-3 text-left text-sm text-muted-foreground hover:bg-muted/40">
          Change…
        </button>
      )}

      {open && (
        <div className="border-t first:border-t-0">
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <input
              ref={input}
              type="search"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                search(e.target.value);
              }}
              onKeyDown={(e) => {
                if (e.key === "Escape") setOpen(false);
                if (e.key === "Enter") {
                  e.preventDefault();
                  if (results[0]) pick(results[0]);
                }
              }}
              placeholder={`Search ${f.label.toLowerCase()}…`}
              aria-label={`Search ${f.label}`}
              className="h-11 w-full bg-transparent pr-20 pl-9 text-base outline-none"
            />
            <button type="button" onClick={() => setOpen(false)} className="absolute top-1/2 right-1 h-9 -translate-y-1/2 rounded px-3 text-sm text-muted-foreground hover:bg-muted">
              Done
            </button>
          </div>
          <ul role="listbox" aria-label={f.label} aria-multiselectable={multiple} className="max-h-72 overflow-y-auto border-t">
            {loading && results.length === 0 && (
              <li className="flex items-center gap-2 px-3 py-3 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" aria-hidden /> Searching…
              </li>
            )}
            {!loading && results.length === 0 && <li className="px-3 py-3 text-sm text-muted-foreground">Nothing found.</li>}
            {results.map((c) => {
              const on = selected.includes(c.id);
              return (
                <li key={c.id} role="option" aria-selected={on}>
                  <button type="button" onClick={() => pick(c)} className={cn("flex min-h-11 w-full items-center justify-between gap-3 px-3 text-left text-sm hover:bg-muted", on && "font-medium")}>
                    <span>
                      {c.label}
                      {c.hint && <span className="ml-2 text-xs text-muted-foreground">{c.hint}</span>}
                    </span>
                    {on && <span aria-hidden>✓</span>}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
