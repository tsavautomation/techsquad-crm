"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Clock, Loader2, LogIn, LogOut, MapPin } from "lucide-react";
import { toast } from "sonner";
import { clockAction } from "@/lib/time-clock/actions";
import { formatDistance, type Place, type TimeEntry } from "@/lib/time-clock/clock";
import { currentPosition } from "@/lib/time-clock/geo-client";
import { cn } from "@/lib/utils";
import { useT } from "@/i18n/client";

// The big Clock in / Clock out at the top of Today (P2). The phone's position is asked for only when
// the button is pressed; without it the entry is still saved and flagged.

type Props = {
  openSince: string | null;
  clockedMin: number;
  onSiteMin: number;
  /** Today's entries, oldest first, already formatted: time, label, place. */
  entries: { id: number; kind: TimeEntry["kind"]; time: string; label: string; place: Place; distance_m: number | null; hasGeo: boolean }[];
  openSinceTime: string | null;
  clockedText: string;
  onSiteText: string;
  reminderPassed: boolean;
};

const PLACE_TONE: Record<Place, string> = { Office: "text-info-fg", "On site": "text-ok-fg", Elsewhere: "text-warn-fg", Unknown: "text-muted-foreground" };

export function ClockCard({ openSince, entries, openSinceTime, clockedText, onSiteText, reminderPassed }: Props) {
  const t = useT();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [locating, setLocating] = useState(false);

  const press = (kind: "clock_in" | "clock_out") =>
    start(async () => {
      setLocating(true);
      const geo = await currentPosition();
      setLocating(false);
      const r = await clockAction(kind, geo);
      if (!r.ok) return void toast.error(t(r.message));
      const place = r.place as Place;
      toast.success(kind === "clock_in" ? t("Clocked in · {place}", { place: t(place === "Unknown" ? "no location" : place) }) : t("Clocked out · {place}", { place: t(place === "Unknown" ? "no location" : place) }));
      router.refresh();
    });

  return (
    <section id="clock" className={cn("scroll-mt-20 rounded-2xl border bg-card px-[18px] py-4 shadow-card", reminderPassed && openSince && "border-warn-border")}>
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="flex items-center gap-1.5 text-[15px] font-semibold tracking-tight">
            <Clock className="size-4 text-primary" aria-hidden /> {t("Time clock")}
          </h2>
          <p className="text-[13px] text-text-2">
            {openSince ? t("Clocked in since {time} · {clocked} today", { time: openSinceTime ?? "", clocked: clockedText }) : entries.length ? t("Clocked out · {clocked} today", { clocked: clockedText }) : t("Not clocked in yet")}
            {onSiteText && ` · ${t("on site {time}", { time: onSiteText })}`}
          </p>
          {reminderPassed && openSince && <p className="mt-0.5 text-[12.5px] font-medium text-warn-fg">{t("Still clocked in — don't forget to clock out.")}</p>}
        </div>
        <button
          type="button"
          disabled={pending}
          onClick={() => press(openSince ? "clock_out" : "clock_in")}
          className={cn("inline-flex h-12 shrink-0 items-center gap-2 rounded-[12px] px-5 text-[15px] font-semibold disabled:opacity-60", openSince ? "bg-ok-bg text-ok-fg hover:brightness-95" : "bg-primary text-primary-foreground hover:brightness-95")}
        >
          {pending ? <Loader2 className="size-5 animate-spin" aria-hidden /> : openSince ? <LogOut className="size-5" aria-hidden /> : <LogIn className="size-5" aria-hidden />}
          {pending && locating ? t("Locating…") : openSince ? t("Clock out") : t("Clock in")}
        </button>
      </div>
      {entries.length > 0 && (
        <ol className="mt-3 flex flex-col gap-1 border-t pt-2 text-[13px]">
          {entries.map((e) => (
            <li key={e.id} className="flex items-center gap-2">
              <span className="w-[72px] shrink-0 tabular-nums text-text-2">{e.time}</span>
              <span className="min-w-0 flex-1 truncate">{e.label}</span>
              <span className={cn("flex shrink-0 items-center gap-1 text-[12px]", PLACE_TONE[e.place])}>
                <MapPin className="size-3.5" aria-hidden />
                {e.hasGeo ? `${t(e.place)}${e.place !== "Office" && e.place !== "On site" && e.distance_m !== null ? ` · ${formatDistance(e.distance_m)}` : ""}` : t("no location")}
              </span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
