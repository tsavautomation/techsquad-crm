import { Sparkles } from "lucide-react";
import type { CurrentUser } from "@/lib/auth/session";
import { aiConfigured } from "@/lib/ai/claude";
import { formatDateTime } from "@/lib/dates";
import { recordsDb } from "@/lib/records/data";
import { getTable } from "@/registry";
import { canDo } from "@/registry/permissions";
import { getT } from "@/i18n/server";
import { BriefRebuild } from "./brief-rebuild";

// F26-3 Project brief (SPEC §9.1 F26-b): the short note Claude rewrites after each new timeline event —
// status, open requests and who waits on whom, latest decisions, next step, last contact. Nothing yet and
// nobody who may rebuild it → no card.

export async function ProjectBrief({ projectId, user }: { projectId: number; user: CurrentUser }) {
  const tr = await getT();
  const db = await recordsDb();
  const { data } = await db.from("projects").select("brief, brief_at").eq("id", projectId).maybeSingle();
  const p = data as { brief: string | null; brief_at: string | null } | null;
  const canBuild = aiConfigured() && canDo(user.permissions, getTable("projects"), "modify", getTable);
  if (!p?.brief && !canBuild) return null;
  return (
    <section id="brief" className="mb-3.5 scroll-mt-20 rounded-2xl border bg-card px-[18px] py-4 shadow-card">
      <h2 className="mb-1 flex items-center gap-2 text-[15px] font-semibold tracking-tight">
        <Sparkles className="size-4" aria-hidden /> {tr("Project brief (AI)")}
      </h2>
      {p?.brief ? (
        <>
          <p className="mb-2 text-xs text-muted-foreground">{tr("Written by Claude from the timeline; rewritten after each new email or event. Last update {when}.", { when: formatDateTime(p.brief_at) })}</p>
          <div className="text-sm whitespace-pre-wrap">{p.brief}</div>
        </>
      ) : (
        <p className="text-sm text-muted-foreground">{tr("No brief yet. It is written when the first email lands on this project, or now with the button.")}</p>
      )}
      {canBuild && <BriefRebuild projectId={projectId} hasBrief={Boolean(p?.brief)} />}
    </section>
  );
}
