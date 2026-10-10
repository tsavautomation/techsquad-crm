import { notFound } from "next/navigation";
import { MapPin } from "lucide-react";
import { requireClient } from "@/lib/portal/session";
import { myProject } from "@/lib/portal/data";
import { addressLines } from "@/lib/portal/format";
import { recordsDb } from "@/lib/records/data";
import { Pill, ProjectTabs } from "@/components/portal/shell";
import { getT } from "@/i18n/server";

/** One project: its name and address on top, then the sections as tabs. */
export default async function ProjectLayout({ params, children }: LayoutProps<"/portal/p/[id]">) {
  await requireClient();
  const { id } = await params;
  const projectId = Number(id);
  if (!Number.isInteger(projectId)) notFound();
  const t = await getT();
  const p = await myProject(await recordsDb(), projectId);
  if (!p) notFound();
  const lines = addressLines(p.job_address, p.apartment_or_unit);
  const base = `/portal/p/${p.id}`;
  const tabs = [
    { href: base, label: t("Overview"), exact: true },
    { href: `${base}/visits`, label: t("Visits") },
    { href: `${base}/requests`, label: t("Requests") },
    { href: `${base}/money`, label: t("Finances") },
    { href: `${base}/passwords`, label: t("Passwords") },
    { href: `${base}/apps`, label: t("Apps") },
    { href: `${base}/documents`, label: t("Documents") },
  ];
  const mapQuery = lines.length ? encodeURIComponent(lines.join(", ")) : null;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <div className="flex items-start justify-between gap-3">
          <h1 className="text-[21px] font-semibold break-words">{p.title ?? `#${p.id}`}</h1>
          {p.job_status && <Pill tone={p.job_status === "Completed" ? "ok" : "info"}>{t(p.job_status)}</Pill>}
        </div>
        {lines.length > 0 && (
          <a href={mapQuery ? `https://maps.apple.com/?q=${mapQuery}` : undefined} className="inline-flex items-start gap-1.5 text-sm text-muted-foreground hover:text-foreground">
            <MapPin className="mt-0.5 size-4 shrink-0" aria-hidden />
            <span>{lines.join(", ")}</span>
          </a>
        )}
      </div>
      <ProjectTabs tabs={tabs} />
      {children}
    </div>
  );
}
