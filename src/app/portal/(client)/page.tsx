import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { requireClient } from "@/lib/portal/session";
import { myProjects } from "@/lib/portal/data";
import { addressLines } from "@/lib/portal/format";
import { recordsDb } from "@/lib/records/data";
import { Empty, Pill } from "@/components/portal/shell";
import { getT } from "@/i18n/server";

/** Home: the customer's projects. With a single project, straight to it. */
export default async function PortalHome() {
  const user = await requireClient();
  const t = await getT();
  const projects = await myProjects(await recordsDb());
  if (projects.length === 1) redirect(`/portal/p/${projects[0].id}`);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-[21px] font-semibold">{t("Hello, {name}", { name: user.firstName ?? "" }).trim()}</h1>
        <p className="text-sm text-muted-foreground">{t("Your projects with Tech Squad.")}</p>
      </div>
      {projects.length === 0 && <Empty>{t("No project has been shared with you yet. Please contact our office.")}</Empty>}
      <ul className="flex flex-col gap-3">
        {projects.map((p) => {
          const lines = addressLines(p.job_address, p.apartment_or_unit);
          return (
            <li key={p.id}>
              <Link href={`/portal/p/${p.id}`} className="flex items-center gap-3 rounded-2xl border bg-card p-4 shadow-card hover:bg-muted/40">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[15px] font-semibold">{p.title ?? `#${p.id}`}</p>
                  {lines[0] && <p className="truncate text-xs text-muted-foreground">{lines.join(" · ")}</p>}
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {p.job_status && <Pill tone={p.job_status === "Completed" ? "ok" : "info"}>{t(p.job_status)}</Pill>}
                    {p.maintenance_plan && p.maintenance_type && <Pill tone="muted">{t("{plan} plan", { plan: t(p.maintenance_type) })}</Pill>}
                  </div>
                </div>
                <ChevronRight className="size-5 shrink-0 text-muted-foreground" aria-hidden />
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
