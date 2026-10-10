import Link from "next/link";
import { Image as ImageIcon, Plus } from "lucide-react";
import { requireClient } from "@/lib/portal/session";
import { filesFor, portalFileHref, projectRequests, projectVisits } from "@/lib/portal/data";
import { requestTone } from "@/lib/portal/format";
import { recordsDb } from "@/lib/records/data";
import { formatDate, formatDateTime } from "@/lib/dates";
import { Empty, Pill, PortalCard } from "@/components/portal/shell";
import { getT } from "@/i18n/server";

/** Requests: what the customer asked for and where each one stands. */
export default async function RequestsPage({ params }: PageProps<"/portal/p/[id]">) {
  await requireClient();
  const { id } = await params;
  const t = await getT();
  const db = await recordsDb();
  const projectId = Number(id);
  const [requests, visits] = await Promise.all([projectRequests(db, projectId), projectVisits(db, projectId)]);
  const files = await filesFor(db, "service_requests", requests.map((r) => r.id));
  const visitById = new Map(visits.map((v) => [v.id, v]));

  return (
    <div className="flex flex-col gap-4">
      <Link href={`/portal/p/${projectId}/requests/new`} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-medium text-primary-foreground">
        <Plus className="size-4" aria-hidden /> {t("Request a visit or report a problem")}
      </Link>
      <PortalCard title={t("Your requests")}>
        {requests.length === 0 ? (
          <Empty>{t("You haven't sent any request yet.")}</Empty>
        ) : (
          <ul className="divide-y">
            {requests.map((r) => {
              const v = r.visit_id ? visitById.get(r.visit_id) : null;
              const media = files.get(r.id) ?? [];
              return (
                <li key={r.id} className="py-3 first:pt-0 last:pb-0">
                  <div className="flex items-start gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium">{t(r.kind ?? "Other")}</p>
                      <p className="text-xs text-muted-foreground">{t("Sent {date}", { date: formatDate(r.created_at) })}</p>
                    </div>
                    <Pill tone={requestTone(r.status)}>{t(r.status)}</Pill>
                  </div>
                  <p className="mt-1.5 text-sm whitespace-pre-wrap">{r.description}</p>
                  {v && <p className="mt-1.5 text-xs text-muted-foreground">{t("Visit scheduled for {when}", { when: formatDateTime(v.starts_at) })}{v.technician_first_name ? ` · ${v.technician_first_name}` : ""}</p>}
                  {media.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {media.map((f) => (
                        <a key={f.id} href={portalFileHref(f.id)} target="_blank" rel="noopener" className="inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-xs hover:bg-muted">
                          <ImageIcon className="size-3.5" aria-hidden /> {f.file_name}
                        </a>
                      ))}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        <p className="mt-3 text-xs text-muted-foreground">{t("Our office reads every request and calls you to confirm a date. Nothing is scheduled automatically.")}</p>
      </PortalCard>
    </div>
  );
}
