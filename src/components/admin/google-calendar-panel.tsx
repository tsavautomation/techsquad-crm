"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { formatDateTime } from "@/lib/dates";
import {
  chooseCalendarAction,
  disconnectGoogleAction,
  importStatusAction,
  rematchAction,
  saveColorMapAction,
  saveNameMapAction,
  setAiMatchAction,
  startCreatingAction,
  startReadingAction,
  syncNowAction,
  type ImportStatus,
} from "@/lib/google/actions";
import type { GCalendar, ImportState } from "@/lib/google/client";
import { GOOGLE_COLORS } from "@/lib/google/match";
import { cn } from "@/lib/utils";
import { useT } from "@/i18n/client";

type Props = {
  account: string;
  calendars: GCalendar[];
  calendarProblem: string | null;
  calendarId: string | null;
  colorMap: Record<string, number>;
  nameMap: Record<string, number>;
  nameStats: { name: string; count: number }[];
  aiMatch: boolean;
  aiAvailable: boolean;
  employees: { id: number; name: string }[];
  importState: ImportState | null;
  busy: boolean;
  hasSyncToken: boolean;
  lastSyncAt: string | null;
  lastSyncError: string | null;
  needsProject: number;
  defaultFrom: string;
};

const BTN = "inline-flex h-11 items-center justify-center rounded-[10px] px-4 text-sm font-semibold disabled:opacity-50";
const PRIMARY = cn(BTN, "bg-primary text-primary-foreground hover:brightness-95");
const PLAIN = cn(BTN, "border font-medium hover:bg-muted");

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-3.5 rounded-2xl border bg-card px-[18px] py-4 shadow-card">
      <h2 className="mb-2 text-[15px] font-semibold tracking-tight">{title}</h2>
      {children}
    </section>
  );
}

/** Everything under Status on Admin › Google Calendar: calendar, colours, import steps, sync, disconnect. */
export function GoogleCalendarPanel(p: Props) {
  const t = useT();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [calendar, setCalendar] = useState(p.calendarId ?? "");
  const [colors, setColors] = useState<Record<string, number>>(p.colorMap);
  const [names, setNames] = useState<Record<string, number>>(p.nameMap);
  const [from, setFrom] = useState(p.importState?.from ?? p.defaultFrom);
  const [status, setStatus] = useState<ImportStatus | null>(null);
  const st = status?.import ?? p.importState;
  const running = st?.phase === "reading" || st?.phase === "creating";

  // While a step runs, ask for progress every few seconds (the action also restarts a chunk that died).
  useEffect(() => {
    if (!running) return;
    let alive = true;
    const tick = async () => {
      const r = await importStatusAction();
      if (!alive || !r.ok) return;
      setStatus(r.status);
      const ph = r.status.import?.phase;
      if (ph !== "reading" && ph !== "creating") router.refresh();
    };
    void tick();
    const id = setInterval(tick, 4000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [running, router]);

  const run = (fn: () => Promise<{ ok: true } | { ok: false; message: string }>, done?: string) =>
    start(async () => {
      const r = await fn();
      if (!r.ok) return void toast.error(t(r.message));
      if (done) toast.success(done);
      router.refresh();
    });

  const phaseText: Record<ImportState["phase"], string> = {
    idle: t("Not started"),
    reading: t("Reading the calendar…"),
    read: t("Calendar read. Check the colours above, then press Create visits."),
    creating: t("Creating visits…"),
    done: t("Done"),
    error: t("Stopped with an error"),
  };
  const canCreate = st && (st.phase === "read" || (st.phase === "error" && st.read > 0) || (st.phase === "done" && (status?.events.waiting ?? 0) > 0));

  return (
    <>
      <Card title={t("Calendar")}>
        {p.calendarProblem ? (
          <p className="text-sm text-bad-fg">{p.calendarProblem}</p>
        ) : (
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <label className="flex grow flex-col gap-1 text-sm">
              <span className="text-text-2">{t("Which calendar holds the visits")}</span>
              <select className="h-11 rounded-[10px] border bg-card px-2 text-base md:text-sm" value={calendar} onChange={(e) => setCalendar(e.target.value)}>
                <option value="">{t("Choose…")}</option>
                {p.calendars.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.summary}
                    {c.primary ? ` (${t("main")})` : ""}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              className={PRIMARY}
              disabled={pending || !calendar || calendar === (p.calendarId ?? "")}
              onClick={() => {
                const name = p.calendars.find((c) => c.id === calendar)?.summary ?? calendar;
                if (p.calendarId && calendar !== p.calendarId && !confirm(t("Change the calendar? The import starts over for the new one (visits already made are kept)."))) return;
                run(() => chooseCalendarAction(calendar, name), t("Calendar saved"));
              }}
            >
              {t("Save")}
            </button>
          </div>
        )}
        {p.calendarId && <p className="mt-2 text-xs text-muted-foreground">{t("Only this calendar is read and written. Events in the account's other calendars are left alone.")}</p>}
      </Card>

      {p.calendarId && (
        <>
          {p.nameStats.length > 0 && (
            <Card title={t("Names → technicians")}>
              <p className="mb-2 text-xs text-muted-foreground">{t("Titles start with who went (\"Carlos – Auriemo – Fendi #1101\"). These are the names seen most often; say who each one is. Names left blank get the technician from the colour, or nobody.")}</p>
              <ul className="grid gap-1.5 sm:grid-cols-2">
                {p.nameStats.map((s) => (
                  <li key={s.name} className="flex items-center gap-2">
                    <span className="w-28 shrink-0 truncate text-sm capitalize" title={s.name}>
                      {s.name} <span className="text-xs text-muted-foreground">({s.count})</span>
                    </span>
                    <select
                      aria-label={s.name}
                      className="h-10 min-w-0 grow rounded-[10px] border bg-card px-2 text-base md:text-sm"
                      value={names[s.name] ?? ""}
                      onChange={(e) => {
                        const next = { ...names };
                        if (e.target.value) next[s.name] = Number(e.target.value);
                        else delete next[s.name];
                        setNames(next);
                      }}
                    >
                      <option value="">—</option>
                      {p.employees.map((e) => (
                        <option key={e.id} value={e.id}>
                          {e.name}
                        </option>
                      ))}
                    </select>
                  </li>
                ))}
              </ul>
              <button type="button" className={cn(PRIMARY, "mt-3")} disabled={pending} onClick={() => run(() => saveNameMapAction(names), t("Names saved"))}>
                {t("Save names")}
              </button>
            </Card>
          )}

          <Card title={t("Colours → technicians")}>
            <p className="mb-2 text-xs text-muted-foreground">{t("When an event names nobody, its colour says who went. Suggested automatically after the calendar is read; correct it here.")}</p>
            <ul className="grid gap-1.5 sm:grid-cols-2">
              {GOOGLE_COLORS.map((c) => (
                <li key={c.id} className="flex items-center gap-2">
                  <span className="size-4 shrink-0 rounded-full" style={{ backgroundColor: c.hex }} aria-hidden />
                  <span className="w-20 shrink-0 text-sm text-text-2">{c.name}</span>
                  <select
                    aria-label={c.name}
                    className="h-10 min-w-0 grow rounded-[10px] border bg-card px-2 text-base md:text-sm"
                    value={colors[c.id] ?? ""}
                    onChange={(e) => {
                      const next = { ...colors };
                      if (e.target.value) next[c.id] = Number(e.target.value);
                      else delete next[c.id];
                      setColors(next);
                    }}
                  >
                    <option value="">—</option>
                    {p.employees.map((e) => (
                      <option key={e.id} value={e.id}>
                        {e.name}
                      </option>
                    ))}
                  </select>
                </li>
              ))}
            </ul>
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <button type="button" className={PRIMARY} disabled={pending} onClick={() => run(() => saveColorMapAction(colors), t("Colours saved"))}>
                {t("Save colours")}
              </button>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" className="size-5" checked={p.aiMatch} disabled={pending || !p.aiAvailable} onChange={(e) => run(() => setAiMatchAction(e.target.checked))} />
                <span>{p.aiAvailable ? t("Let the AI decide unclear events (and skip entries that aren't jobs)") : t("AI help needs the Claude key (Admin › AI)")}</span>
              </label>
            </div>
          </Card>

          <Card title={t("Bring in the history")}>
            <ol className="flex flex-col gap-3">
              <li className="flex flex-col gap-2 sm:flex-row sm:items-end">
                <label className="flex flex-col gap-1 text-sm">
                  <span className="text-text-2">{t("1. Read the calendar from")}</span>
                  <input type="date" className="h-11 rounded-[10px] border bg-card px-2 text-base md:text-sm" value={from} onChange={(e) => setFrom(e.target.value)} disabled={running} />
                </label>
                <button
                  type="button"
                  className={st && st.phase !== "idle" ? PLAIN : PRIMARY}
                  disabled={pending || running || p.busy}
                  onClick={() => {
                    if (st && st.phase !== "idle" && st.phase !== "error" && !confirm(t("Read the calendar again? Events already turned into visits are kept; only new ones are added."))) return;
                    run(() => startReadingAction(from));
                  }}
                >
                  {st?.phase === "error" && st.pageToken ? t("Try again") : st && st.phase !== "idle" ? t("Read again") : t("Read the calendar")}
                </button>
              </li>
              {st && (
                <li className="rounded-[10px] bg-muted/50 px-3 py-2 text-sm">
                  <p className="font-medium">
                    {running && <span className="mr-2 inline-block size-2.5 animate-pulse rounded-full bg-primary align-middle" aria-hidden />}
                    {phaseText[st.phase]}
                  </p>
                  <p className="text-text-2">
                    {t("{n} events read", { n: st.read })}
                    {st.created || st.skipped || st.unmatched ? ` · ${t("{n} visits created", { n: st.created })} · ${t("{n} left out (no project)", { n: st.unmatched })} · ${t("{n} skipped", { n: st.skipped })}` : ""}
                    {status && status.events.waiting > 0 ? ` · ${t("{n} waiting", { n: status.events.waiting })}` : ""}
                  </p>
                  {st.error && <p className="mt-1 text-bad-fg">{st.error}</p>}
                  {st.phase === "done" && st.finishedAt && <p className="text-xs text-muted-foreground">{t("Finished {date}", { date: formatDateTime(st.finishedAt) })}</p>}
                </li>
              )}
              {canCreate && (
                <li className="flex flex-col gap-1">
                  <span className="text-sm text-text-2">{t("2. Turn the events into visits")}</span>
                  <button type="button" className={cn(PRIMARY, "w-fit")} disabled={pending || running || p.busy} onClick={() => run(() => startCreatingAction())}>
                    {t("Create visits")}
                  </button>
                  <span className="text-xs text-muted-foreground">{t("Each event becomes a visit on the matching project. Past events are marked Done; the technician comes from the name in the title or the colour; the van from its tag number.")}</span>
                </li>
              )}
              {st?.phase === "done" && (
                <li className="flex flex-col gap-1">
                  <button
                    type="button"
                    className={cn(PLAIN, "w-fit")}
                    disabled={pending || running || p.busy}
                    onClick={() =>
                      start(async () => {
                        const r = await rematchAction();
                        if (!r.ok) return void toast.error(t(r.message));
                        toast.success(r.queued ? t("{n} events queued for matching", { n: r.queued }) : t("Nothing left to match"));
                        router.refresh();
                      })
                    }
                  >
                    {t("Match again")}
                  </button>
                  <span className="text-xs text-muted-foreground">{t("Events that found no project are tried again (after you added projects, names or colours). Only events that match a project become visits; the rest are left out.")}</span>
                </li>
              )}
            </ol>
          </Card>

          <Card title={t("Keeping in sync")}>
            {!p.hasSyncToken ? (
              <p className="text-sm text-text-2">{t("Starts after the calendar has been read once. Then, every hour: changes in Google come here, and visits changed here go to Google.")}</p>
            ) : (
              <div className="flex flex-col gap-2">
                <p className="text-sm">
                  {p.lastSyncAt ? t("Last sync {date}.", { date: formatDateTime(p.lastSyncAt) }) : t("Not synced yet.")} {t("Runs every hour by itself.")}
                </p>
                {p.lastSyncError && <p className="text-sm text-bad-fg">{p.lastSyncError}</p>}
                <button
                  type="button"
                  className={cn(PLAIN, "w-fit")}
                  disabled={pending || running}
                  onClick={() =>
                    start(async () => {
                      const r = await syncNowAction();
                      if (!r.ok) return void toast.error(t(r.message));
                      const pl = r.summary.pull;
                      const ps = r.summary.push;
                      toast.success(
                        `${"skipped" in pl ? t(pl.skipped) : t("{n} changes from Google", { n: pl.changed })} · ${"skipped" in ps ? t(ps.skipped) : t("{n} visits sent to Google", { n: ps.pushed })}`,
                      );
                      router.refresh();
                    })
                  }
                >
                  {t("Sync now")}
                </button>
              </div>
            )}
          </Card>

          <Card title={t("Needs a project")}>
            <p className="text-sm">
              {p.needsProject ? t("{n} visits have no project yet.", { n: p.needsProject }) : t("Every visit has its project.")}{" "}
              {p.needsProject > 0 && (
                <Link href="/schedule/needs-project" className="underline underline-offset-4">
                  {t("Go through them")}
                </Link>
              )}
            </p>
          </Card>
        </>
      )}

      <Card title={t("Disconnect")}>
        <p className="mb-2 text-xs text-muted-foreground">{t("The CRM forgets the Google account. Visits already made stay; nothing is deleted in Google.")}</p>
        <button
          type="button"
          disabled={pending}
          className={cn(PLAIN, "w-fit")}
          onClick={() => {
            if (!confirm(t("Disconnect Google Calendar? Syncing stops until you connect again."))) return;
            run(() => disconnectGoogleAction(), t("Google Calendar disconnected"));
          }}
        >
          {t("Disconnect Google Calendar")}
        </button>
      </Card>
    </>
  );
}
