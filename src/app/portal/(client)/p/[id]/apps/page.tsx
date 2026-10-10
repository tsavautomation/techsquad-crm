import { requireClient } from "@/lib/portal/session";
import { projectApps } from "@/lib/portal/data";
import { recordsDb } from "@/lib/records/data";
import { Empty, PortalCard } from "@/components/portal/shell";
import { AppLinks } from "@/components/portal/app-links";
import { getT } from "@/i18n/server";

/** Apps: what the customer installs on their phone for each system, with the store buttons for their device. */
export default async function AppsPage({ params }: PageProps<"/portal/p/[id]">) {
  await requireClient();
  const { id } = await params;
  const t = await getT();
  const apps = await projectApps(await recordsDb(), Number(id));

  return (
    <div className="flex flex-col gap-4">
      {apps.length === 0 && <Empty>{t("No apps listed for this project.")}</Empty>}
      {apps.map((a) => (
        <PortalCard key={a.id} title={a.title ?? ""}>
          {a.purpose && <p className="text-sm text-muted-foreground">{a.purpose}</p>}
          <AppLinks ios={a.ios_url} android={a.android_url} web={a.web_url} />
        </PortalCard>
      ))}
    </div>
  );
}
