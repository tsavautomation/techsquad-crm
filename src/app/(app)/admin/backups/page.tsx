import { notFound } from "next/navigation";
import { BackupsPanel, type BackupListRow, type RestoreLogRow } from "@/components/admin/backups-panel";
import { requireUser } from "@/lib/auth/session";
import { BACKUPS_ROOT } from "@/lib/backups/format";
import { loadBackupSettings, mayRestore } from "@/lib/backups/settings";
import { oneDriveReady } from "@/lib/files/onedrive";
import { recordsDb } from "@/lib/records/data";
import { getT } from "@/i18n/server";

export async function generateMetadata() {
  return { title: (await getT())("Backups") };
}

/** Admin › Backups (SPEC §9.1 BK-a): the nightly copies in OneDrive, who may see them and who may restore. */
export default async function BackupsPage() {
  const t = await getT();
  const me = await requireUser();
  if (!(me.isSysadmin || me.permissions.has("backups.page.view"))) notFound();
  const db = await recordsDb();
  const [settings, ready, { data: backups }, { data: restores }] = await Promise.all([
    loadBackupSettings(db),
    oneDriveReady(),
    db.from("backups").select("id, day, kind, status, folder_path, started_at, finished_at, tables, bytes, rows_total, error").order("started_at", { ascending: false }).limit(80),
    db.from("backup_restores").select("id, backup_id, table_name, rows_written, rows_deleted, snapshot_backup_id, error, restored_at, profiles:restored_by(first_name, last_name)").order("restored_at", { ascending: false }).limit(20),
  ]);
  const canRestore = mayRestore(settings, me.email);
  const log: RestoreLogRow[] = ((restores ?? []) as unknown as (Omit<RestoreLogRow, "who"> & { profiles: { first_name: string | null; last_name: string | null } | null })[]).map(({ profiles, ...r }) => ({
    ...r,
    who: profiles ? [profiles.first_name, profiles.last_name].filter(Boolean).join(" ") : "",
  }));

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-[21px] font-semibold tracking-tight md:text-2xl">{t("Backups")}</h1>
      <p className="mb-4 text-xs text-muted-foreground">
        {t("Every night at {hour} (Eastern) the CRM copies every table to OneDrive, in {folder}, as .json.gz (exact) and .csv (for Excel). Copies are kept {days} days.", {
          hour: `${settings.hour}:00`,
          folder: BACKUPS_ROOT.replace(/\//g, " › "),
          days: settings.retention_days,
        })}
      </p>
      {!ready && <p className="mb-3 rounded-[10px] bg-bad-bg px-3 py-2 text-sm text-bad-fg">{t("OneDrive is not connected (Admin › OneDrive), so no copy can be written.")}</p>}
      <BackupsPanel backups={(backups ?? []) as unknown as BackupListRow[]} restores={log} canRestore={canRestore} restoreEmails={settings.restore_emails} oneDriveReady={ready} />
    </div>
  );
}
