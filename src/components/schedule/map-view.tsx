"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Truck } from "lucide-react";
import { motionLabel, reportedLabel } from "@/lib/bouncie/age";
import { freshness, type MapVehicle, type VehiclesResponse } from "@/lib/bouncie/match";
import { formatDate } from "@/lib/dates";
import { addDays, clock } from "@/lib/schedule/dates";
import type { MapOffice, MapPerson, MapStop } from "@/lib/schedule/map";
import { PIN_DONE, PIN_ON_SITE, PIN_PLANNED } from "@/lib/schedule/pins";
import { cn } from "@/lib/utils";
import { useT } from "@/i18n/client";

// Schedule › Map (F8): toolbar (day, technician), the map, then the day's stops per technician and the
// vans. Vehicle positions are polled from /api/bouncie/vehicles every 15 s while the page is visible.

const BASE = "/schedule/map";
const POLL_MS = 15_000;

const LeafletMap = dynamic(() => import("./leaflet-map").then((m) => m.LeafletMap), {
  ssr: false,
  loading: () => <div className="h-full w-full animate-pulse bg-muted" />,
});

type Props = {
  date: string;
  today: string;
  tech: number | null;
  stops: MapStop[];
  people: MapPerson[];
  office: MapOffice | null;
  /** hidden: this person may not see the vans; off: Bouncie isn't connected; on: poll it. */
  vehiclesMode: "hidden" | "off" | "on";
  isAdmin: boolean;
};

export function MapView({ date, today, tech, stops, people, office, vehiclesMode, isAdmin }: Props) {
  const tr = useT();
  const router = useRouter();
  const [selected, setSelected] = useState<string | null>(null);
  const [live, setLive] = useState<{ vehicles: MapVehicle[]; at: string | null; error: string | null }>({ vehicles: [], at: null, error: null });

  const q = (o: Partial<{ date: string; tech: number | null }>) => {
    const p = new URLSearchParams();
    const d = o.date ?? date;
    const t = o.tech === undefined ? tech : o.tech;
    if (d !== today) p.set("date", d);
    if (t) p.set("tech", String(t));
    const s = p.toString();
    return s ? `${BASE}?${s}` : BASE;
  };

  // The vans, refreshed while the page is on screen.
  useEffect(() => {
    if (vehiclesMode !== "on") return;
    let stop = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const tick = async () => {
      if (stop) return;
      if (document.visibilityState === "visible") {
        try {
          const r = await fetch("/api/bouncie/vehicles", { cache: "no-store" });
          const body = (await r.json()) as VehiclesResponse & { error?: string };
          if (!stop) setLive({ vehicles: body.vehicles ?? [], at: body.fetchedAt ?? null, error: body.error ?? (r.ok ? null : tr("Could not read the vehicles.")) });
        } catch {
          if (!stop) setLive((s) => ({ ...s, error: tr("Could not read the vehicles.") }));
        }
      }
      timer = setTimeout(tick, POLL_MS);
    };
    void tick();
    const onShow = () => {
      if (document.visibilityState === "visible") {
        clearTimeout(timer);
        void tick();
      }
    };
    document.addEventListener("visibilitychange", onShow);
    return () => {
      stop = true;
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onShow);
    };
  }, [vehiclesMode, tr]);

  const shown = useMemo(() => (tech ? stops.filter((s) => s.techId === tech || s.team.some((t) => t.id === tech)) : stops), [stops, tech]);
  const vehicles = useMemo(() => (tech ? live.vehicles.filter((v) => v.driverId === tech || v.driverId === null) : live.vehicles), [live.vehicles, tech]);
  const byTech = useMemo(() => {
    const groups = new Map<string, { name: string; items: MapStop[] }>();
    for (const s of shown) {
      const key = s.techId === null ? "none" : String(s.techId);
      const g = groups.get(key) ?? { name: s.techName ?? tr("No technician"), items: [] };
      g.items.push(s);
      groups.set(key, g);
    }
    return [...groups.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [shown, tr]);
  const unplaced = shown.filter((s) => s.lat === null);
  const [y, m, d] = date.split("-").map(Number);
  const dow = new Date(y, m - 1, d).toLocaleDateString("en-US", { weekday: "long" });

  return (
    <div className="flex flex-col gap-3">
      {/* toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <Link href={q({ date: addDays(date, -1) })} aria-label={tr("Previous day")} className="inline-flex size-10 items-center justify-center rounded-lg border hover:bg-muted">
          <ChevronLeft className="size-5" aria-hidden />
        </Link>
        <Link href={q({ date: today })} className={cn("inline-flex h-10 items-center rounded-lg border px-3 text-sm hover:bg-muted", date === today && "bg-foreground text-background hover:bg-foreground")}>
          {tr("Today")}
        </Link>
        <Link href={q({ date: addDays(date, 1) })} aria-label={tr("Next day")} className="inline-flex size-10 items-center justify-center rounded-lg border hover:bg-muted">
          <ChevronRight className="size-5" aria-hidden />
        </Link>
        <input
          type="date"
          aria-label={tr("Day")}
          value={date}
          onChange={(e) => e.target.value && router.push(q({ date: e.target.value }))}
          className="h-10 rounded-lg border bg-card px-2 text-base"
        />
        <span className="text-sm font-medium">
          {tr(dow)} {formatDate(date)}
        </span>
        {people.length > 0 && (
          <select aria-label={tr("Technician")} value={tech ?? ""} onChange={(e) => router.push(q({ tech: e.target.value ? Number(e.target.value) : null }))} className="h-10 rounded-lg border bg-card px-2 text-base">
            <option value="">{tr("Everyone")}</option>
            {people.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        )}
        <span className="ml-auto text-xs text-muted-foreground">
          {tr("{n} stops", { n: shown.length })}
          {vehiclesMode === "on" && ` · ${tr("{n} vehicles", { n: vehicles.filter((v) => v.lat !== null).length })}`}
        </span>
      </div>

      {/* the map */}
      <div className="h-[52vh] min-h-[320px] overflow-hidden rounded-2xl border bg-muted shadow-card md:h-[60vh]">
        <LeafletMap stops={shown} vehicles={vehiclesMode === "on" ? vehicles : []} office={office} selected={selected} onSelect={setSelected} />
      </div>
      <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground" aria-label={tr("Blue: not there yet · Green: checked in · Red: checked out")}>
        {[
          [PIN_PLANNED, tr("not there yet")],
          [PIN_ON_SITE, tr("checked in")],
          [PIN_DONE, tr("checked out")],
        ].map(([color, label]) => (
          <span key={color} className="inline-flex items-center gap-1.5">
            <span className="size-3 rounded-full border border-white" style={{ backgroundColor: color }} aria-hidden />
            {label}
          </span>
        ))}
      </p>
      {live.error && vehiclesMode === "on" && <p className="rounded-[10px] bg-bad-bg px-3 py-2 text-sm text-bad-fg">{live.error}</p>}
      {vehiclesMode === "off" && isAdmin && (
        <p className="text-xs text-muted-foreground">
          {tr("The vans aren't on the map yet:")}{" "}
          <Link href="/admin/bouncie" className="underline underline-offset-4">
            {tr("connect Bouncie in Admin")}
          </Link>
          .
        </p>
      )}

      <div className="grid gap-3 md:grid-cols-2">
        {/* stops per technician */}
        <section className="min-w-0 rounded-2xl border bg-card px-[18px] py-4 shadow-card">
          <h2 className="mb-2 text-[15px] font-semibold tracking-tight">{tr("Jobs that day")}</h2>
          {!shown.length ? (
            <p className="text-sm text-text-2">{tr("No visits on this day.")}</p>
          ) : (
            byTech.map((g) => (
              <div key={g.name} className="mb-3 last:mb-0">
                <h3 className="mb-1 text-[13px] font-semibold text-text-2">{g.name}</h3>
                <ul className="divide-y rounded-lg border">
                  {g.items.map((s) => {
                    const key = `stop:${s.id}`;
                    return (
                      <li key={s.id} className={cn("flex items-start gap-3 px-3 py-2", selected === key && "bg-muted/60")}>
                        <button type="button" onClick={() => setSelected(key)} aria-label={tr("Show on the map")} className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-full text-xs font-semibold text-white" style={{ backgroundColor: s.color }}>
                          {s.initials ?? s.order}
                        </button>
                        <span className="min-w-0 flex-1">
                          <Link href={s.href} className="block truncate text-sm font-medium underline-offset-4 hover:underline">
                            {s.project}
                          </Link>
                          <span className="block text-xs text-text-2">
                            {clock(s.start.slice(11))} · {tr(s.status)}
                            {s.service ? ` · ${tr(s.service)}` : ""}
                            {s.team.length > 0 && ` · ${tr("with {names}", { names: s.team.map((t) => t.name).join(", ") })}`}
                            {s.vehicle ? ` · ${s.vehicle}` : ""}
                          </span>
                          <span className="block truncate text-xs text-muted-foreground">{s.address ?? tr("No job address")}{s.address && s.lat === null ? ` · ${tr("position unknown")}` : ""}</span>
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))
          )}
          {unplaced.length > 0 && <p className="mt-2 text-xs text-muted-foreground">{tr("{n} stops have no position (missing or unknown address) and are listed but not drawn.", { n: unplaced.length })}</p>}
        </section>

        {/* the vans */}
        {vehiclesMode !== "hidden" && (
          <section className="min-w-0 rounded-2xl border bg-card px-[18px] py-4 shadow-card">
            <h2 className="mb-2 flex items-center gap-2 text-[15px] font-semibold tracking-tight">
              <Truck className="size-4" aria-hidden /> {tr("Vehicles")}
              {live.at && <span className="ml-auto text-xs font-normal text-muted-foreground">{tr("live · refreshed every 15 s")}</span>}
            </h2>
            {vehiclesMode === "off" ? (
              <p className="text-sm text-text-2">{tr("Bouncie isn't connected.")}</p>
            ) : !vehicles.length ? (
              <p className="text-sm text-text-2">{live.at ? tr("No vehicles reported.") : tr("Loading…")}</p>
            ) : (
              <ul className="divide-y rounded-lg border">
                {vehicles.map((v) => {
                  const key = `veh:${v.imei}`;
                  const f = freshness(v.updatedAt);
                  return (
                    <li key={v.imei} className={cn("flex items-start gap-3 px-3 py-2", selected === key && "bg-muted/60")}>
                      <button
                        type="button"
                        onClick={() => v.lat !== null && setSelected(key)}
                        aria-label={tr("Show on the map")}
                        disabled={v.lat === null}
                        className={cn("mt-0.5 grid size-7 shrink-0 place-items-center rounded-full text-white disabled:opacity-40", f === "fresh" ? (v.isRunning ? "bg-warn-fg" : "bg-foreground") : "bg-muted-foreground")}
                      >
                        <Truck className="size-4" aria-hidden />
                      </button>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">
                          {v.driverName ?? v.name}
                          {v.vehicleTitle && <span className="font-normal text-text-2"> · {v.vehicleTitle}</span>}
                        </span>
                        <span className="block text-xs text-text-2">
                          {motionLabel(tr, v)} · {reportedLabel(tr, v.updatedAt)}
                        </span>
                        <span className="block truncate text-xs text-muted-foreground">{v.address ?? (v.lat === null ? tr("position unknown") : "")}</span>
                        {!v.vehicleId && isAdmin && <span className="block text-xs text-muted-foreground">{tr("Not matched to a Fleet record (VIN or Bouncie device).")}</span>}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        )}
      </div>
    </div>
  );
}
