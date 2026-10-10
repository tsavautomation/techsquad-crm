import Link from "next/link";
import { notFound } from "next/navigation";
import { CalendarClock, ChevronRight, Plus, ShieldCheck } from "lucide-react";
import { requireClient } from "@/lib/portal/session";
import { myProject, projectRequests, projectVisits } from "@/lib/portal/data";
import { arrivalLabel, money, requestTone, visitTone } from "@/lib/portal/format";
import { recordsDb } from "@/lib/records/data";
import { formatDate, formatDateTime, nowMs } from "@/lib/dates";
import { Pill, PortalCard } from "@/components/portal/shell";
import { getT } from "@/i18n/server";

/** Overview: what is happening now (next visit, technician on the way), the plan, open requests. */
export default async function ProjectOverview({ params }: PageProps<"/portal/p/[id]">) {
  await requireClient();
  const { id } = await params;
  const projectId = Number(id);
  const t = await getT();
  const db = await recordsDb();
  const [p, visits, requests] = await Promise.all([myProject(db, projectId), projectVisits(db, projectId), projectRequests(db, projectId)]);
  if (!p) notFound();
  const base = `/portal/p/${p.id}`;

  const now = nowMs();
  const live = visits.find((v) => v.status === "On the way" || v.status === "On site");
  const next = live ?? [...visits].filter((v) => v.status === "Scheduled" && new Date(v.starts_at).getTime() >= now - 6 * 3600_000).sort((a, b) => a.starts_at.localeCompare(b.starts_at))[0];
  const open = requests.filter((r) => r.status === "Requested" || r.status === "Scheduled");
  const balance = Number(p.invoiced_amount) - Number(p.paid_amount);

  return (
    <div className="flex flex-col gap-4">
      <PortalCard title={t("Next visit")} action={<Link href={`${base}/visits`} className="text-sm text-primary">{t("All visits")}</Link>}>
        {next ? (
          <div className="flex items-start gap-3">
            <CalendarClock className="mt-0.5 size-5 shrink-0 text-muted-foreground" aria-hidden />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">{formatDateTime(next.starts_at)}</p>
              <p className="text-xs text-muted-foreground">
                {[next.service_type, arrivalLabel(next.arrival_window) ? t("Arrival {w}", { w: t(arrivalLabel(next.arrival_window)!) }) : null, next.technician_first_name ? t("Technician: {name}", { name: next.technician_first_name }) : null].filter(Boolean).join(" · ")}
              </p>
              <div className="mt-2">
                <Pill tone={visitTone(next.status)}>{t(next.status)}</Pill>
                {next.status === "On the way" && next.on_way_at && <span className="ml-2 text-xs text-muted-foreground">{t("since {time}", { time: formatDateTime(next.on_way_at).split(" ").slice(1).join(" ") })}</span>}
              </div>
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">{t("Nothing scheduled right now.")}</p>
        )}
        <Link href={`${base}/requests/new`} className="mt-3 inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-medium text-primary-foreground">
          <Plus className="size-4" aria-hidden /> {t("Request a visit or report a problem")}
        </Link>
      </PortalCard>

      {open.length > 0 && (
        <PortalCard title={t("Your open requests")} action={<Link href={`${base}/requests`} className="text-sm text-primary">{t("See all")}</Link>}>
          <ul className="divide-y">
            {open.slice(0, 3).map((r) => (
              <li key={r.id} className="flex items-center gap-3 py-2 first:pt-0 last:pb-0">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{t(r.kind ?? "Other")}</p>
                  <p className="truncate text-xs text-muted-foreground">{formatDate(r.created_at)} · {r.description}</p>
                </div>
                <Pill tone={requestTone(r.status)}>{t(r.status)}</Pill>
              </li>
            ))}
          </ul>
        </PortalCard>
      )}

      {p.maintenance_plan && (
        <PortalCard title={t("Maintenance plan")}>
          <div className="flex items-start gap-3">
            <ShieldCheck className="mt-0.5 size-5 shrink-0 text-ok-fg" aria-hidden />
            <div className="min-w-0 flex-1 text-sm">
              <p className="font-medium">
                {p.maintenance_type ? t("{plan} plan", { plan: t(p.maintenance_type) }) : t("Maintenance plan")}
                {p.maintenance_status && <span className="ml-2"><Pill tone={p.maintenance_status === "Active" ? "ok" : p.maintenance_status === "Expired" ? "bad" : "warn"}>{t(p.maintenance_status)}</Pill></span>}
              </p>
              <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-muted-foreground">
                {p.maintenance_purchase_date && (<><dt>{t("Started")}</dt><dd className="text-right text-foreground">{formatDate(p.maintenance_purchase_date)}</dd></>)}
                {p.maintenance_expires_on && (<><dt>{t("Expires")}</dt><dd className="text-right text-foreground">{formatDate(p.maintenance_expires_on)}</dd></>)}
                {p.maintenance_amount != null && (<><dt>{t("Paid")}</dt><dd className="text-right text-foreground">{money(p.maintenance_amount)}</dd></>)}
                {p.maintenance_visits_included != null && (<><dt>{t("Visits used")}</dt><dd className="text-right text-foreground">{p.maintenance_visits_used} / {p.maintenance_visits_included}</dd></>)}
                {p.maintenance_visits_included == null && p.maintenance_visits_used > 0 && (<><dt>{t("Visits used")}</dt><dd className="text-right text-foreground">{p.maintenance_visits_used}</dd></>)}
              </dl>
              {p.maintenance_includes && (
                <div className="mt-3">
                  <p className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">{t("What it includes")}</p>
                  <ul className="mt-1 list-disc pl-4 text-sm">
                    {p.maintenance_includes.split(/\r?\n/).filter((l) => l.trim()).map((l, i) => <li key={i}>{l.trim()}</li>)}
                  </ul>
                </div>
              )}
            </div>
          </div>
        </PortalCard>
      )}

      <PortalCard title={t("Finances")} action={<Link href={`${base}/money`} className="inline-flex items-center text-sm text-primary">{t("Details")} <ChevronRight className="size-4" aria-hidden /></Link>}>
        <dl className="grid grid-cols-3 gap-2 text-center">
          <div className="rounded-xl bg-muted/60 p-2"><dt className="text-[11px] text-muted-foreground uppercase">{t("Approved")}</dt><dd className="text-sm font-semibold">{money(p.approved_amount)}</dd></div>
          <div className="rounded-xl bg-muted/60 p-2"><dt className="text-[11px] text-muted-foreground uppercase">{t("Paid")}</dt><dd className="text-sm font-semibold">{money(p.paid_amount)}</dd></div>
          <div className="rounded-xl bg-muted/60 p-2"><dt className="text-[11px] text-muted-foreground uppercase">{t("Balance")}</dt><dd className={`text-sm font-semibold ${balance > 0 ? "text-warn-fg" : ""}`}>{money(balance)}</dd></div>
        </dl>
      </PortalCard>
    </div>
  );
}
