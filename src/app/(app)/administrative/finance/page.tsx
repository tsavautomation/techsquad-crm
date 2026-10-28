import Link from "next/link";
import { notFound } from "next/navigation";
import { ByClientTable, ProjectsTable } from "@/components/finance/finance-tables";
import { PortalReview } from "@/components/finance/portal-review";
import { IgnoredList } from "@/components/finance/ignored-list";
import { requireUser } from "@/lib/auth/session";
import { todayET } from "@/lib/dates";
import { toCardData } from "@/lib/finance/cards";
import { CLIENT_KEYS, loadByClient, loadFinanceProjects, loadIgnored, loadReview, type ClientKey } from "@/lib/finance/load";
import { canSeeFinance } from "@/lib/finance/access";
import { loadSettings } from "@/lib/portalio/client";
import { recordsDb } from "@/lib/records/data";
import { getTable } from "@/registry";
import { tableHref } from "@/registry/routes";
import { cn } from "@/lib/utils";
import { getT } from "@/i18n/server";

export async function generateMetadata() {
  return { title: (await getT())("Finance") };
}

// PI-h (Fred 2026-10-28): Administrative › Finance. Portal.io proposals to review, every project by payment status,
// and totals by client in a period ("all Navicon projects at year end").

type Search = { tab?: string; by?: string; from?: string; to?: string };

export default async function FinancePage({ searchParams }: { searchParams: Promise<Search> }) {
  const tr = await getT();
  const user = await requireUser();
  if (!canSeeFinance(user)) notFound();
  const sp = await searchParams;
  const tab = sp.tab === "clients" ? "clients" : sp.tab === "portal" ? "portal" : "projects";
  const by = (CLIENT_KEYS.some((k) => k.key === sp.by) ? sp.by : "owner") as ClientKey;
  const year = todayET().slice(0, 4);
  const from = sp.from ?? `${year}-01-01`;
  const to = sp.to ?? todayET();
  const db = await recordsDb();
  const [projects, review, ignored, settings] = await Promise.all([loadFinanceProjects(db), loadReview(db), user.isSysadmin ? loadIgnored(db) : Promise.resolve([]), loadSettings().catch(() => null)]);
  const groups = tab === "clients" ? await loadByClient(db, projects, by, from, to) : [];
  const hrefFor = tableHref(getTable("projects"));
  const tabs: { id: "projects" | "clients" | "portal"; label: string; count?: number }[] = [
    { id: "projects", label: tr("Projects") },
    { id: "clients", label: tr("By client") },
    { id: "portal", label: tr("Portal.io"), count: review.length },
  ];

  return (
    <div className="mx-auto max-w-[1300px]">
      <div className="mb-4">
        <h1 className="text-[21px] font-semibold tracking-tight md:text-2xl">{tr("Finance")}</h1>
        <p className="text-xs text-muted-foreground">{tr("Every project with money: payment status, totals by client, and the proposals Portal.io accepted that still need a project.")}</p>
      </div>
      <nav className="mb-3 flex gap-1.5 overflow-x-auto">
        {tabs.map((x) => (
          <Link key={x.id} href={x.id === "projects" ? "/administrative/finance" : `/administrative/finance?tab=${x.id}`} className={cn("inline-flex min-h-10 items-center gap-1.5 rounded-full border px-3.5 text-sm font-medium whitespace-nowrap", tab === x.id ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:bg-muted")}>
            {x.label}
            {x.count ? <span className={cn("rounded-full px-1.5 text-xs", tab === x.id ? "bg-primary-foreground/20" : "bg-warn-bg text-warn-fg")}>{x.count}</span> : null}
          </Link>
        ))}
      </nav>
      <section className="rounded-2xl border bg-card px-[18px] py-4 shadow-card">
        {tab === "projects" && <ProjectsTable rows={projects} hrefFor={hrefFor} />}
        {tab === "clients" && <ByClientTable groups={groups} keys={CLIENT_KEYS} current={by} from={from} to={to} hrefFor={hrefFor} />}
        {tab === "portal" && (
          <div>
            {!settings && (
              <p className="mb-3 rounded-[10px] bg-warn-bg px-3 py-2 text-sm text-warn-fg">
                {tr("Portal.io is not connected.")}{" "}
                {user.isSysadmin && (
                  <Link href="/admin/portalio" className="underline">
                    {tr("Connect it under Admin › Portal.io.")}
                  </Link>
                )}
              </p>
            )}
            <p className="mb-3 text-[13px] text-text-2">{tr("Accepted proposals without a project, and linked ones that changed in Portal.io. Nothing is created until you choose: Link to project, New project (you pick or create the Job Owner), Ignore; Refresh, Replace or Keep as is.")}</p>
            {review.length ? <PortalReview cards={toCardData(review)} /> : <p className="py-6 text-center text-sm text-text-2">{tr("Nothing to review.")}</p>}
            {ignored.length > 0 && <IgnoredList rows={ignored.map((p) => ({ id: p.id, number: p.number, name: p.name, total: p.total }))} />}
            {settings?.last_sync_at && <p className="mt-3 text-xs text-text-2">{tr("Last sync with Portal.io: {when}", { when: new Date(settings.last_sync_at).toLocaleString("en-US", { timeZone: "America/New_York" }) })}</p>}
          </div>
        )}
      </section>
    </div>
  );
}
