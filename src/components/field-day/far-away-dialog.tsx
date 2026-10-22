"use client";

import { useT } from "@/i18n/client";
import { cn } from "@/lib/utils";
import { formatDistance } from "@/lib/time-clock/clock";

// F29 (Fred 2026-10-22): a check-in or clock-in pressed more than 1000 ft from where the person should be first
// asks "You are X away from <place>. Continue?". The answer never changes what is saved: the position still goes
// with the entry, and the place / distance are still worked out on the server.

const BTN = "inline-flex h-11 flex-1 items-center justify-center gap-1.5 rounded-[10px] px-4 text-sm font-semibold disabled:opacity-60";

export function FarAwayDialog({ distanceM, place, action, onContinue, onCancel }: { distanceM: number; place: string; action: "check_in" | "clock_in"; onContinue: () => void; onCancel: () => void }) {
  const t = useT();
  const checkIn = action === "check_in";
  return (
    <div className="fixed inset-0 z-[120] flex items-end justify-center bg-black/50 p-4 md:items-center" role="dialog" aria-modal="true">
      <div className="w-full max-w-sm rounded-2xl bg-card p-5 shadow-xl">
        <h2 className="text-[19px] font-semibold tracking-tight">{t("You are {distance} away from {place}", { distance: formatDistance(distanceM) || t("far"), place })}</h2>
        <p className="mt-1 text-sm text-text-2">{t(checkIn ? "Continue the check-in anyway?" : "Continue the clock-in anyway?")}</p>
        <div className="mt-4 flex gap-2">
          <button type="button" onClick={onCancel} className={cn(BTN, "border bg-card hover:bg-muted")}>
            {t("Cancel")}
          </button>
          <button type="button" onClick={onContinue} className={cn(BTN, "bg-primary text-primary-foreground hover:brightness-95")}>
            {t("Continue")}
          </button>
        </div>
      </div>
    </div>
  );
}
