"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/session";
import { recordsDb } from "@/lib/records/data";
import { restoreTable, type RestoreResult } from "./restore";
import { runBackup, type RunResult } from "./run";
import { loadBackupSettings, mayRestore } from "./settings";

// BK-a Admin › Backups. Viewers (backups.page.view) may start a copy now; only the restore list may restore.

const canSee = (user: Awaited<ReturnType<typeof requireUser>>) => user.isSysadmin || user.permissions.has("backups.page.view");

export async function runBackupNowAction(): Promise<{ ok: true; result: RunResult } | { ok: false; message: string }> {
  const user = await requireUser();
  if (!canSee(user)) return { ok: false, message: "You don't have permission to do that." };
  try {
    const result = await runBackup({ kind: "manual", budgetMs: 240_000, startedBy: user.id });
    revalidatePath("/admin/backups");
    return { ok: true, result };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  }
}

export async function restoreTableAction(input: { backupId: number; table: string; deleteMissing: boolean }): Promise<RestoreResult> {
  const user = await requireUser();
  if (!canSee(user)) return { ok: false, message: "You don't have permission to do that." };
  const settings = await loadBackupSettings(await recordsDb());
  if (!mayRestore(settings, user.email)) return { ok: false, message: "Only the people on the restore list can restore a table." };
  const r = await restoreTable({ backupId: Number(input.backupId), table: String(input.table), deleteMissing: Boolean(input.deleteMissing), userId: user.id });
  revalidatePath("/admin/backups");
  return r;
}
