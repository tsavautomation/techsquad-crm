import type { CurrentUser } from "@/lib/auth/session";
import { SiteHistoryRebuild } from "@/components/project/site-history-rebuild";
import { aiConfigured } from "@/lib/ai/claude";
import { formatDateTime } from "@/lib/dates";
import { recordsDb } from "@/lib/records/data";
import { getTable } from "@/registry";
import { canDo } from "@/registry/permissions";
import { getT } from "@/i18n/server";

// F19-d Site history at the top of the project page: the AI note rewritten after every reviewed
// report. No credentials in it (they stay in System Credentials). "Build from the reports" reads
// the last 30 reports in one call.

export async function SiteHistory({ projectId, user }: { projectId: number; user: CurrentUser }) {
  const tr = await getT();
  const db = await recordsDb();
  const { data } = await db.from("projects").select("site_summary, site_summary_at").eq("id", projectId).maybeSingle();
  const p = data as { site_summary: string | null; site_summary_at: string | null } | null;
  const canBuild = aiConfigured() && canDo(user.permissions, getTable("projects"), "modify", getTable);
  if (!p?.site_summary && !canBuild) return null;
  return (
    <section id="site-history" className="mb-3.5 scroll-mt-20 rounded-2xl border bg-card px-[18px] py-4 shadow-card">
      <h2 className="mb-1 text-[15px] font-semibold tracking-tight">{tr("Site history (AI)")}</h2>
      {p?.site_summary ? (
        <>
          <p className="mb-2 text-xs text-muted-foreground">{tr("Written by Claude from the Job Reports; last updated {when}. Logins and codes are never here: see System Credentials.", { when: formatDateTime(p.site_summary_at) })}</p>
          <div className="text-sm whitespace-pre-wrap">{p.site_summary}</div>
        </>
      ) : (
        <p className="mb-2 text-sm text-text-2">{tr("No site history yet. It grows as new Job Reports are reviewed, or build it now from the last 30 reports.")}</p>
      )}
      {canBuild && <SiteHistoryRebuild projectId={projectId} hasSummary={Boolean(p?.site_summary)} />}
    </section>
  );
}
