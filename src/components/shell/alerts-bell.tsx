"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AtSign, Bell, CalendarClock, CheckSquare, ClipboardCheck, Clock, MapPin, SquareKanban, X, type LucideIcon } from "lucide-react";
import { alertsAction, markTagsSeenAction, type Alerts, type AlertSection } from "@/lib/alerts/actions";
import { cn } from "@/lib/utils";
import { useT } from "@/i18n/client";

// Alerts bell next to the account initials: a red count of what is waiting for me (tags in notes,
// approvals, today's visits, open tasks, checklist items, follow-ups), each linking to its record.
// Refreshed on every page change, when the app comes back to the front, and every two minutes.

const ICONS: Record<AlertSection["key"], { icon: LucideIcon; tint: string }> = {
  clock: { icon: Clock, tint: "#f97316" },
  tags: { icon: AtSign, tint: "#0e76ad" },
  approvals: { icon: ClipboardCheck, tint: "#8b5cf6" },
  visits: { icon: MapPin, tint: "#0ea5e9" },
  tasks: { icon: SquareKanban, tint: "#f59e0b" },
  checklist: { icon: CheckSquare, tint: "#16a34a" },
  followups: { icon: CalendarClock, tint: "#ef4444" },
};

function List({ alerts, onPick, onTagsRead }: { alerts: Alerts | null; onPick: () => void; onTagsRead: () => void }) {
  const t = useT();
  if (!alerts) return <p className="px-4 py-6 text-center text-sm text-muted-foreground">{t("Loading…")}</p>;
  if (!alerts.sections.length) return <p className="px-4 py-8 text-center text-sm text-muted-foreground">{t("You're all caught up.")}</p>;
  return (
    <div className="flex flex-col gap-1 py-1">
      {alerts.sections.map((s) => {
        const { icon: Icon, tint } = ICONS[s.key];
        return (
          <section key={s.key} aria-label={s.title}>
            <div className="flex items-center gap-2 px-3 pt-2 pb-1">
              <span className="grid size-7 place-items-center rounded-lg" style={{ backgroundColor: `color-mix(in srgb, ${tint} 14%, transparent)`, color: tint }} aria-hidden>
                <Icon className="size-4" />
              </span>
              <span className="flex-1 text-xs font-semibold tracking-wider text-muted-foreground uppercase">
                {s.title} · {s.items.length}
              </span>
              {s.key === "tags" && (
                <button type="button" onClick={onTagsRead} className="rounded-md px-2 py-1 text-xs font-medium text-primary hover:bg-muted">
                  {t("Mark read")}
                </button>
              )}
            </div>
            <ul>
              {s.items.map((i) => (
                <li key={i.key}>
                  <Link href={i.href} onClick={onPick} className="mx-1 flex min-h-11 flex-col justify-center rounded-lg px-3 py-1.5 pl-[46px] hover:bg-muted active:bg-muted">
                    <span className="truncate text-sm font-medium">{i.title}</span>
                    <span className={cn("line-clamp-2 text-xs", i.urgent && s.key !== "tags" ? "text-bad-fg" : "text-text-2")}>{i.meta}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

export function AlertsBell() {
  const t = useT();
  const pathname = usePathname();
  const [alerts, setAlerts] = useState<Alerts | null>(null);
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const latest = useRef(0);

  const load = useCallback(() => {
    const ticket = ++latest.current;
    return alertsAction()
      .then((a) => ticket === latest.current && setAlerts(a))
      .catch(() => undefined); // offline or signed out: keep what we had
  }, []);

  // Reload on every page change (the layout itself doesn't re-render on navigation).
  useEffect(() => {
    void load();
  }, [pathname, load]);

  useEffect(() => {
    const again = () => document.visibilityState === "visible" && void load();
    document.addEventListener("visibilitychange", again);
    const timer = setInterval(again, 120_000);
    return () => {
      document.removeEventListener("visibilitychange", again);
      clearInterval(timer);
    };
  }, [load]);

  // Close after moving to another page.
  const [path, setPath] = useState(pathname);
  if (path !== pathname) {
    setPath(pathname);
    setOpen(false);
  }

  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => {
      const target = e.target as Node;
      if (box.current?.contains(target) || document.getElementById("alerts-panel")?.contains(target)) return;
      setOpen(false);
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", away);
    window.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("pointerdown", away);
      window.removeEventListener("keydown", esc);
    };
  }, [open]);

  async function tagsRead() {
    await markTagsSeenAction();
    await load();
  }

  const count = alerts?.count ?? 0;
  const label = count ? t("Alerts: {n} waiting", { n: count }) : t("Alerts");

  return (
    <div ref={box} className="relative">
      <button
        type="button"
        onClick={() => {
          setOpen((o) => !o);
          void load();
        }}
        aria-label={label}
        aria-expanded={open}
        className="relative grid size-11 place-items-center rounded-full text-text-2 hover:bg-muted active:bg-muted"
      >
        <Bell className="size-[22px]" aria-hidden />
        {count > 0 && (
          <span
            className={cn(
              "absolute top-1 right-0.5 grid h-[18px] min-w-[18px] place-items-center rounded-full px-1 text-[11px] leading-none font-bold text-white tabular-nums ring-2 ring-card",
              alerts?.urgent ? "bg-[#ef4444]" : "bg-primary",
            )}
            aria-hidden
          >
            {count > 99 ? "99+" : count}
          </span>
        )}
      </button>
      {/* On <body>: the top bar's blur would otherwise trap the phone's full-screen panel inside the bar. */}
      {open &&
        createPortal(
          <div
            id="alerts-panel"
            role="dialog"
            aria-label={t("Alerts")}
            className="fixed inset-0 z-50 flex flex-col bg-background md:inset-auto md:top-[60px] md:right-4 md:max-h-[75vh] md:w-[420px] md:rounded-2xl md:border md:bg-card md:shadow-float"
          >
            <div className="flex items-center justify-between border-b bg-card px-4 pt-[env(safe-area-inset-top)] md:rounded-t-2xl md:pt-0">
              <span className="flex h-14 items-center text-[15px] font-semibold">{t("Alerts")}</span>
              <button type="button" onClick={() => setOpen(false)} className="grid size-11 place-items-center rounded-full hover:bg-muted" aria-label={t("Close alerts")}>
                <X className="size-5" aria-hidden />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-1 pb-[env(safe-area-inset-bottom)]">
              <List alerts={alerts} onPick={() => setOpen(false)} onTagsRead={tagsRead} />
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
