"use client";

import { useId, useRef, useState } from "react";
import { MapPin } from "lucide-react";
import { addressDetailsAction, addressSuggestAction, type AddressSuggestion } from "@/lib/records/address-actions";
import type { Address } from "@/lib/records/values";
import { cn } from "@/lib/utils";

type Props = { value: Address; onChange: (a: Address) => void; disabled?: boolean; box: string };

/** Street / line 2 / city / state / ZIP, with US address suggestions under the street box (Google Places). */
export function AddressInput({ value: a, onChange, disabled, box }: Props) {
  const [suggestions, setSuggestions] = useState<AddressSuggestion[]>([]);
  const [open, setOpen] = useState(false);
  const session = useRef<string>("");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef(0);
  const listId = useId();
  const set = (k: keyof Address, v: string) => onChange({ ...a, [k]: v });

  const search = (text: string) => {
    if (timer.current) clearTimeout(timer.current);
    if (text.trim().length < 4) {
      setSuggestions([]);
      return;
    }
    session.current ||= crypto.randomUUID();
    const n = ++latest.current;
    timer.current = setTimeout(async () => {
      const list = await addressSuggestAction(text, session.current);
      if (n === latest.current) {
        setSuggestions(list);
        setOpen(list.length > 0);
      }
    }, 300);
  };

  const pick = async (s: AddressSuggestion) => {
    setOpen(false);
    setSuggestions([]);
    const found = await addressDetailsAction(s.placeId, session.current);
    session.current = ""; // the next search starts a new billing session
    if (found) onChange({ ...a, ...found, address_2: found.address_2 || a.address_2 || "" });
    else onChange({ ...a, street: s.main });
  };

  return (
    <div className="grid grid-cols-6 gap-2">
      <div className="relative col-span-6">
        <input
          aria-label="Street"
          placeholder="Street (start typing to search)"
          autoComplete="off"
          disabled={disabled}
          className={cn(box, "h-11")}
          value={a.street ?? ""}
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          onChange={(e) => {
            set("street", e.target.value);
            search(e.target.value);
          }}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onFocus={() => suggestions.length && setOpen(true)}
        />
        {open && (
          <ul id={listId} role="listbox" className="absolute inset-x-0 top-full z-40 mt-1 overflow-hidden rounded-lg border bg-background shadow-lg">
            {suggestions.map((s) => (
              <li key={s.placeId} role="option" aria-selected={false}>
                <button
                  type="button"
                  className="flex min-h-12 w-full items-start gap-2 px-3 py-2 text-left hover:bg-muted active:bg-muted"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => void pick(s)}
                >
                  <MapPin className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
                  <span className="min-w-0">
                    <span className="block truncate text-base">{s.main}</span>
                    <span className="block truncate text-xs text-muted-foreground">{s.secondary}</span>
                  </span>
                </button>
              </li>
            ))}
            <li className="px-3 py-1 text-right text-[10px] text-muted-foreground">Powered by Google</li>
          </ul>
        )}
      </div>
      <input aria-label="Address line 2" placeholder="Apt, suite (optional)" autoComplete="off" disabled={disabled} className={cn(box, "col-span-6 h-11")} value={a.address_2 ?? ""} onChange={(e) => set("address_2", e.target.value)} />
      <input aria-label="City" placeholder="City" autoComplete="off" disabled={disabled} className={cn(box, "col-span-3 h-11")} value={a.city ?? ""} onChange={(e) => set("city", e.target.value)} />
      <input aria-label="State" placeholder="State" autoComplete="off" maxLength={2} disabled={disabled} className={cn(box, "col-span-1 h-11 uppercase")} value={a.state ?? ""} onChange={(e) => set("state", e.target.value.toUpperCase())} />
      <input aria-label="ZIP" placeholder="ZIP" inputMode="numeric" autoComplete="off" maxLength={10} disabled={disabled} className={cn(box, "col-span-2 h-11")} value={a.zip ?? ""} onChange={(e) => set("zip", e.target.value)} />
    </div>
  );
}
