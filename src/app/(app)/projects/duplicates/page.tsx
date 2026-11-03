import Link from "next/link";
import { notFound } from "next/navigation";
import { DuplicatesPanel } from "@/components/projects/duplicates-panel";
import { requireUser } from "@/lib/auth/session";
import { loadDuplicatePairs } from "@/lib/projects/load";
import { recordsDb } from "@/lib/records/data";
import { getT } from "@/i18n/server";

export const maxDuration = 120;

export async function generateMetadata() {
  return { title: (await getT())("Possible duplicates") };
}

/** PJ-b item 2: Projects › Possible duplicates. */
export default async function DuplicatesPage() {
  const tr = await getT();
  const user = await requireUser();
  if (!user.permissions.has("projects.projects.view_all") && !user.isSysadmin) notFound();
  const canAct = user.isSysadmin || user.permissions.has("projects.projects.modify");
  const db = await recordsDb();
  // Before migration 20261102100000 is applied the tables are missing: say so instead of a broken page.
  const loaded = await loadDuplicatePairs(db).catch((e: Error) => e);
  if (loaded instanceof Error) return <p className="mx-auto max-w-[1100px] rounded-2xl border border-dashed bg-card px-6 py-10 text-center text-text-2">{tr("This screen needs the database update that is still to be applied.")} ({loaded.message})</p>;
  const { pairs, merges } = loaded;
  return (
    <div className="mx-auto max-w-[1100px]">
      <p className="text-sm text-muted-foreground">
        <Link href="/projects/projects" className="underline underline-offset-4">
          {tr("Projects")}
        </Link>
      </p>
      <h1 className="mb-1 text-2xl font-semibold tracking-tight">{tr("Possible duplicates")}</h1>
      <p className="mb-4 text-sm text-text-2">{tr("Projects that look like the same job: same owner at the same place, or the same building and unit (1402 = 1402S, St Regis = St. Regis, \"Abrahao, Marco\" = \"Marco Abrahao\"). Merge moves everything (visits, job reports, hours, transactions, files, stock, history, tasks) to the project you keep and archives the other one; nothing is deleted, and a merge can be undone.")}</p>
      <p className="mb-4 text-sm text-text-2">{tr("{n} pairs to look at", { n: pairs.length })}</p>
      <DuplicatesPanel pairs={pairs} merges={merges} canAct={canAct} />
    </div>
  );
}
