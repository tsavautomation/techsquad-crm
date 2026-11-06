"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Check, ChevronDown, ChevronRight, Loader2, Lock, MapPin, Pencil, Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { acceptSuggestedEndAction, correctEntryAction, removeEntryAction, reviewShiftAction, setShiftDetailsAction } from "@/lib/time-clock/actions";
import { addManualShiftAction } from "@/lib/time-clock/manual";
import { reasonNeeded } from "@/lib/time-clock/person-sheet";
import { removeTimeOffAction, setTimeOffAction } from "@/lib/time-clock/time-off";
import { TIME_OFF_KINDS, type TimeOffKind } from "@/lib/time-clock/time-off-kinds";
import { FLAG_TEXT, formatHours } from "@/lib/time-clock/timesheet";
import { clock } from "@/lib/schedule/dates";
import { cn } from "@/lib/utils";
import { useT } from "@/i18n/client";
import { ProjectPicker } from "./project-picker";
import type { DayView, EventView, Loc, ShiftView } from "./types";

// TS-b Person panel (Fred 2026-11-04, Part 3): one row per day. Each shift shows its type, job, start and end
// with where the phone was, and the total; the pencil edits them in place (brief item 2). "+" adds another
// shift to the day (item 3). A forgotten clock-out shows an empty yellow End with the system's suggestion
// (items 4–5). Changing a recorded time asks why; filling an empty field does not (item 7). The day's
// On my way / Arrived / Left events open under the row and never count (item 9).

const EVENT_LABEL: Record<EventView["kind"], string> = { clock_in: "Clocked in", clock_out: "Clocked out", on_way: "On my way", visit_in: "Arrived at the job", visit_out: "Left the job" };
const PLACE_TONE: Record<Loc["place"], string> = { Office: "text-info-fg", "On site": "text-ok-fg", Elsewhere: "text-warn-fg", Unknown: "text-muted-foreground" };
const BOX = "h-11 min-w-0 rounded-[10px] border bg-background px-3 text-base";
const BTN = "inline-flex h-9 items-center gap-1 rounded-md border px-2 text-xs hover:bg-muted disabled:opacity-50";
const GRID = "md:grid md:grid-cols-[64px_minmax(0,1fr)_140px_140px_64px_auto] md:items-start md:gap-x-3";

type Props = { employeeId: number; day: DayView; canFix: boolean; admin: boolean };

export function DayRow({ employeeId, day, canFix, admin }: Props) {
  const t = useT();
  const [adding, setAdding] = useState(false);
  const [showEvents, setShowEvents] = useState(false);
  const empty = day.shifts.length === 0 && !day.timeOff;
  const editable = canFix && !day.locked && !day.isFuture;
  return (
    <li id={`d-${day.date}`} className={cn("scroll-mt-24 px-3 py-2.5 md:px-4", day.isToday && "bg-primary/5")}>
      <div className="md:grid md:grid-cols-[88px_minmax(0,1fr)] md:gap-x-3">
        <div className="mb-1 flex items-baseline justify-between md:mb-0 md:block">
          <span className={cn("text-[13px] font-semibold tabular-nums", day.isToday && "text-primary")}>
            {t(day.dow)} {day.label}
          </span>
          <span className="text-[13px] font-semibold tabular-nums md:hidden">{day.minutes > 0 ? formatHours(day.minutes) : empty ? "" : "0:00"}</span>
          {day.locked && <Lock className="ml-1 inline size-3.5 text-ok-fg" aria-label={t("Period approved")} />}
          {(day.trip || day.overtime > 0) && (
            <span className="ml-1 inline-flex flex-wrap gap-1 align-middle md:ml-0 md:mt-0.5 md:flex">
              {day.trip && <span className="rounded bg-info-bg px-1 text-[10px] font-medium text-info-fg">{t("Trip {pct}", { pct: day.trip })}</span>}
              {day.overtime > 0 && <span className="rounded bg-warn-bg px-1 text-[10px] font-medium text-warn-fg">{t("OT {h}", { h: formatHours(day.overtime) })}</span>}
            </span>
          )}
        </div>
        <div className="min-w-0">
          {empty && !adding && <p className="text-[13px] text-muted-foreground">{day.isFuture ? "" : "–"}</p>}
          <ul className="grid gap-2">
            {day.shifts.map((s) => (
              <ShiftRow key={s.inId} employeeId={employeeId} s={s} editable={editable} admin={admin} />
            ))}
            {day.timeOff && <TimeOffRow employeeId={employeeId} day={day.date} off={day.timeOff} editable={canFix && !day.locked} />}
          </ul>
          {adding && <AddShift employeeId={employeeId} day={day.date} onDone={() => setAdding(false)} />}
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
            {editable && !adding && (
              <button type="button" onClick={() => setAdding(true)} className="inline-flex h-8 items-center gap-1 rounded-md px-1.5 text-primary hover:bg-muted" aria-label={t("Add a shift on {date}", { date: day.label })}>
                <Plus className="size-3.5" aria-hidden /> {t("Shift")}
              </button>
            )}
            {day.events.length > 0 && (
              <button type="button" onClick={() => setShowEvents((v) => !v)} className="inline-flex h-8 items-center gap-1 rounded-md px-1.5 text-text-2 hover:bg-muted" aria-expanded={showEvents}>
                {showEvents ? <ChevronDown className="size-3.5" aria-hidden /> : <ChevronRight className="size-3.5" aria-hidden />}
                {t("{n} events", { n: day.events.length })}
              </button>
            )}
            {day.shifts.length > 1 && (
              <span className="ml-auto hidden font-semibold tabular-nums md:inline">
                {t("Day")} {formatHours(day.minutes)}
              </span>
            )}
          </div>
          {showEvents && (
            <ol className="mt-1 grid gap-1 rounded-lg bg-muted/60 px-2.5 py-1.5 text-xs">
              {day.events.map((e) => (
                <li key={e.id} className="flex flex-wrap items-center gap-x-2">
                  <span className="w-[64px] font-medium tabular-nums">{clock(e.time)}</span>
                  <span>
                    {t(EVENT_LABEL[e.kind])}
                    {e.project && <span className="text-text-2"> · {e.project}</span>}
                  </span>
                  <Where loc={e.loc} />
                </li>
              ))}
              <li className="text-muted-foreground">{t("Events describe the day; they never change the hours.")}</li>
            </ol>
          )}
        </div>
      </div>
    </li>
  );
}

function Where({ loc, label }: { loc: Loc; label?: string }) {
  const t = useT();
  const text = loc.lat !== null && loc.lng !== null ? `${t(loc.place)}${loc.distance ? ` · ${loc.distance}` : ""}` : t("no location");
  return (
    <span className={cn("inline-flex items-center gap-1 text-xs", PLACE_TONE[loc.place])}>
      <MapPin className="size-3.5 shrink-0" aria-hidden />
      {loc.lat !== null && loc.lng !== null ? (
        <a href={`https://www.google.com/maps/search/?api=1&query=${loc.lat},${loc.lng}`} target="_blank" rel="noopener noreferrer" className="hover:underline" aria-label={label}>
          {text}
        </a>
      ) : (
        text
      )}
    </span>
  );
}

// ---------------------------------------------------------------- one shift

function ShiftRow({ employeeId, s, editable, admin }: { employeeId: number; s: ShiftView; editable: boolean; admin: boolean }) {
  const t = useT();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [editing, setEditing] = useState(false);
  const [startT, setStartT] = useState(s.start);
  const [endT, setEndT] = useState(s.end ?? "");
  const [projectId, setProjectId] = useState(s.projectId);
  const [projectTitle, setProjectTitle] = useState(s.projectTitle);
  const [note, setNote] = useState(s.managerNote ?? "");
  const [reason, setReason] = useState("");
  const mayEdit = editable && (s.lock !== "period" || admin);
  const startChanged = startT !== s.start;
  const endChanged = endT !== (s.end ?? "");
  const needReason = s.lock === "period" || reasonNeeded({ recorded: true, suggested: false, changed: startChanged }) || reasonNeeded({ recorded: s.outId !== null, suggested: s.suggestedEnd !== null, changed: endChanged });

  function reset() {
    setStartT(s.start);
    setEndT(s.end ?? "");
    setProjectId(s.projectId);
    setProjectTitle(s.projectTitle);
    setNote(s.managerNote ?? "");
    setReason("");
    setEditing(false);
  }

  function save() {
    if (needReason && !reason.trim()) return void toast.error(t("Say why you are changing a recorded time."));
    start(async () => {
      const why = reason.trim() || undefined;
      const steps: (() => Promise<{ ok: true } | { ok: false; message: string }>)[] = [];
      if (startChanged) steps.push(() => correctEntryAction(s.inId, startT, why));
      if (endChanged && endT) {
        if (s.outId === null) steps.push(async () => addManualShiftAction({ employeeId, day: s.day, inTime: "", outTime: endT, reason: why ?? "" }));
        else steps.push(() => correctEntryAction(s.outId!, endT, why));
      }
      if (projectId !== s.projectId || note.trim() !== (s.managerNote ?? "")) steps.push(() => setShiftDetailsAction(s.inId, { projectId, managerNote: note }));
      for (const step of steps) {
        const r = await step();
        if (!r.ok) return void toast.error(t(r.message));
      }
      if (steps.length) toast.success(t("Saved"));
      setEditing(false);
      setReason("");
      router.refresh();
    });
  }

  function remove() {
    if (!confirm(t("Remove this shift (its clock-in and clock-out)?"))) return;
    start(async () => {
      const why = reason.trim() || undefined;
      for (const id of [s.outId, s.inId]) {
        if (id === null) continue;
        const r = await removeEntryAction(id, why);
        if (!r.ok) return void toast.error(t(r.message));
      }
      toast.success(t("Shift removed"));
      setEditing(false);
      router.refresh();
    });
  }

  const flagged = s.flags.length > 0;
  const endMissing = s.end === null && !s.openNow;

  if (editing)
    return (
      <li className={cn("rounded-xl border bg-muted/40 p-2.5", GRID)}>
        <span className="text-xs font-medium text-text-2 md:pt-3">{t("Shift")}</span>
        <div className="mt-1 md:mt-0">
          <ProjectPicker
            value={projectId}
            label={projectTitle}
            onChange={(id, label) => {
              setProjectId(id);
              setProjectTitle(label);
            }}
          />
        </div>
        <label className="mt-2 block md:mt-0">
          <span className="text-[11px] text-text-2">{t("Start")}</span>
          <input type="time" value={startT} onChange={(e) => setStartT(e.target.value)} className={`${BOX} w-full`} aria-label={t("Start")} />
        </label>
        <label className="mt-2 block md:mt-0">
          <span className="text-[11px] text-text-2">{s.suggestedEnd ? t("End (suggested {time})", { time: clock(s.suggestedEnd) }) : t("End")}</span>
          <input type="time" value={endT} onChange={(e) => setEndT(e.target.value)} className={cn(BOX, "w-full", !endT && "border-warn-fg/50 bg-warn-bg")} aria-label={t("End")} />
        </label>
        <span className="hidden md:block" />
        <span className="hidden md:block" />
        <div className="mt-2 md:col-span-6">
          <input type="text" value={note} onChange={(e) => setNote(e.target.value)} placeholder={t("Manager note")} aria-label={t("Manager note")} className={`${BOX} w-full`} maxLength={500} />
        </div>
        {needReason && (
          <div className="mt-2 md:col-span-6">
            <input type="text" value={reason} onChange={(e) => setReason(e.target.value)} placeholder={s.lock === "period" ? t("Why (pay period approved)") : t("Why is the recorded time changing?")} aria-label={t("Reason")} className={`${BOX} w-full border-warn-fg/50`} maxLength={300} required />
          </div>
        )}
        <div className="mt-2 flex flex-wrap items-center gap-1.5 md:col-span-6">
          <button type="button" onClick={save} disabled={pending} className="inline-flex h-9 items-center gap-1 rounded-md bg-primary px-3 text-xs font-semibold text-primary-foreground disabled:opacity-50">
            {pending ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : <Check className="size-3.5" aria-hidden />} {t("Save")}
          </button>
          <button type="button" onClick={reset} className={BTN}>
            {t("Cancel")}
          </button>
          {s.lock !== "period" && (
            <button type="button" onClick={remove} disabled={pending} className={`${BTN} ml-auto text-destructive`}>
              <Trash2 className="size-3.5" aria-hidden /> {t("Remove shift")}
            </button>
          )}
        </div>
      </li>
    );

  return (
    <li className={cn("grid grid-cols-2 gap-x-3 gap-y-1 rounded-xl px-1 py-1", GRID, s.needsReview && "bg-warn-bg/60")}>
      <span className="text-xs text-text-2 md:pt-0.5">
        {t("Shift")}
        {s.lock === "period" && <Lock className="ml-1 inline size-3 text-muted-foreground" aria-label={t("In an approved pay period")} />}
      </span>
      <span className="truncate text-[13px] md:order-none">{s.projectTitle ? s.projectTitle : <span className="text-muted-foreground">{t("No job")}</span>}</span>
      <div className="text-[13px]">
        <span className="font-medium tabular-nums">{clock(s.start)}</span>
        {s.startCorrectedFrom && <span className="ml-1 rounded bg-muted px-1 text-[11px] text-muted-foreground">{t("was {time}", { time: clock(s.startCorrectedFrom) })}</span>}
        <div>
          <Where loc={s.startLoc} />
        </div>
      </div>
      <div className="text-[13px]">
        {s.end ? (
          <>
            <span className="font-medium tabular-nums">{clock(s.end)}</span>
            {s.endNextDay && <span className="ml-1 text-[11px] text-text-2">+1</span>}
            {s.endCorrectedFrom && <span className="ml-1 rounded bg-muted px-1 text-[11px] text-muted-foreground">{t("was {time}", { time: clock(s.endCorrectedFrom) })}</span>}
          </>
        ) : s.openNow ? (
          <span className="rounded bg-ok-bg px-1.5 text-[11px] font-medium text-ok-fg">{t("Clocked in")}</span>
        ) : (
          <span className="inline-flex flex-wrap items-center gap-1 rounded-md border border-warn-fg/50 bg-warn-bg px-1.5 py-0.5 text-[11px] text-warn-fg">
            <AlertTriangle className="size-3" aria-hidden />
            {s.suggestedEnd ? t("no clock-out · suggested {time}", { time: clock(s.suggestedEnd) }) : t("no clock-out")}
          </span>
        )}
        {s.endLoc && (
          <div>
            <Where loc={s.endLoc} />
          </div>
        )}
      </div>
      <span className={cn("text-[13px] font-semibold tabular-nums md:text-right", s.minutes === 0 && "text-muted-foreground")}>{s.openNow ? `${formatHours(s.minutes)}…` : formatHours(s.minutes)}</span>
      <span className="flex flex-wrap items-center justify-end gap-1 md:justify-start">
        {mayEdit && endMissing && s.suggestedEnd && s.outId !== null && (
          <button
            type="button"
            disabled={pending}
            className={`${BTN} border-warn-fg/40 font-medium`}
            onClick={() =>
              start(async () => {
                const r = await acceptSuggestedEndAction(s.outId!);
                if (!r.ok) return void toast.error(t(r.message));
                toast.success(t("Suggested time accepted"));
                router.refresh();
              })
            }
          >
            <Check className="size-3.5" aria-hidden /> {t("Use suggested time")}
          </button>
        )}
        {mayEdit && (
          <button type="button" className={BTN} onClick={() => setEditing(true)} aria-label={t("Edit this shift")}>
            {s.lock === "period" ? <Lock className="size-3.5" aria-hidden /> : <Pencil className="size-3.5" aria-hidden />}
          </button>
        )}
      </span>
      {(flagged || s.managerNote || s.notes.length > 0) && (
        <div className="col-span-2 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs md:col-span-6">
          {flagged && (
            <span className={cn("inline-flex items-center gap-1", s.needsReview ? "text-warn-fg" : "text-text-2")}>
              <AlertTriangle className="size-3.5" aria-hidden />
              {s.flags.map((f) => t(FLAG_TEXT[f])).join(" · ")}
              {!s.flags.includes("adjust") && (s.needsReview ? ` · ${t("Needs review")}` : ` · ${t("Reviewed")}`)}
            </span>
          )}
          {flagged && mayEdit && !s.flags.includes("adjust") && (
            <button
              type="button"
              disabled={pending}
              className="inline-flex h-7 items-center gap-1 rounded-md px-1.5 text-xs font-medium text-primary hover:bg-muted disabled:opacity-50"
              onClick={() =>
                start(async () => {
                  const r = await reviewShiftAction(s.inId, s.needsReview);
                  if (!r.ok) return void toast.error(t(r.message));
                  router.refresh();
                })
              }
            >
              {s.needsReview ? t("Mark as reviewed") : t("Undo review")}
            </button>
          )}
          {s.managerNote && (
            <span className="text-foreground">
              <span className="text-text-2">{t("Manager note")}:</span> {s.managerNote}
            </span>
          )}
          {s.notes.map((n, i) => (
            <span key={i} className="text-muted-foreground">
              {n}
            </span>
          ))}
        </div>
      )}
    </li>
  );
}

// ---------------------------------------------------------------- time off

function TimeOffRow({ employeeId, day, off, editable }: { employeeId: number; day: string; off: NonNullable<DayView["timeOff"]>; editable: boolean }) {
  const t = useT();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [editing, setEditing] = useState(false);
  const [kind, setKind] = useState<TimeOffKind>(off.kind as TimeOffKind);
  const [hours, setHours] = useState(String(off.minutes / 60));
  const [paid, setPaid] = useState(off.paid);
  const [note, setNote] = useState(off.note ?? "");

  if (editing)
    return (
      <li className="rounded-xl border bg-muted/40 p-2.5">
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <select value={kind} onChange={(e) => setKind(e.target.value as TimeOffKind)} aria-label={t("Type")} className={BOX}>
            {TIME_OFF_KINDS.map((k) => (
              <option key={k} value={k}>
                {t(k)}
              </option>
            ))}
          </select>
          <label className="flex h-11 items-center gap-2 text-sm">
            <input type="number" inputMode="decimal" min={0} max={24} step="0.5" value={hours} onChange={(e) => setHours(e.target.value)} aria-label={t("Hours")} className={`${BOX} w-24`} />
            {t("hours")}
            <input type="checkbox" checked={kind === "Unpaid" ? false : paid} disabled={kind === "Unpaid"} onChange={(e) => setPaid(e.target.checked)} className="ml-2 size-5" />
            {t("Paid")}
          </label>
          <input type="text" value={note} onChange={(e) => setNote(e.target.value)} placeholder={t("Note (optional)")} aria-label={t("Note (optional)")} className={`${BOX} lg:col-span-2`} maxLength={300} />
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            disabled={pending}
            className="inline-flex h-9 items-center gap-1 rounded-md bg-primary px-3 text-xs font-semibold text-primary-foreground disabled:opacity-50"
            onClick={() =>
              start(async () => {
                const r = await setTimeOffAction({ employeeId, day, kind, paid, hours, note });
                if (!r.ok) return void toast.error(t(r.message));
                toast.success(t("Saved"));
                setEditing(false);
                router.refresh();
              })
            }
          >
            <Check className="size-3.5" aria-hidden /> {t("Save")}
          </button>
          <button type="button" onClick={() => setEditing(false)} className={BTN}>
            {t("Cancel")}
          </button>
          <button
            type="button"
            disabled={pending}
            className={`${BTN} ml-auto text-destructive`}
            onClick={() => {
              if (!confirm(t("Remove this time off?"))) return;
              start(async () => {
                const r = await removeTimeOffAction(off.id);
                if (!r.ok) return void toast.error(t(r.message));
                router.refresh();
              });
            }}
          >
            <Trash2 className="size-3.5" aria-hidden /> {t("Remove")}
          </button>
        </div>
      </li>
    );

  return (
    <li className={cn("grid grid-cols-2 gap-x-3 gap-y-1 rounded-xl px-1 py-1", GRID)}>
      <span className="text-xs text-text-2 md:pt-0.5">{t("Time off")}</span>
      <span className="text-[13px]">
        {t(off.kind)}
        <span className="ml-1 rounded bg-muted px-1 text-[11px] text-muted-foreground">{off.paid ? t("Paid") : t("Unpaid")}</span>
        {off.note && <span className="ml-1 text-text-2">· {off.note}</span>}
      </span>
      <span className="hidden md:block" />
      <span className="hidden md:block" />
      <span className="text-[13px] font-semibold tabular-nums md:text-right">{off.paid ? formatHours(off.minutes) : ""}</span>
      <span className="flex justify-end md:justify-start">
        {editable && (
          <button type="button" className={BTN} onClick={() => setEditing(true)} aria-label={t("Edit this time off")}>
            <Pencil className="size-3.5" aria-hidden />
          </button>
        )}
      </span>
    </li>
  );
}

// ---------------------------------------------------------------- "+" another shift

function AddShift({ employeeId, day, onDone }: { employeeId: number; day: string; onDone: () => void }) {
  const t = useT();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [inTime, setIn] = useState("");
  const [outTime, setOut] = useState("");
  const [reason, setReason] = useState("");
  return (
    <form
      className="mt-2 rounded-xl border bg-muted/40 p-2.5"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = await addManualShiftAction({ employeeId, day, inTime, outTime, reason });
          if (!r.ok) return void toast.error(t(r.message));
          toast.success(r.added.length === 2 ? t("Shift added.") : r.added[0] === "clock_in" ? t("Clock-in added.") : t("Clock-out added."));
          onDone();
          router.refresh();
        });
      }}
    >
      <div className="grid gap-2 sm:grid-cols-3">
        <label className="block">
          <span className="text-[11px] text-text-2">{t("Start")}</span>
          <input type="time" value={inTime} onChange={(e) => setIn(e.target.value)} className={`${BOX} w-full`} aria-label={t("Clock-in time")} />
        </label>
        <label className="block">
          <span className="text-[11px] text-text-2">{t("End")}</span>
          <input type="time" value={outTime} onChange={(e) => setOut(e.target.value)} className={`${BOX} w-full`} aria-label={t("Clock-out time")} />
        </label>
        <label className="block">
          <span className="text-[11px] text-text-2">{t("Note (optional)")}</span>
          <input type="text" value={reason} onChange={(e) => setReason(e.target.value)} className={`${BOX} w-full`} aria-label={t("Reason")} maxLength={300} />
        </label>
      </div>
      <div className="mt-2 flex items-center gap-1.5">
        <button type="submit" disabled={pending || (!inTime && !outTime)} className="inline-flex h-9 items-center gap-1 rounded-md bg-primary px-3 text-xs font-semibold text-primary-foreground disabled:opacity-50">
          {pending ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : <Plus className="size-3.5" aria-hidden />} {t("Add")}
        </button>
        <button type="button" onClick={onDone} className={BTN}>
          <X className="size-3.5" aria-hidden /> {t("Cancel")}
        </button>
      </div>
    </form>
  );
}
