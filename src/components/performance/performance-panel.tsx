import Link from "next/link";
import { Plus } from "lucide-react";
import type { CurrentUser } from "@/lib/auth/session";
import { formatDate, fromDateTimeLocalET, nowMs, toDateTimeLocalET, todayET } from "@/lib/dates";
import { NOT_FINISHED } from "@/lib/field-day/day";
import { windowMinutes } from "@/lib/hours/engine";
import { myEmployeeIds } from "@/lib/field-day/load";
import { loadFieldDay } from "@/lib/field-day/return-card";
import { aspectScores, band, byMonth, overall, signals, type Band, type Report } from "@/lib/performance/score";
import { recordsDb } from "@/lib/records/data";
import { addDays } from "@/lib/schedule/dates";
import { minutesLate } from "@/lib/time-clock/clock";
import { getTable } from "@/registry";
import { canDo } from "@/registry/permissions";
import { recordHref, tableHref } from "@/registry/routes";
import { cn } from "@/lib/utils";
import { getT } from "@/i18n/server";
import { SkillsGrid } from "./skills-grid";

// P2 Employee performance (SPEC §9.1 P2-c…e): score ring, aspects, trend, field signals, reports, skills.
// Only for people who may see every Staff Performance report (Fred, Jessica, Saulo).

const BAND_TONE: Record<Band, string> = { excellent: "text-ok-fg", good: "text-info-fg", watch: "text-warn-fg", attention: "text-bad-fg" };
const BAND_BAR: Record<Band, string> = { excellent: "bg-ok-fg", good: "bg-info-fg", watch: "bg-warn-fg", attention: "bg-bad-fg" };
const BAND_LABEL: Record<Band, string> = { excellent: "Excellent", good: "Good", watch: "Watch", attention: "Needs attention" };
const SIGNAL_LABEL = { punctuality: "Punctuality", speed: "Speed", quality: "Quality" } as const;

type ReportRow = Report & { id: number; title: string | null; description: string | null };

export async function PerformancePanel({ employeeId, user }: { employeeId: number; user: CurrentUser }) {
  if (!user.permissions.has("forms.staff-performance.view_all")) return null;
  const [tr, db] = await Promise.all([getT(), recordsDb()]);
  // Nobody but an administrator sees their own performance (Fred 2026-10-02); the database enforces it too.
  if (!user.isSysadmin && (await myEmployeeIds(db, user)).includes(employeeId)) return null;
  const now = nowMs();
  const today = todayET();
  const since = addDays(today, -90);
  const sinceIso = fromDateTimeLocalET(`${since}T00:00`);
  const perfT = getTable("staff_performance");

  const [{ data: rep }, { data: skillRows }, { data: team }, settings] = await Promise.all([
    db.from("staff_performance").select("id, title, date, type, aspect, weight, description").eq("employee_id", employeeId).is("deleted_at", null).order("date", { ascending: false }).limit(400),
    db.from("employee_skills").select("skill, level").eq("employee_id", employeeId),
    db.from("visits_team").select("record_id").eq("target_id", employeeId),
    loadFieldDay(db),
  ]);
  const reports = (rep ?? []) as ReportRow[];
  const scores = aspectScores(reports, now);
  const total = overall(scores);
  const months = byMonth(reports, 6, now);
  const maxMonth = Math.max(1, ...months.map((m) => m.positive + m.negative));

  // Field signals, last 90 days: clock-ins against the start time, check-ins against the arrival window,
  // real vs planned visit time, job report results and return cards.
  const teamIds = ((team ?? []) as { record_id: number }[]).map((x) => x.record_id);
  const or = teamIds.length ? `technician_id.eq.${employeeId},id.in.(${teamIds.join(",")})` : `technician_id.eq.${employeeId}`;
  const [{ data: clockIns }, { data: visits }] = await Promise.all([
    db.from("time_entries").select("at").eq("employee_id", employeeId).eq("kind", "clock_in").gte("at", sinceIso).is("deleted_at", null),
    db.from("visits").select("id, starts_at, arrival_window, duration, checked_in_at, checked_out_at").or(or).gte("starts_at", sinceIso).neq("status", "Cancelled").is("deleted_at", null),
  ]);
  const vs = (visits ?? []) as { id: number; starts_at: string; arrival_window: string | null; duration: string | null; checked_in_at: string | null; checked_out_at: string | null }[];
  const { data: jr } = vs.length ? await db.from("job_reports").select("result").in("visit_id", vs.map((v) => v.id)).is("deleted_at", null) : { data: [] };
  const results = ((jr ?? []) as { result: string | null }[]).map((r) => r.result ?? "No result");
  const sig = signals({
    clockIns: ((clockIns ?? []) as { at: string }[]).map((c) => minutesLate(toDateTimeLocalET(c.at).slice(11, 16), settings.time_clock.start_time)),
    checkIns: vs.filter((v) => v.checked_in_at).map((v) => Math.max(0, Math.round((Date.parse(v.checked_in_at!) - Date.parse(v.starts_at)) / 60_000 - Number(v.arrival_window ?? 0)))),
    // F9-a: `or` above already brings the visits this person was only "also going" on; they count the same.
    visits: vs.filter((v) => v.checked_in_at && v.checked_out_at && Number(v.duration)).map((v) => ({ planned: Number(v.duration), real: windowMinutes(v, now) ?? 0 })),
    results,
    returns: results.filter((r) => NOT_FINISHED.includes(r)).length,
  });

  const skills = Object.fromEntries(((skillRows ?? []) as { skill: string; level: string }[]).map((s) => [s.skill, s.level]));
  const canReport = canDo(user.permissions, perfT, "create", getTable);
  const b = band(total);
  const rated = scores.filter((s) => s.positive + s.negative > 0);
  const ring = 2 * Math.PI * 34;

  return (
    <section className="mb-4 rounded-2xl border bg-card px-[18px] py-4 shadow-card">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-[15px] font-semibold tracking-tight">{tr("Performance")}</h2>
        {canReport && (
          <Link href={`${tableHref(perfT)}/new?employee_id=${employeeId}&back=${encodeURIComponent(recordHref(getTable("employees"), employeeId))}`} className="inline-flex h-10 items-center gap-1.5 rounded-[10px] bg-primary px-3 text-[13px] font-semibold text-primary-foreground hover:brightness-95">
            <Plus className="size-4" aria-hidden /> {tr("New report")}
          </Link>
        )}
      </div>

      <div className="grid gap-4 md:grid-cols-[auto_1fr]">
        <div className="flex items-center gap-4">
          <svg viewBox="0 0 80 80" className="size-24 shrink-0" role="img" aria-label={tr("Overall score {n}", { n: total })}>
            <circle cx="40" cy="40" r="34" className="fill-none stroke-muted" strokeWidth="8" />
            <circle cx="40" cy="40" r="34" className={cn("fill-none", BAND_BAR[b].replace("bg-", "stroke-"))} strokeWidth="8" strokeLinecap="round" strokeDasharray={`${(total / 100) * ring} ${ring}`} transform="rotate(-90 40 40)" />
            <text x="40" y="45" textAnchor="middle" className="fill-current text-[20px] font-semibold">
              {total}
            </text>
          </svg>
          <div>
            <p className={cn("text-[15px] font-semibold", BAND_TONE[b])}>{tr(BAND_LABEL[b])}</p>
            <p className="text-xs text-text-2">{rated.length ? tr("{p} positive, {n} negative reports", { p: reports.filter((r) => r.type === "Positive").length, n: reports.filter((r) => r.type === "Negative").length }) : tr("No reports yet: every aspect starts at 70.")}</p>
            <p className="text-xs text-muted-foreground">{tr("Good things add points, bad things remove them, and old reports fade.")}</p>
          </div>
        </div>
        <div>
          {scores
            .filter((s) => s.aspect !== "General" || s.positive + s.negative > 0)
            .map((s) => (
              <div key={s.aspect} className="flex items-center gap-3 py-0.5 text-[13px]">
                <span className="w-32 shrink-0 truncate text-text-2">{tr(s.aspect)}</span>
                <span className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                  <span className={cn("block h-full rounded-full", BAND_BAR[band(s.score)])} style={{ width: `${s.score}%` }} />
                </span>
                <span className="w-16 shrink-0 text-right tabular-nums">
                  <b>{s.score}</b>
                  {s.positive + s.negative > 0 && <span className="text-[11px] text-muted-foreground"> {s.positive}/{s.negative}</span>}
                </span>
              </div>
            ))}
        </div>
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <div>
          <p className="mb-1 text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">{tr("Last 6 months")}</p>
          <div className="flex h-20 items-end gap-1.5">
            {months.map((m) => (
              <div key={m.month} className="flex flex-1 flex-col items-center gap-0.5" title={`${m.month}: +${m.positive} / −${m.negative}`}>
                <div className="flex w-full flex-col-reverse" style={{ height: 56 }}>
                  <span className="w-full rounded-t bg-ok-fg/80" style={{ height: `${(m.positive / maxMonth) * 100}%` }} />
                  <span className="w-full bg-bad-fg/80" style={{ height: `${(m.negative / maxMonth) * 100}%` }} />
                </div>
                <span className="text-[11px] text-muted-foreground">{m.month.slice(5)}</span>
              </div>
            ))}
          </div>
        </div>
        <div>
          <p className="mb-1 text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">{tr("Field signals (90 days)")}</p>
          {sig.map((s) => (
            <div key={s.key} className="flex items-center justify-between gap-2 py-0.5 text-[13px]">
              <span className="text-text-2">{tr(SIGNAL_LABEL[s.key])}</span>
              <span className="text-right">
                <b className={cn("tabular-nums", s.score !== null && BAND_TONE[band(s.score)])}>{s.score === null ? "—" : s.score}</b>
                <span className="block text-[11px] text-muted-foreground">{s.detail}</span>
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-4">
        <p className="mb-1 text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">{tr("Skills")}</p>
        <SkillsGrid employeeId={employeeId} initial={skills} canEdit={user.permissions.has("forms.staff-performance.view_all")} />
      </div>

      {reports.length > 0 && (
        <div className="mt-4">
          <p className="mb-1 text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">{tr("Latest reports")}</p>
          <ul className="divide-y">
            {reports.slice(0, 8).map((r) => (
              <li key={r.id} className="py-2 text-[13px]">
                <Link href={recordHref(perfT, r.id)} className="flex items-center gap-2 hover:underline">
                  <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-xs font-medium", r.type === "Positive" ? "bg-ok-bg text-ok-fg" : "bg-bad-bg text-bad-fg")}>{tr(r.type ?? "Report")}</span>
                  <span className="min-w-0 flex-1 truncate">
                    {r.aspect ? tr(r.aspect) : tr("General")}
                    {r.weight && r.weight !== "Normal" && <span className="text-text-2"> · {tr(r.weight)}</span>}
                    {r.description && <span className="text-text-2"> — {r.description.length > 80 ? `${r.description.slice(0, 80)}…` : r.description}</span>}
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground">{r.date ? formatDate(r.date) : ""}</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
