"use client";

import { useEffect, useState, type ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { useT } from "@/i18n/client";

// Fred 2026-11-05: "the project card is extremely long because of the material and inventory list. these need to be
// collapsed and have a button to expand". A card whose body is hidden until Show is tapped (or the page is opened
// at its anchor, e.g. …#materials from the Purchasing pages). The header keeps the counts so nothing is lost.

export function CollapsedCard({ id, title, meta, className, children }: { id?: string; title: ReactNode; meta?: ReactNode; className?: string; children: ReactNode }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!id) return;
    // Opened at its anchor (…#materials from the Purchasing pages), now or on a later in-page link.
    const onHash = () => {
      if (window.location.hash === `#${id}`) setOpen(true);
    };
    onHash();
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, [id]);
  return (
    <section id={id} className={cn("scroll-mt-20 rounded-2xl border bg-card shadow-card", className)}>
      <div className="flex min-h-12 flex-wrap items-center gap-x-2 gap-y-1 px-4 py-2">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">{title}</div>
        {meta && <div className="text-xs text-muted-foreground">{meta}</div>}
        <button type="button" aria-expanded={open} aria-controls={id ? `${id}-body` : undefined} onClick={() => setOpen((o) => !o)} className="inline-flex min-h-9 items-center gap-1 rounded-full border px-3 text-xs font-medium hover:bg-muted">
          {open ? t("Hide") : t("Show")}
          <ChevronRight className={cn("size-3.5 text-muted-foreground transition-transform", open && "rotate-90")} aria-hidden />
        </button>
      </div>
      {open && (
        <div id={id ? `${id}-body` : undefined} className="border-t px-4 pt-3 pb-4">
          {children}
        </div>
      )}
    </section>
  );
}
