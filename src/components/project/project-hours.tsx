import Link from "next/link";
import type { CurrentUser } from "@/lib/auth/session";
import { formatDate, nowMs, toDateTimeLocalET } from "@/lib/dates";
import { formatMinutes } from "@/lib/field-day/day";
import { projectHours, type HoursVisit } from "@/lib/hours/engine";
import { recordsDb } from "@/lib/records/data";
import { clock } from "@/lib/schedule/dates";
import { getTable } from "@/registry";
import { canOpen } from "@/registry/permissions";
import { recordHref } from "@/registry/routes";
import { cn } from "@/lib/utils";
import { getT } from "@/i18n/server";

// F9 Job hours (SPEC §9.1 F9-a…c): hours of work on this project from the visits' check-ins and
// check-outs. Everyone on a visit (technician + Also going) earns the window, so the totals are
// technician-hours. Read with the viewer's permissions; nothing is stored.

type Row = Omit<HoursVisit, "team_ids"> & { service_type: string | null };
const STATUS_TONE: Record<string, string> = { "On site": "bg-warn-bg text-warn-fg", "On the way": "bg-info-bg text-info-fg", Done: "bg-ok-bg text-ok-fg", Scheduled: "bg-muted text-text-2" };

export async function ProjectHours({ projectId, user }: { projectId: number; user: CurrentUser }) {
  const vt = getTable("visits");
  if (!canOpen(user.permissions, vt, getTable)) return null;
  const tr = await getT();
  const db = await recordsDb();
  const { data } = await db
    .from("visits")
    .select("id, project_id, starts_at, status, duration, technician_id, service_type, checked_in_at, checked_out_at")
    .eq("project_id", projectId)
    .is("deleted_at", null)
    .order("starts_at", { ascending: false })
    .limit(400);
  const rows = (data ?? []) as Row[];
  // F9-d: how many days we were on the job (Job Report dates ∪ check-in days, the Visits field) and the last one,
  // so old projects with WebAuthor reports but no Visit records get the card too.
  const [{ data: daysRow }, { data: lastReport }] = await Promise.all([
    db.rpc("project_visit_days", { p_project_ids: [projectId] }),
    db.from("job_reports").select("date").eq("project_id", projectId).is("deleted_at", null).not("date", "is", null).order("date", { ascending: false }).limit(1),
  ]);
  const visitDays = ((daysRow as { visit_days: number }[] | null) ?? [])[0]?.visit_days ?? 0;
  const lastCheckIn = rows.map((r) => r.checked_in_at).filter((x): x is string => Boolean(x)).map((x) => toDateTimeLocalET(x).slice(0, 10)).sort().at(-1);
  const lastVisit = [((lastReport ?? []) as { date: string }[])[0]?.date, lastCheckIn].filter((x): x is string => Boolean(x)).sort().at(-1) ?? null;
  if (!rows.length && !visitDays) return null;

  const { data: team } = rows.length ? await db.from("visits_team").select("record_id, target_id").in("record_id", rows.map((r) => r.id)) : { data: [] };
  const teamOf = new Map<number, number[]>();
  for (const x of (team ?? []) as { record_id: number; target_id: number }[]) teamOf.set(x.record_id, [...(teamOf.get(x.record_id) ?? []), x.target_id]);
  const visits: HoursVisit[] = rows.map((r) => ({ ...r, team_ids: teamOf.get(r.id) ?? [] }));
  const h = projectHours(visits, nowMs());

  const ids = [...new Set(h.visits.flatMap((v) => v.people))];
  const { data: emp } = ids.length ? await db.from("employees").select("id, title").in("id", ids) : { data: [] };
  const name = new Map(((emp ?? []) as { id: number; title: string | null }[]).map((e) => [e.id, e.title ?? `#${e.id}`]));
  const who = (people: number[]) => (people.length ? people.map((id) => name.get(id) ?? `#${id}`).join(", ") : tr("No technician"));
  const service = new Map(rows.map((r) => [r.id, r.service_type]));

  // Planned vs real only over the visits that were timed (the planned total also holds future visits).
  const plannedTimed = h.visits.filter((v) => v.realMin !== null).reduce((n, v) => n + v.plannedMin * Math.max(1, v.people.length), 0);
  const diff = h.onSiteMin - plannedTimed;
  const tone = (planned: number, real: number) => (planned > 0 && real > planned * 1.2 ? "text-bad-fg" : planned > 0 && real > 0 && real < planned * 0.8 ? "text-ok-fg" : "");
  const maxTech = Math.max(1, ...h.byTech.map((t) => t.min));
  const SHOW = 6;

  const stat = (label: string, value: string, sub?: string) => (
    <div className="rounded-xl bg-muted/50 px-3 py-2">
      <p className="text-[11.5px] text-text-2">{label}</p>
      <p className="text-lg font-semibold tracking-tight tabular-nums">{value}</p>
      {sub && <p className="text-[11.5px] text-muted-foreground">{sub}</p>}
    </div>
  );

  return (
    <section id="hours" className="mb-4 scroll-mt-20 rounded-2xl border bg-card px-4 py-3 shadow-card">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-[15px] font-semibold tracking-tight">{tr("Visits and hours on this job")}</h2>
        {h.open && <span className="rounded-full bg-warn-bg px-2 py-0.5 text-[12px] font-medium text-warn-fg">{tr("On site now")}</span>}
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {stat(tr("Times visited"), String(visitDays), lastVisit ? tr("last on {date}", { date: formatDate(lastVisit) }) : tr("days with a report or check-in"))}
        {stat(tr("On site"), h.timed ? formatMinutes(h.onSiteMin) : "—", h.timed ? (h.people > 1 ? tr("technician-hours, {n} people", { n: h.people }) : tr("technician-hours")) : tr("no check-ins yet"))}
        {h.visits.length > 0 && stat(tr("Planned"), formatMinutes(h.plannedMin), h.timed > 0 && plannedTimed > 0 ? (diff === 0 ? tr("on plan so far") : diff > 0 ? tr("{t} over plan so far", { t: formatMinutes(diff) }) : tr("{t} under plan so far", { t: formatMinutes(-diff) })) : undefined)}
        {h.visits.length > 0 && stat(tr("Scheduled visits"), String(h.visits.length), tr("{n} timed", { n: h.timed }))}
      </div>
      {h.visits.length > 0 && <p className="mt-2 text-[12.5px] text-text-2">{tr("Clock time {t} (check-in to check-out, people not multiplied).", { t: formatMinutes(h.clockMin) })}</p>}

      {h.byTech.length > 0 && (
        <>
          <p className="mt-3 mb-1 text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">{tr("Per person")}</p>
          {h.byTech.map((t) => (
            <div key={String(t.id)} className="flex items-center gap-3 py-1 text-[13px]">
              <span className="w-28 shrink-0 truncate text-text-2 sm:w-44">{t.id === null ? tr("No technician") : (name.get(t.id) ?? `#${t.id}`)}</span>
              <span className="h-2.5 min-w-10 flex-1 overflow-hidden rounded-full bg-muted">
                <span className="block h-full rounded-full bg-gradient-to-r from-primary to-brand" style={{ width: `${Math.max(2, (t.min / maxTech) * 100)}%` }} />
              </span>
              <span className="shrink-0 text-right font-medium tabular-nums whitespace-nowrap">
                {formatMinutes(t.min)} · {tr(t.visits === 1 ? "{n} visit" : "{n} visits", { n: t.visits })}
              </span>
            </div>
          ))}
        </>
      )}

      {h.visits.length > 0 && <p className="mt-3 mb-1 text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">{tr("Visits")}</p>}
      <ul className="-mx-1 divide-y">
        {h.visits.slice(0, SHOW).map((v) => {
          const local = toDateTimeLocalET(v.starts_at);
          return (
            <li key={v.id} className="px-1 py-2 text-[13px]">
              <div className="flex items-center justify-between gap-2">
                <Link href={recordHref(vt, v.id)} className="min-w-0 truncate font-medium hover:underline">
                  {formatDate(local.slice(0, 10))} {clock(local.slice(11, 16))}
                  {service.get(v.id) ? <span className="font-normal text-text-2"> · {tr(service.get(v.id)!)}</span> : null}
                </Link>
                {v.status && <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[11.5px]", STATUS_TONE[v.status] ?? "bg-muted text-text-2")}>{tr(v.status)}</span>}
              </div>
              <div className="mt-0.5 flex items-center justify-between gap-2 text-[12.5px] text-text-2">
                <span className="min-w-0 truncate">{who(v.people)}</span>
                <span className={cn("shrink-0 tabular-nums", v.realMin !== null && tone(v.plannedMin, v.realMin))}>
                  {v.realMin !== null
                    ? tr("{planned} planned → {real} real", { planned: formatMinutes(v.plannedMin), real: formatMinutes(v.realMin) })
                    : tr("{planned} planned", { planned: formatMinutes(v.plannedMin) })}
                  {v.people.length > 1 ? ` · ${tr("{n} people", { n: v.people.length })}` : ""}
                </span>
              </div>
            </li>
          );
        })}
      </ul>
      {h.visits.length > SHOW && <p className="mt-1 text-[12.5px] text-muted-foreground">{tr("+ {n} more", { n: h.visits.length - SHOW })}</p>}
      <p className="mt-2 text-[11.5px] text-muted-foreground">
        {h.visits.length > 0
          ? tr("Everyone on a visit (technician and also going) earns the time between check-in and check-out.")
          : tr("Times visited counts the days with a Job Report. Hours start once visits are checked in and out from Today.")}
      </p>
    </section>
  );
}
