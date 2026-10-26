"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarRange, X } from "lucide-react";
import { useT } from "@/i18n/client";

// J-w: pick any period (from – to, both days included) instead of one week.

export function PeriodPicker({ from, to, base }: { from: string; to: string; base: { group: string; dept: string } }) {
  const t = useT();
  const router = useRouter();
  const [a, setA] = useState(from);
  const [b, setB] = useState(to);
  const go = (f: string, tt: string) => {
    const p = new URLSearchParams();
    if (base.group) p.set("group", base.group);
    if (base.dept) p.set("dept", base.dept);
    if (f && tt) {
      p.set("from", f <= tt ? f : tt);
      p.set("to", f <= tt ? tt : f);
    }
    router.push(`/time-clock/timesheets${p.size ? `?${p}` : ""}`);
  };
  const box = "h-10 rounded-lg border bg-background px-2 text-base md:text-sm";
  return (
    <form
      className="flex items-center gap-1 rounded-[10px] border bg-card p-0.5 text-[13px]"
      onSubmit={(e) => {
        e.preventDefault();
        if (a && b) go(a, b);
      }}
      aria-label={t("Period")}
    >
      <CalendarRange className="ml-1.5 size-4 text-text-2" aria-hidden />
      <input type="date" value={a} onChange={(e) => setA(e.target.value)} aria-label={t("From")} className={box} />
      <span className="text-text-2">–</span>
      <input type="date" value={b} onChange={(e) => setB(e.target.value)} aria-label={t("To")} className={box} />
      <button type="submit" disabled={!a || !b} className="inline-flex h-10 items-center rounded-lg px-2.5 font-medium text-primary hover:bg-muted disabled:opacity-40">
        {t("Show")}
      </button>
      {from && to && (
        <button type="button" onClick={() => go("", "")} aria-label={t("Back to the week")} className="inline-flex size-10 items-center justify-center rounded-lg text-text-2 hover:bg-muted">
          <X className="size-4" aria-hidden />
        </button>
      )}
    </form>
  );
}
