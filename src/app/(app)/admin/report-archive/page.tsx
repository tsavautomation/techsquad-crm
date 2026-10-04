import { notFound } from "next/navigation";
import { ReportArchivePanel } from "@/components/admin/report-archive-panel";
import { aiConfigured } from "@/lib/ai/claude";
import { busy, defaultCutoff, folderNames, loadDecisions, loadState, ROOT, summary } from "@/lib/archive/sync";
import { requireUser } from "@/lib/auth/session";
import { oneDriveReady } from "@/lib/files/onedrive";
import { adminDb } from "@/lib/supabase/admin";
import { getT } from "@/i18n/server";

export const maxDuration = 300;

export async function generateMetadata() {
  return { title: (await getT())("Report archive") };
}

/** Admin › Report archive (F16): the old field reports in OneDrive become Job Reports and Visits. */
export default async function ReportArchivePage() {
  const t = await getT();
  const me = await requireUser();
  if (!me.isSysadmin) notFound();
  const ready = await oneDriveReady();
  const [state, sum, cutoff, decisions, folders, projects] = ready
    ? await Promise.all([
        loadState(),
        summary(),
        defaultCutoff(),
        loadDecisions(),
        folderNames(),
        adminDb()
          .from("projects")
          .select("id, title")
          .is("deleted_at", null)
          .order("title")
          .then((r) => ((r.data ?? []) as { id: number; title: string | null }[]).filter((p) => p.title).map((p) => ({ id: p.id, title: p.title! }))),
      ])
    : [null, null, null, [], [], []];

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-[21px] font-semibold tracking-tight md:text-2xl">{t("Report archive")}</h1>
      <p className="mb-4 text-xs text-muted-foreground">
        {t("The field reports from before WebAuthor, filed in OneDrive under {root} / designer or contractor / client / Reports, become Job Reports and Visits. The files stay where they are; each report links to its original.", { root: ROOT })}
      </p>
      {!ready ? (
        <section className="rounded-2xl border bg-card px-[18px] py-4 shadow-card">
          <p className="text-sm text-text-2">{t("Connect OneDrive first (Admin › OneDrive).")}</p>
        </section>
      ) : (
        <ReportArchivePanel initial={{ state, busy: busy(state), summary: sum!, defaultCutoff: cutoff!, decisions }} folders={folders} projects={projects} aiAvailable={aiConfigured()} />
      )}
    </div>
  );
}
