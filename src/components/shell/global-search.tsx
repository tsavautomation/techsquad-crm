"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ArrowLeft, Loader2, Search, X } from "lucide-react";
import { globalSearchAction, type SearchGroup, type SearchHit } from "@/lib/search/actions";
import { cn } from "@/lib/utils";
import { TileIcon } from "./tile-icons";

// Top-bar search over every record type (projects, contacts, buildings, suppliers, employees, vehicles…).
// Computers: a box next to the account initials, results drop down under it (Ctrl+K or "/" jumps to it).
// Phones: a search button that opens a full-screen search.

function useSearch() {
  const [q, setQ] = useState("");
  const [groups, setGroups] = useState<SearchGroup[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef(0);

  /** Search after a short pause in typing; only the newest answer is shown. */
  function change(v: string) {
    setQ(v);
    if (timer.current) clearTimeout(timer.current);
    if (v.trim().length < 2) {
      latest.current++;
      setGroups([]);
      setSearched("");
      setLoading(false);
      return;
    }
    setLoading(true);
    timer.current = setTimeout(async () => {
      const ticket = ++latest.current;
      try {
        const r = await globalSearchAction(v);
        if (ticket === latest.current) {
          setGroups(r);
          setSearched(v.trim());
        }
      } finally {
        if (ticket === latest.current) setLoading(false);
      }
    }, 250);
  }
  const clear = () => change("");
  return { q, change, clear, groups, loading, searched };
}

function Results({ s, active, onPick, onHover }: { s: ReturnType<typeof useSearch>; active: number; onPick: () => void; onHover: (i: number) => void }) {
  if (s.q.trim().length < 2) return <p className="px-4 py-6 text-center text-sm text-muted-foreground">Type a name, address, phone, email or number.</p>;
  if (!s.groups.length) {
    if (s.loading || s.searched !== s.q.trim()) return <p className="px-4 py-6 text-center text-sm text-muted-foreground">Searching…</p>;
    return <p className="px-4 py-6 text-center text-sm text-muted-foreground">No matches for “{s.searched}”.</p>;
  }
  let n = -1;
  return (
    <div className="flex flex-col gap-1 py-1">
      {s.groups.map((g) => (
        <section key={g.table} aria-label={g.label}>
          <div className="flex items-center gap-2 px-3 pt-2 pb-1">
            <TileIcon name={g.icon} size="sm" />
            <span className="flex-1 text-[11.5px] font-semibold tracking-wider text-muted-foreground uppercase">{g.label}</span>
            {g.href && g.hits.length >= 5 && (
              <Link href={g.href} onClick={onPick} className="rounded-md px-2 py-1 text-[12.5px] font-medium text-primary hover:bg-muted">
                See all
              </Link>
            )}
          </div>
          <ul>
            {g.hits.map((h: SearchHit) => {
              const i = ++n;
              return (
                <li key={h.href + h.title}>
                  <Link
                    href={h.href}
                    onClick={onPick}
                    onMouseEnter={() => onHover(i)}
                    data-hit={i}
                    className={cn("mx-1 flex min-h-11 flex-col justify-center rounded-lg px-3 py-1.5 pl-[52px]", i === active ? "bg-secondary" : "hover:bg-muted")}
                  >
                    <span className="flex items-center gap-2">
                      <span className="truncate text-[14.5px] font-medium">{h.title}</span>
                      {h.archived && <span className="shrink-0 rounded-full bg-muted px-1.5 text-[11px] text-text-2">Archived</span>}
                    </span>
                    {h.line && <span className="truncate text-[12.5px] text-text-2">{h.line}</span>}
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}

export function GlobalSearch() {
  const s = useSearch();
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false); // computer drop-down
  const [phone, setPhone] = useState(false); // phone full screen
  const [active, setActive] = useState(-1);
  const box = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const phoneInput = useRef<HTMLInputElement>(null);
  const hits = s.groups.flatMap((g) => g.hits);

  // Close after moving to another page.
  const [path, setPath] = useState(pathname);
  if (path !== pathname) {
    setPath(pathname);
    setOpen(false);
    setPhone(false);
  }

  // Ctrl+K / ⌘K / "/" jump to the search box.
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      const typing = e.target instanceof HTMLElement && (e.target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(e.target.tagName));
      if ((e.key === "k" && (e.ctrlKey || e.metaKey)) || (e.key === "/" && !typing)) {
        e.preventDefault();
        if (window.matchMedia("(min-width: 768px)").matches) input.current?.focus();
        else setPhone(true);
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, []);

  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => box.current && !box.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener("pointerdown", away);
    return () => document.removeEventListener("pointerdown", away);
  }, [open]);

  useEffect(() => {
    if (phone) phoneInput.current?.focus();
  }, [phone]);

  function keys(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Escape") {
      if (s.q) s.clear();
      else {
        setOpen(false);
        setPhone(false);
        e.currentTarget.blur();
      }
    } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!hits.length) return;
      const next = e.key === "ArrowDown" ? (active + 1) % hits.length : (active - 1 + hits.length) % hits.length;
      setActive(next);
      document.querySelector(`[data-hit="${next}"]`)?.scrollIntoView({ block: "nearest" });
    } else if (e.key === "Enter" && hits.length) {
      e.preventDefault();
      router.push(hits[Math.max(0, active)].href);
      setOpen(false);
      setPhone(false);
    }
  }
  const change = (v: string) => {
    s.change(v);
    setActive(-1);
  };
  const done = () => {
    setOpen(false);
    setPhone(false);
  };

  return (
    <>
      {/* Computers */}
      <div ref={box} className="relative hidden w-72 md:block lg:w-96">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <input
          ref={input}
          type="search"
          value={s.q}
          onChange={(e) => change(e.target.value)}
          onFocus={() => setOpen(true)}
          onKeyDown={keys}
          placeholder="Search projects, clients, buildings…"
          aria-label="Search all records"
          role="combobox"
          aria-expanded={open}
          aria-controls="global-search-results"
          autoComplete="off"
          className="h-10 w-full rounded-xl border bg-background pr-16 pl-9 text-sm outline-none placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-primary/20 [&::-webkit-search-cancel-button]:hidden"
        />
        {s.loading ? (
          <Loader2 className="absolute top-1/2 right-3 size-4 -translate-y-1/2 animate-spin text-muted-foreground" aria-hidden />
        ) : s.q ? (
          <button
            type="button"
            onClick={() => change("")}
            className="absolute top-1/2 right-1.5 grid size-7 -translate-y-1/2 place-items-center rounded-md hover:bg-muted"
            aria-label="Clear search"
          >
            <X className="size-4" aria-hidden />
          </button>
        ) : (
          <kbd className="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 rounded border bg-muted px-1.5 text-[11px] text-muted-foreground">Ctrl K</kbd>
        )}
        {open && (
          <div
            id="global-search-results"
            className="absolute top-12 right-0 z-50 max-h-[70vh] w-[min(560px,calc(100vw-2rem))] overflow-y-auto rounded-2xl border bg-card p-1 shadow-float"
          >
            <Results s={s} active={active} onPick={done} onHover={setActive} />
          </div>
        )}
      </div>

      {/* Phones */}
      <button type="button" onClick={() => setPhone(true)} className="grid size-11 place-items-center rounded-full text-text-2 active:bg-muted md:hidden" aria-label="Search">
        <Search className="size-[22px]" aria-hidden />
      </button>
      {/* On <body>: the top bar's blur would otherwise trap this full-screen layer inside the bar. */}
      {phone &&
        createPortal(
          <div role="dialog" aria-modal="true" aria-label="Search" className="fixed inset-0 z-50 flex flex-col bg-background md:hidden">
            <div className="flex items-center gap-1 border-b bg-card px-2 pt-[env(safe-area-inset-top)]">
              <button type="button" onClick={() => setPhone(false)} className="grid size-11 shrink-0 place-items-center rounded-full active:bg-muted" aria-label="Close search">
                <ArrowLeft className="size-5" aria-hidden />
              </button>
              <input
                ref={phoneInput}
                type="search"
                enterKeyHint="search"
                value={s.q}
                onChange={(e) => change(e.target.value)}
                onKeyDown={keys}
                placeholder="Search everything"
                aria-label="Search all records"
                autoComplete="off"
                className="h-14 min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-muted-foreground [&::-webkit-search-cancel-button]:hidden"
              />
              {s.loading ? (
                <Loader2 className="mx-3 size-5 animate-spin text-muted-foreground" aria-hidden />
              ) : (
                s.q && (
                  <button type="button" onClick={() => change("")} className="grid size-11 shrink-0 place-items-center rounded-full active:bg-muted" aria-label="Clear search">
                    <X className="size-5" aria-hidden />
                  </button>
                )
              )}
            </div>
            <div className="flex-1 overflow-y-auto pb-[env(safe-area-inset-bottom)]">
              <Results s={s} active={active} onPick={done} onHover={setActive} />
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
