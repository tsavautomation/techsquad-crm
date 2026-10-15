"use client";

import { useEffect, useSyncExternalStore } from "react";
import { useT } from "@/i18n/client";
import { cn } from "@/lib/utils";

// Text size (Fred 2026-10-11, "ficou um pouco difícil de ler sem óculos"): three steps, remembered on this
// device, applied as the root font size (everything measured in rem grows with it). Pinch zoom is off in the
// installed app, so this is the way to read bigger. The portal starts one step larger than the staff app.
// UI-m (Fred 2026-10-14, "it's wider than it should… this has to feel like an app"): CSS zoom made the page
// wider than the phone and scroll sideways on iPhone, so the size is a font size now, never a zoom.
const STEPS = [1, 1.15, 1.3] as const;
const LABELS = ["Normal", "Larger", "Largest"] as const;

type Store = { key: string; defaultIndex: number; listeners: Set<() => void> };
const PORTAL: Store = { key: "portal-text-size", defaultIndex: 1, listeners: new Set() };
const APP: Store = { key: "app-text-size", defaultIndex: 0, listeners: new Set() };

function read(s: Store): number {
  try {
    const v = Number(localStorage.getItem(s.key));
    const i = STEPS.indexOf(v as (typeof STEPS)[number]);
    return i >= 0 ? i : s.defaultIndex;
  } catch {
    return s.defaultIndex;
  }
}

function useTextSize(s: Store) {
  const index = useSyncExternalStore(
    (l) => {
      s.listeners.add(l);
      return () => s.listeners.delete(l);
    },
    () => read(s),
    () => s.defaultIndex,
  );
  // The remembered size is applied once the page is on screen (and whenever it changes).
  useEffect(() => {
    document.documentElement.style.fontSize = `${STEPS[index] * 100}%`;
  }, [s, index]);
  const set = (n: number) => {
    try {
      localStorage.setItem(s.key, String(STEPS[n]));
    } catch {
      /* private mode: the size still applies until the page is closed */
    }
    s.listeners.forEach((l) => l());
  };
  return { index, set };
}

/** Mounted by the layouts so the remembered size applies as soon as the page loads. */
export function AppTextSize() {
  useTextSize(APP);
  return null;
}
export function PortalTextSize() {
  useTextSize(PORTAL);
  return null;
}

/** Portal top bar: one button that cycles A → A+ → A++. */
export function TextSizeButton() {
  const t = useT();
  const { index, set } = useTextSize(PORTAL);
  const label = ["A", "A+", "A++"][index];
  return (
    <button type="button" onClick={() => set((index + 1) % STEPS.length)} className="inline-flex h-9 min-w-9 items-center justify-center rounded-lg px-1.5 text-sm font-semibold hover:bg-muted" aria-label={t("Text size")} title={t("Text size")}>
      {label}
    </button>
  );
}

/** Staff account menu: a row of three choices, like the colours and language rows. */
export function TextSizeChoice() {
  const t = useT();
  const { index, set } = useTextSize(APP);
  return (
    <div className="mx-2 my-2 flex rounded-[10px] border bg-muted p-0.5" role="radiogroup" aria-label={t("Text size")}>
      {LABELS.map((label, i) => (
        <button
          key={label}
          type="button"
          role="radio"
          aria-checked={index === i}
          onClick={() => set(i)}
          className={cn("flex h-9 flex-1 items-center justify-center rounded-lg text-[13px] text-muted-foreground", index === i && "bg-card font-semibold text-foreground shadow-card")}
        >
          <span style={{ fontSize: `${13 * STEPS[i]}px` }}>{t(label)}</span>
        </button>
      ))}
    </div>
  );
}
