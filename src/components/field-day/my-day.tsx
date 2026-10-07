import Link from "next/link";
import { ChevronDown, FileText, Navigation, TriangleAlert } from "lucide-react";
import type { CurrentUser } from "@/lib/auth/session";
import { toDateTimeLocalET } from "@/lib/dates";
import { daySummary, formatMinutes, mapsUrl, parkingUrl, routeUrl, wazeUrl } from "@/lib/field-day/day";
import { loadMyDay, type MyVisit } from "@/lib/field-day/load";
import { clock } from "@/lib/schedule/dates";
import { getTable } from "@/registry";
import { recordHref, tableHref } from "@/registry/routes";
import { getT } from "@/i18n/server";
import type { T } from "@/i18n/core";
import { StepButtons } from "./step-buttons";

// The technician's day (F2, docs/portal-features-merge.md §B): today's visits with the next one first,
// a route for the whole day, On my way / check-in / check-out, reports still to write, and the day's hours.

const time = (iso: string) => clock(toDateTimeLocalET(iso).slice(11));
const plus = (iso: string, min: number) => new Date(Date.parse(iso) + min * 60_000).toISOString();
const ORDER: Record<string, number> = { "On site": 0, "On the way": 1, Scheduled: 2, Done: 3 };
const STATUS_TONE: Record<string, string> = { "On site": "bg-warn-bg text-warn-fg", "On the way": "bg-info-bg text-info-fg", Done: "bg-ok-bg text-ok-fg", Scheduled: "bg-muted text-text-2" };
const LINK = "inline-flex h-10 items-center rounded-lg border px-3 text-[13px] hover:bg-muted";

export async function MyDay({ user, now }: { user: CurrentUser; now: number }) {
  const day = await loadMyDay(user);
  if (!day || (!day.visits.length && !day.reportsDue.length)) return null;
  const tr = await getT();
  const visits = [...day.visits].sort((a, b) => (ORDER[a.status] ?? 2) - (ORDER[b.status] ?? 2) || a.starts_at.localeCompare(b.starts_at));
  const left = day.visits.filter((v) => v.status !== "Done");
  const route = routeUrl(left.map((v) => v.address ?? "").filter(Boolean));
  const sum = daySummary(day.visits, now);
  const reportsT = getTable("job_reports");

  return (
    <section id="my-day" className="scroll-mt-20 rounded-2xl border bg-card px-[18px] py-4 shadow-card">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-[15px] font-semibold tracking-tight">
          {tr("My visits today")} <span className="font-normal text-muted-foreground">({day.visits.length})</span>
        </h2>
        {route && left.length > 1 && (
          <a href={route} target="_blank" rel="noopener noreferrer" className="inline-flex h-10 items-center gap-1.5 rounded-[10px] bg-primary px-3 text-[13px] font-semibold text-primary-foreground hover:brightness-95">
            <Navigation className="size-4" aria-hidden /> {tr("Route for the day")}
          </a>
        )}
      </div>

      {/* F21-g: every report owed shows here, even a single one. */}
      {day.reportsDue.length >= 1 && (
        <div className="mb-3 rounded-xl bg-warn-bg px-3 py-2 text-[13px] text-warn-fg">
          <p className="flex items-center gap-1.5 font-semibold">
            <TriangleAlert className="size-4" aria-hidden /> {day.reportsDue.length === 1 ? tr("1 visit still needs a report") : tr("{n} visits still need a report", { n: day.reportsDue.length })}
          </p>
          <ul className="mt-1 flex flex-col gap-1">
            {day.reportsDue.slice(0, 5).map((r) => (
              <li key={r.id}>
                <Link href={`${tableHref(reportsT)}/new?visit_id=${r.id}${r.projectId ? `&project_id=${r.projectId}` : ""}&back=/`} className="underline underline-offset-2">
                  {r.project}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      <ol className="flex flex-col gap-3">
        {visits.map((v, i) => (
          <VisitCard key={v.id} v={v} next={i === 0 && v.status !== "Done"} tr={tr} />
        ))}
      </ol>

      {sum.started && (
        <details className="group mt-3 rounded-xl border">
          <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between px-3 text-sm font-semibold [&::-webkit-details-marker]:hidden">
            {left.length ? tr("My day so far") : tr("End my day")}
            <ChevronDown className="size-4 text-muted-foreground transition-transform group-open:rotate-180" aria-hidden />
          </summary>
          <dl className="grid grid-cols-3 gap-2 px-3 pb-3 text-center">
            {[
              [tr("On site"), formatMinutes(sum.onSiteMin)],
              [tr("Travelling"), formatMinutes(sum.travelMin)],
              [tr("Whole day"), formatMinutes(sum.spanMin)],
            ].map(([k, val]) => (
              <div key={k} className="rounded-lg bg-muted/50 px-2 py-2">
                <dt className="text-xs text-muted-foreground">{k}</dt>
                <dd className="text-[15px] font-semibold">{val}</dd>
              </div>
            ))}
          </dl>
          <p className="px-3 pb-3 text-xs text-muted-foreground">
            {sum.ended ? tr("Started {start}, finished {end}.", { start: time(sum.started), end: time(sum.ended) }) : tr("Started {start}.", { start: time(sum.started) })}
          </p>
        </details>
      )}
    </section>
  );
}

function VisitCard({ v, next, tr }: { v: MyVisit; next: boolean; tr: T }) {
  const visitHref = recordHref(getTable("visits"), v.id);
  const reportsT = getTable("job_reports");
  return (
    <li className={next ? "rounded-xl border-2 border-primary p-3" : "rounded-xl border p-3"}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          {next && <p className="text-xs font-semibold tracking-wide text-primary uppercase">{tr("Next")}</p>}
          <p className="text-[13px] text-text-2">
            {time(v.starts_at)}
            {v.arrival_window > 0 && ` – ${time(plus(v.starts_at, v.arrival_window))} ${tr("arrival")}`} · {formatMinutes(v.duration)}
            {v.service && ` · ${v.service}`}
            {v.vehicle && ` · ${v.vehicle}`}
          </p>
          <Link href={visitHref} className="block truncate text-[15px] font-semibold hover:underline">
            {v.project}
          </Link>
        </div>
        <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_TONE[v.status] ?? STATUS_TONE.Scheduled}`}>{tr(v.status)}</span>
      </div>

      {v.address ? (
        <div className="mt-2">
          <p className="text-[13px]">{v.address}</p>
          <div className="mt-1.5 flex flex-wrap gap-2">
            <a href={mapsUrl(v.address)} target="_blank" rel="noopener noreferrer" className={LINK}>
              Google Maps
            </a>
            <a href={wazeUrl(v.address)} target="_blank" rel="noopener noreferrer" className={LINK}>
              Waze
            </a>
            <a href={parkingUrl(v.address)} target="_blank" rel="noopener noreferrer" className={LINK}>
              {tr("Parking nearby")}
            </a>
          </div>
        </div>
      ) : (
        <p className="mt-2 text-[13px] text-warn-fg">{tr("No job address on the project.")}</p>
      )}
      {v.site && (v.site.client || v.site.phone || v.site.unit || v.site.gate || v.site.coi.length > 0) && (
        <dl className="mt-2 flex flex-col gap-1 text-[13px]">
          {v.site.client && (
            <div>
              <dt className="inline font-semibold">{tr("Client")}: </dt>
              <dd className="inline">
                {v.site.client}
                {v.site.phone && (
                  <>
                    {" · "}
                    <a href={`tel:${v.site.phone.replace(/[^\d+]/g, "")}`} className="underline underline-offset-2">
                      {v.site.phone}
                    </a>
                  </>
                )}
              </dd>
            </div>
          )}
          {!v.site.client && v.site.phone && (
            <div>
              <dt className="inline font-semibold">{tr("Phone")}: </dt>
              <dd className="inline">
                <a href={`tel:${v.site.phone.replace(/[^\d+]/g, "")}`} className="underline underline-offset-2">
                  {v.site.phone}
                </a>
              </dd>
            </div>
          )}
          {v.site.unit && (
            <div>
              <dt className="inline font-semibold">{tr("Unit")}: </dt>
              <dd className="inline">{v.site.unit}</dd>
            </div>
          )}
          {v.site.gate && (
            <div>
              <dt className="inline font-semibold">{tr("Door / gate code")}: </dt>
              <dd className="inline">{v.site.gate}</dd>
            </div>
          )}
          {v.site.coi.length > 0 && (
            <div>
              <dt className="inline font-semibold">{tr("COI")}: </dt>
              <dd className="inline">
                {v.site.coi.map((c, i) => (
                  <a key={i} href={c.url} target="_blank" rel="noopener noreferrer" className="mr-2 underline underline-offset-2">
                    {c.name}
                  </a>
                ))}
              </dd>
            </div>
          )}
        </dl>
      )}
      {v.pending > 0 && v.status !== "Done" && v.projectId && (
        <Link href={`${recordHref(getTable("projects"), v.projectId)}#pending`} className="mt-2 flex items-start gap-1.5 rounded-lg bg-warn-bg px-3 py-2 text-[13px] text-warn-fg">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>{tr(v.pending === 1 ? "1 open pending item from an earlier visit. See it on the project." : "{n} open pending items from earlier visits. See them on the project.", { n: v.pending })}</span>
        </Link>
      )}

      {(v.instructions || v.access || v.tools.length > 0) && (
        <dl className="mt-2 flex flex-col gap-1 text-[13px]">
          {v.instructions && (
            <div>
              <dt className="inline font-semibold">{tr("Instructions")}: </dt>
              <dd className="inline whitespace-pre-line">{v.instructions}</dd>
            </div>
          )}
          {v.access && (
            <div>
              <dt className="inline font-semibold">{tr("Parking and access")}: </dt>
              <dd className="inline whitespace-pre-line">{v.access}</dd>
            </div>
          )}
          {v.tools.length > 0 && (
            <div>
              <dt className="inline font-semibold">{tr("Bring")}: </dt>
              <dd className="inline">{v.tools.join(", ")}</dd>
            </div>
          )}
        </dl>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <StepButtons id={v.id} status={v.status} />
        {v.status === "Done" &&
          (v.reportId ? (
            <Link href={recordHref(reportsT, v.reportId)} className={LINK}>
              <FileText className="mr-1 size-4" aria-hidden /> {tr("Report")}
            </Link>
          ) : (
            <Link href={`${tableHref(reportsT)}/new?visit_id=${v.id}${v.projectId ? `&project_id=${v.projectId}` : ""}&back=/`} className="inline-flex h-11 items-center gap-1.5 rounded-[10px] bg-warn-bg px-4 text-sm font-semibold text-warn-fg">
              <FileText className="size-4" aria-hidden /> {tr("Write the report")}
            </Link>
          ))}
        {v.status !== "Done" && (
          <Link href={visitHref} className="text-[13px] text-text-2 underline underline-offset-2">
            {tr("Briefing and checklist")}
          </Link>
        )}
        {(v.checked_in_at || v.checked_out_at || v.on_way_at) && (
          <Link href={`${visitHref}#corrections`} className="text-[13px] text-text-2 underline underline-offset-2">
            {tr("Wrong check-in or check-out?")}
          </Link>
        )}
      </div>
    </li>
  );
}
