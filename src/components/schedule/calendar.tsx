"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { toast } from "sonner";
import { fromDateTimeLocalET } from "@/lib/dates";
import { moveVisitAction } from "@/lib/schedule/actions";
import { addDays, clock, fromMinutes, lanes, toMinutes } from "@/lib/schedule/dates";
import type { CalPerson, CalVisit } from "@/lib/schedule/week";
import { cn } from "@/lib/utils";
import { useT } from "@/i18n/client";

type View = "week" | "team" | "list";
type Props = { weekStart: string; today: string; view: View; tech: number | null; visits: CalVisit[]; people: CalPerson[]; canEdit: boolean; canCreate: boolean };

const HS = 6; // first hour shown
const HE = 21; // last hour shown (exclusive)
const PX = 48; // pixels per hour
const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const VIEW_LABEL: Record<View, string> = { week: "Week", team: "Team", list: "List" };
const BASE = "/schedule/calendar";

const dayLabel = (d: string) => {
  const [y, m, day] = d.split("-").map(Number);
  return { dow: DOW[new Date(Date.UTC(y, m - 1, day)).getUTCDay()], md: `${m}/${day}` };
};
const endOf = (v: CalVisit) => fromMinutes(Math.min(24 * 60 - 1, toMinutes(v.start.slice(11)) + v.duration));
const windowText = (v: CalVisit) => (v.window > 0 ? `${clock(v.start.slice(11))}–${clock(fromMinutes(toMinutes(v.start.slice(11)) + v.window))}` : clock(v.start.slice(11)));
const visitHref = (v: CalVisit) => `/schedule/visits/${v.id}`;

export function Calendar({ weekStart, today, view, tech, visits, people, canEdit, canCreate }: Props) {
  const tr = useT();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [drag, setDrag] = useState<{ id: number; offset: number } | null>(null);
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const name = new Map(people.map((p) => [p.id, p.name]));
  const shown = tech ? visits.filter((v) => v.techId === tech || v.team.includes(tech)) : visits;
  const q = (o: Partial<{ view: View; week: string; tech: number | null }>) => {
    const p = new URLSearchParams();
    const w = o.week ?? weekStart;
    const vw = o.view ?? view;
    const t = o.tech === undefined ? tech : o.tech;
    if (vw !== "week") p.set("view", vw);
    if (w !== weekStart || o.week) p.set("week", w);
    if (t) p.set("tech", String(t));
    const s = p.toString();
    return s ? `${BASE}?${s}` : BASE;
  };
  const newHref = (date: string, time = "09:00", techId?: number) => {
    const p = new URLSearchParams({ starts_at: fromDateTimeLocalET(`${date}T${time}`), back: q({}) });
    if (techId ?? tech) p.set("technician_id", String(techId ?? tech));
    return `/schedule/visits/new?${p}`;
  };

  const move = (id: number, date: string, time: string, techId?: number) => {
    const v = visits.find((x) => x.id === id);
    if (!v || (v.start === `${date}T${time}` && (!techId || techId === v.techId))) return;
    start(async () => {
      const r = await moveVisitAction(id, fromDateTimeLocalET(`${date}T${time}`), techId);
      if (!r.ok) return void toast.error(tr(r.message));
      toast.success(`${tr("Moved to {when}", { when: `${tr(dayLabel(date).dow)} ${dayLabel(date).md}, ${clock(time)}` })}${techId && techId !== v.techId ? ` · ${name.get(techId) ?? ""}` : ""}`);
      router.refresh();
    });
  };

  const [y, m, d] = weekStart.split("-").map(Number);
  const last = dayLabel(days[6]);
  const title = `${m}/${d} – ${last.md}/${days[6].slice(0, 4)}`;
  void y;

  return (
    <div className={cn(pending && "opacity-70")}>
      {/* toolbar */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1">
          <Link href={q({ week: addDays(weekStart, -7) })} aria-label={tr("Previous week")} className="inline-flex size-10 items-center justify-center rounded-lg border hover:bg-muted">
            <ChevronLeft className="size-4" aria-hidden />
          </Link>
          <Link href={q({ week: today })} className="inline-flex h-10 items-center rounded-lg border px-3 text-sm hover:bg-muted">
            {tr("Today")}
          </Link>
          <Link href={q({ week: addDays(weekStart, 7) })} aria-label={tr("Next week")} className="inline-flex size-10 items-center justify-center rounded-lg border hover:bg-muted">
            <ChevronRight className="size-4" aria-hidden />
          </Link>
        </div>
        <span className="text-base font-medium">{title}</span>
        <span className="grow" />
        <div className="flex rounded-lg border p-0.5 text-sm" role="tablist" aria-label={tr("View")}>
          {(["week", "team", "list"] as View[]).map((v) => (
            <Link key={v} href={q({ view: v })} role="tab" aria-selected={view === v} className={cn("rounded-md px-3 py-1.5 capitalize", view === v ? "bg-foreground text-background" : "hover:bg-muted")}>
              {tr(VIEW_LABEL[v])}
            </Link>
          ))}
        </div>
        <select
          aria-label={tr("Technician")}
          className="h-10 rounded-lg border bg-card px-2 text-base md:text-sm"
          value={tech ?? ""}
          onChange={(e) => router.push(q({ tech: e.target.value ? Number(e.target.value) : null }))}
        >
          <option value="">{tr("Everyone")}</option>
          {people.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        {canCreate && (
          <Link href={newHref(days.includes(today) ? today : weekStart)} className="inline-flex h-10 items-center gap-1 rounded-lg border border-foreground bg-foreground px-3 text-sm font-medium text-background">
            <Plus className="size-4" aria-hidden /> {tr("New visit")}
          </Link>
        )}
      </div>

      {view === "week" && (
        <>
          <div className="hidden md:block">
            <WeekGrid days={days} today={today} visits={shown} name={name} canEdit={canEdit} canCreate={canCreate} drag={drag} setDrag={setDrag} move={move} newHref={newHref} />
          </div>
          <div className="md:hidden">
            <DayList days={days} today={today} visits={shown} name={name} />
          </div>
        </>
      )}
      {view === "team" && <TeamGrid days={days} today={today} visits={shown} people={tech ? people.filter((p) => p.id === tech) : people} canEdit={canEdit} canCreate={canCreate} drag={drag} setDrag={setDrag} move={move} newHref={newHref} />}
      {view === "list" && <DayList days={days} today={today} visits={shown} name={name} />}
      {!shown.length && <p className="mt-4 text-center text-sm text-muted-foreground">{tr(tech ? "No visits this week for this person." : "No visits this week.")}</p>}
    </div>
  );
}

type GridProps = {
  days: string[];
  today: string;
  visits: CalVisit[];
  canEdit: boolean;
  canCreate: boolean;
  drag: { id: number; offset: number } | null;
  setDrag: (d: { id: number; offset: number } | null) => void;
  move: (id: number, date: string, time: string, techId?: number) => void;
  newHref: (date: string, time?: string, techId?: number) => string;
};

function VisitBlock({ v, name, compact }: { v: CalVisit; name?: Map<number, string>; compact?: boolean }) {
  const people = [v.techId, ...v.team].filter((x): x is number => x !== null).map((id) => name?.get(id)?.split(" ")[0] ?? "");
  return (
    <>
      <span className="block truncate font-medium">{v.project}</span>
      <span className="block truncate opacity-80">
        {windowText(v)}
        {!compact && people.length ? ` · ${people.join(", ")}` : ""}
      </span>
      {!compact && v.service && <span className="block truncate opacity-80">{v.service}</span>}
    </>
  );
}

function WeekGrid({ days, today, visits, name, canEdit, canCreate, drag, setDrag, move, newHref }: GridProps & { name: Map<number, string> }) {
  const tr = useT();
  const router = useRouter();
  const hours = Array.from({ length: HE - HS }, (_, i) => HS + i);
  return (
    <div className="overflow-hidden rounded-2xl border bg-card shadow-card">
      <div className="grid grid-cols-[3.5rem_repeat(7,minmax(0,1fr))] border-b bg-muted/40 text-sm">
        <div />
        {days.map((d) => (
          <div key={d} className={cn("border-l px-2 py-2 text-center", d === today && "font-semibold text-primary")}>
            {tr(dayLabel(d).dow)} {dayLabel(d).md}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-[3.5rem_repeat(7,minmax(0,1fr))]" style={{ height: (HE - HS) * PX }}>
        <div className="relative">
          {hours.map((h) => (
            <div key={h} className="absolute right-1 -translate-y-1/2 text-[11px] text-muted-foreground" style={{ top: (h - HS) * PX }}>
              {h > HS ? clock(fromMinutes(h * 60)).replace(":00", "") : ""}
            </div>
          ))}
        </div>
        {days.map((d) => {
          const items = lanes(
            visits
              .filter((v) => v.start.slice(0, 10) === d)
              .map((v) => {
                const s = toMinutes(v.start.slice(11));
                return { v, start: s, end: s + v.duration };
              }),
          );
          return (
            <div
              key={d}
              className={cn("relative border-l", d === today && "bg-primary/5")}
              style={{ backgroundImage: `repeating-linear-gradient(to bottom, transparent 0, transparent ${PX - 1}px, var(--border) ${PX - 1}px, var(--border) ${PX}px)` }}
              onDragOver={(e) => canEdit && drag && e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                if (!drag) return;
                const rect = e.currentTarget.getBoundingClientRect();
                const y = e.clientY - rect.top - drag.offset;
                const min = Math.max(0, Math.min(24 * 60 - 15, Math.round((HS * 60 + (y / PX) * 60) / 15) * 15));
                move(drag.id, d, fromMinutes(min));
                setDrag(null);
              }}
              onDoubleClick={(e) => {
                if (!canCreate || e.target !== e.currentTarget) return;
                const rect = e.currentTarget.getBoundingClientRect();
                const min = Math.round((HS * 60 + ((e.clientY - rect.top) / PX) * 60) / 30) * 30;
                router.push(newHref(d, fromMinutes(min)));
              }}
              title={canCreate ? tr("Double-click to schedule a visit here") : undefined}
            >
              {items.map(({ v, start, end, lane, lanes: n }) => (
                <Link
                  key={v.id}
                  href={visitHref(v)}
                  draggable={canEdit}
                  onDragStart={(e) => {
                    setDrag({ id: v.id, offset: e.clientY - e.currentTarget.getBoundingClientRect().top });
                    e.dataTransfer.effectAllowed = "move";
                  }}
                  onDragEnd={() => setDrag(null)}
                  className={cn("absolute overflow-hidden rounded-md border-l-4 bg-card px-1.5 py-1 text-xs shadow-sm ring-1 ring-border hover:z-10 hover:shadow-md", v.status === "Cancelled" && "line-through opacity-60")}
                  style={{
                    top: Math.max(0, ((start - HS * 60) / 60) * PX),
                    height: Math.max(22, ((Math.min(end, HE * 60) - Math.max(start, HS * 60)) / 60) * PX - 2),
                    left: `calc(${(lane / n) * 100}% + 2px)`,
                    width: `calc(${100 / n}% - 4px)`,
                    borderLeftColor: v.color,
                  }}
                >
                  <VisitBlock v={v} name={name} compact={end - start < 60} />
                </Link>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function TeamGrid({ days, today, visits, people, canEdit, canCreate, drag, setDrag, move, newHref }: GridProps & { people: CalPerson[] }) {
  const tr = useT();
  return (
    <div className="overflow-x-auto rounded-2xl border bg-card shadow-card">
      <table className="w-full min-w-[56rem] table-fixed border-collapse text-sm">
        <thead className="bg-muted/40">
          <tr>
            <th className="w-36 px-2 py-2 text-left font-medium">{tr("Technician")}</th>
            {days.map((d) => (
              <th key={d} className={cn("border-l px-2 py-2 font-medium", d === today && "text-primary")}>
                {tr(dayLabel(d).dow)} {dayLabel(d).md}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {people.map((p) => (
            <tr key={p.id} className="border-t align-top">
              <th scope="row" className="px-2 py-2 text-left font-normal">
                {p.name}
              </th>
              {days.map((d) => {
                const cell = visits.filter((v) => v.start.slice(0, 10) === d && (v.techId === p.id || v.team.includes(p.id)));
                return (
                  <td
                    key={d}
                    className={cn("h-20 border-l p-1", d === today && "bg-primary/5")}
                    onDragOver={(e) => canEdit && drag && e.preventDefault()}
                    onDrop={(e) => {
                      e.preventDefault();
                      if (!drag) return;
                      const v = visits.find((x) => x.id === drag.id);
                      if (v) move(v.id, d, v.start.slice(11), p.id);
                      setDrag(null);
                    }}
                  >
                    <div className="flex flex-col gap-1">
                      {cell.map((v) => (
                        <Link
                          key={v.id}
                          href={visitHref(v)}
                          draggable={canEdit && v.techId === p.id}
                          onDragStart={(e) => {
                            setDrag({ id: v.id, offset: 0 });
                            e.dataTransfer.effectAllowed = "move";
                          }}
                          onDragEnd={() => setDrag(null)}
                          className={cn("block rounded-md border-l-4 bg-card px-1.5 py-1 text-xs ring-1 ring-border hover:shadow-md", v.techId !== p.id && "border-dashed opacity-80", v.status === "Cancelled" && "line-through opacity-60")}
                          style={{ borderLeftColor: v.color }}
                          title={v.techId !== p.id ? tr("Going along (not the lead technician)") : undefined}
                        >
                          <VisitBlock v={v} compact />
                        </Link>
                      ))}
                      {canCreate && (
                        <Link href={newHref(d, "09:00", p.id)} className="rounded-md py-0.5 text-center text-xs text-muted-foreground opacity-0 hover:bg-muted hover:opacity-100 focus:opacity-100" aria-label={`New visit for ${p.name} on ${d}`}>
                          +
                        </Link>
                      )}
                    </div>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function DayList({ days, today, visits, name }: { days: string[]; today: string; visits: CalVisit[]; name: Map<number, string> }) {
  const tr = useT();
  return (
    <div className="flex flex-col gap-4">
      {days.map((d) => {
        const items = visits.filter((v) => v.start.slice(0, 10) === d);
        return (
          <section key={d}>
            <h2 className={cn("mb-1 text-sm font-semibold", d === today ? "text-primary" : "text-muted-foreground")}>
              {tr(dayLabel(d).dow)} {dayLabel(d).md}
              {d === today && ` · ${tr("Today")}`}
            </h2>
            {!items.length ? (
              <p className="text-sm text-muted-foreground">—</p>
            ) : (
              <ul className="divide-y rounded-2xl border bg-card shadow-card">
                {items.map((v) => (
                  <li key={v.id}>
                    <Link href={visitHref(v)} className="flex min-h-14 gap-3 px-3 py-2 hover:bg-muted/50 active:bg-muted">
                      <span className="mt-1 size-2.5 shrink-0 rounded-full" style={{ backgroundColor: v.color }} aria-hidden />
                      <span className="min-w-0 flex-1">
                        <span className={cn("block truncate text-base font-medium", v.status === "Cancelled" && "line-through")}>{v.project}</span>
                        <span className="block text-sm text-muted-foreground">
                          {windowText(v)} · {tr("until {time}", { time: clock(endOf(v)) })} · {[v.techId, ...v.team].filter((x): x is number => x !== null).map((id) => name.get(id) ?? "").join(", ") || tr("No technician")}
                        </span>
                        {v.address && <span className="block truncate text-xs text-muted-foreground">{v.address}</span>}
                      </span>
                      <span className="shrink-0 text-xs text-muted-foreground">{tr(v.status)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        );
      })}
    </div>
  );
}
