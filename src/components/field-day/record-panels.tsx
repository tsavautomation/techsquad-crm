import Link from "next/link";
import { CalendarPlus, ClipboardList } from "lucide-react";
import { requireUser } from "@/lib/auth/session";
import { formatDate } from "@/lib/dates";
import { missingLines } from "@/lib/field-day/day";
import { loadBriefing, myEmployeeIds } from "@/lib/field-day/load";
import { loadFieldDay } from "@/lib/field-day/return-card";
import { recordsDb } from "@/lib/records/data";
import { getTable } from "@/registry";
import { canDo } from "@/registry/permissions";
import { recordHref, tableHref } from "@/registry/routes";
import { getT } from "@/i18n/server";
import { StepButtons } from "./step-buttons";

// Record-page panels for F2: the visit's check-in buttons, what to bring and the briefing from the
// project's last report; on a task with a project, "Schedule return" / "Put on the calendar" (F3).

const CARD = "mb-4 rounded-2xl border bg-card px-4 py-3 shadow-card";

export async function VisitFieldPanel({ visitId }: { visitId: number }) {
  const [user, tr, db] = await Promise.all([requireUser(), getT(), recordsDb()]);
  const { data } = await db.from("visits").select("id, starts_at, status, project_id, technician_id, service_type, deleted_at, visits_team(target_id)").eq("id", visitId).maybeSingle();
  const v = data as { id: number; starts_at: string; status: string | null; project_id: number | null; technician_id: number | null; service_type: string | null; deleted_at: string | null; visits_team: { target_id: number }[] } | null;
  if (!v || v.deleted_at) return null;

  const [mine, settings, briefing] = await Promise.all([
    myEmployeeIds(db, user),
    loadFieldDay(db),
    v.project_id ? loadBriefing(db, v.project_id, v.starts_at, v.id) : Promise.resolve(null),
  ]);
  const going = [v.technician_id, ...v.visits_team.map((x) => x.target_id)].some((id) => id !== null && mine.includes(id));
  const canStep = going || canDo(user.permissions, getTable("visits"), "modify", getTable);
  const tools = (v.service_type && settings.service_lists[v.service_type]?.tools) || [];
  const missing = missingLines(briefing?.missing);

  return (
    <div className="flex flex-col">
      {canStep && v.status !== "Done" && v.status !== "Cancelled" && (
        <div className={CARD}>
          <StepButtons id={v.id} status={v.status ?? "Scheduled"} />
        </div>
      )}
      {tools.length > 0 && (
        <div className={CARD}>
          <h2 className="mb-1 text-sm font-semibold">{tr("Bring")}</h2>
          <p className="text-sm">{tools.join(", ")}</p>
        </div>
      )}
      {briefing && (
        <section className={CARD}>
          <h2 className="mb-2 flex items-center gap-1.5 text-sm font-semibold">
            <ClipboardList className="size-4" aria-hidden /> {tr("Briefing from the last visit")}
            <Link href={recordHref(getTable("job_reports"), briefing.reportId)} className="ml-auto text-xs font-normal text-text-2 underline underline-offset-2">
              {briefing.date ? formatDate(briefing.date) : tr("Report")}
            </Link>
          </h2>
          <dl className="flex flex-col gap-2 text-sm">
            {briefing.result && (
              <div>
                <dt className="text-xs text-muted-foreground">{tr("Result")}</dt>
                <dd>
                  {tr(briefing.result)}
                  {briefing.reason ? ` · ${tr(briefing.reason)}` : ""}
                  {briefing.waitingOn ? ` · ${tr("waiting on {who}", { who: briefing.waitingOn })}` : ""}
                </dd>
              </div>
            )}
            {briefing.done && (
              <div>
                <dt className="text-xs text-muted-foreground">{tr("What was done")}</dt>
                <dd className="line-clamp-6 whitespace-pre-line">{briefing.done}</dd>
              </div>
            )}
            {missing.length > 0 && (
              <div>
                <dt className="text-xs text-muted-foreground">{tr("What's missing")}</dt>
                <dd>
                  <ul className="list-disc pl-5">
                    {missing.map((m) => (
                      <li key={m}>{m}</li>
                    ))}
                  </ul>
                </dd>
              </div>
            )}
            {briefing.bring && (
              <div>
                <dt className="text-xs text-muted-foreground">{tr("What to bring next time")}</dt>
                <dd className="whitespace-pre-line">{briefing.bring}</dd>
              </div>
            )}
            {briefing.access && (
              <div>
                <dt className="text-xs text-muted-foreground">{tr("Access info")}</dt>
                <dd className="whitespace-pre-line">{briefing.access}</dd>
              </div>
            )}
          </dl>
          {briefing.photos.length > 0 && (
            <ul className="mt-2 grid grid-cols-3 gap-2">
              {briefing.photos.map((p) => (
                <li key={p.url}>
                  <a href={p.url} target="_blank" rel="noopener noreferrer">
                    {/* eslint-disable-next-line @next/next/no-img-element -- signed links to stored photos */}
                    <img src={p.url} alt={p.name} className="aspect-square w-full rounded-lg object-cover" />
                  </a>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}

export async function ReturnCardPanel({ taskId }: { taskId: number }) {
  const [user, tr, db] = await Promise.all([requireUser(), getT(), recordsDb()]);
  const { data } = await db.from("tasks").select("id, project_id, job_report_id, visit_id, details, labels, deleted_at").eq("id", taskId).maybeSingle();
  const task = data as { id: number; project_id: number | null; job_report_id: number | null; visit_id: number | null; details: string | null; labels: string[] | null; deleted_at: string | null } | null;
  // Any task with a project can go on the calendar (F3); return cards say "Schedule return" (F2).
  if (!task || task.deleted_at || !task.project_id) return null;
  const isReturn = Boolean(task.job_report_id || task.labels?.includes("Return"));
  const visitsT = getTable("visits");

  if (task.visit_id) {
    return (
      <div className={CARD}>
        <p className="text-sm">
          {tr(isReturn ? "Return visit scheduled." : "On the calendar.")}{" "}
          <Link href={recordHref(visitsT, task.visit_id)} className="font-semibold underline underline-offset-2">
            {tr("Open the visit")}
          </Link>
        </p>
      </div>
    );
  }
  if (!canDo(user.permissions, visitsT, "create", getTable)) return null;

  // Prefill the visit: project, who can do it, how long, the card's notes as instructions.
  const q = new URLSearchParams({ project_id: String(task.project_id), return_task_id: String(task.id), back: recordHref(getTable("tasks"), task.id) });
  if (task.job_report_id) {
    const { data: r } = await db.from("job_reports").select("time_needed, job_reports_who_can(target_id)").eq("id", task.job_report_id).maybeSingle();
    const rep = r as { time_needed: string | null; job_reports_who_can: { target_id: number }[] } | null;
    if (rep?.time_needed) q.set("duration", rep.time_needed);
    const who = rep?.job_reports_who_can.map((x) => x.target_id) ?? [];
    if (who.length) q.set("technician_id", String(who[0]));
    if (who.length > 1) q.set("team_ids", who.slice(1).join(","));
  }
  if (task.details) q.set("instructions", task.details.slice(0, 2000));

  return (
    <div className={CARD}>
      <Link href={`${tableHref(visitsT)}/new?${q}`} className="inline-flex h-11 items-center gap-1.5 rounded-[10px] bg-primary px-4 text-sm font-semibold text-primary-foreground hover:brightness-95">
        <CalendarPlus className="size-4" aria-hidden /> {tr(isReturn ? "Schedule return" : "Put on the calendar")}
      </Link>
    </div>
  );
}
