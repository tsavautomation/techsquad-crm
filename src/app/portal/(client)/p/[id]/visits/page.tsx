import { requireClient } from "@/lib/portal/session";
import { projectVisits } from "@/lib/portal/data";
import { arrivalLabel, visitTone } from "@/lib/portal/format";
import { recordsDb } from "@/lib/records/data";
import { formatDateTime } from "@/lib/dates";
import { Empty, Pill, PortalCard } from "@/components/portal/shell";
import { getT } from "@/i18n/server";

/** Visits: upcoming first (with the technician's live status), then the history. No report details. */
export default async function VisitsPage({ params }: PageProps<"/portal/p/[id]">) {
  await requireClient();
  const { id } = await params;
  const t = await getT();
  const visits = await projectVisits(await recordsDb(), Number(id));
  const upcoming = visits.filter((v) => v.status !== "Done").sort((a, b) => a.starts_at.localeCompare(b.starts_at));
  const past = visits.filter((v) => v.status === "Done");

  const row = (v: (typeof visits)[number]) => (
    <li key={v.id} className="flex items-start gap-3 py-3 first:pt-0 last:pb-0">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">{formatDateTime(v.starts_at)}</p>
        <p className="text-xs text-muted-foreground">
          {[v.service_type, arrivalLabel(v.arrival_window) ? t("Arrival {w}", { w: t(arrivalLabel(v.arrival_window)!) }) : null, v.technician_first_name ? t("Technician: {name}", { name: v.technician_first_name }) : null, v.maintenance_visit ? t("Maintenance plan") : null]
            .filter(Boolean)
            .join(" · ")}
        </p>
        {v.status === "Done" && v.checked_in_at && v.checked_out_at && (
          <p className="text-xs text-muted-foreground">{t("On site {from} to {to}", { from: formatDateTime(v.checked_in_at).split(" ").slice(1).join(" "), to: formatDateTime(v.checked_out_at).split(" ").slice(1).join(" ") })}</p>
        )}
      </div>
      <Pill tone={visitTone(v.status)}>{t(v.status)}</Pill>
    </li>
  );

  return (
    <div className="flex flex-col gap-4">
      <PortalCard title={t("Upcoming")}>
        {upcoming.length ? <ul className="divide-y">{upcoming.map(row)}</ul> : <Empty>{t("Nothing scheduled right now.")}</Empty>}
        <p className="mt-3 text-xs text-muted-foreground">{t("On the day, this page shows when the technician is on the way and when they arrive.")}</p>
      </PortalCard>
      <PortalCard title={t("Past visits")}>{past.length ? <ul className="divide-y">{past.map(row)}</ul> : <Empty>{t("No visits yet.")}</Empty>}</PortalCard>
    </div>
  );
}
