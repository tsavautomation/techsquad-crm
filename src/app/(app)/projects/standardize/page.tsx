import Link from "next/link";
import { notFound } from "next/navigation";
import { StandardizePanel } from "@/components/projects/standardize-panel";
import { requireUser } from "@/lib/auth/session";
import { loadRenamePreview } from "@/lib/projects/load";
import { recordsDb } from "@/lib/records/data";
import { getT } from "@/i18n/server";

export const maxDuration = 120;

export async function generateMetadata() {
  return { title: (await getT())("Standard names") };
}

/** PJ-b item 5: Projects › Standard names: the preview "current → Name Surname - Place #Unit", applied to the chosen ones. */
export default async function StandardizePage() {
  const tr = await getT();
  const user = await requireUser();
  if (!user.permissions.has("projects.projects.view_all") && !user.isSysadmin) notFound();
  const canAct = user.isSysadmin || user.permissions.has("projects.projects.modify");
  const db = await recordsDb();
  // Before migration 20261102100000 is applied the merged_into_id column is missing: say so instead of a broken page.
  const loaded = await loadRenamePreview(db).catch((e: Error) => e);
  if (loaded instanceof Error) return <p className="mx-auto max-w-[1100px] rounded-2xl border border-dashed bg-card px-6 py-10 text-center text-text-2">{tr("This screen needs the database update that is still to be applied.")} ({loaded.message})</p>;
  const rows = loaded;
  return (
    <div className="mx-auto max-w-[1100px]">
      <p className="text-sm text-muted-foreground">
        <Link href="/projects/projects" className="underline underline-offset-4">
          {tr("Projects")}
        </Link>
      </p>
      <h1 className="mb-1 text-2xl font-semibold tracking-tight">{tr("Standard names")}</h1>
      <p className="mb-4 text-sm text-text-2">{tr("Every project is named \"Name Surname - Place #Unit\" (a company: \"Company - Place\"), from the Job Owner and the address. This is a preview: nothing changes until you choose the projects and press Rename. Merge the duplicates first.")}</p>
      <p className="mb-4 text-sm text-text-2">{tr("{n} projects out of the standard", { n: rows.length })}</p>
      <StandardizePanel rows={rows} canAct={canAct} />
    </div>
  );
}
