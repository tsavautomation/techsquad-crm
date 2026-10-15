import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

// BK-a: app_settings 'backups'. The hour is Eastern; the restore list is the only gate on restoring
// (System Administrators do not bypass it: Fred 2026-10-14, "only fred can click a file to recover").
export const BackupSettingsSchema = z.object({
  hour: z.coerce.number().int().min(0).max(23).default(3),
  retention_days: z.coerce.number().int().min(7).max(365).default(30),
  restore_emails: z.array(z.string().email()).default(["fred@tsav.net"]),
});
export type BackupSettings = z.infer<typeof BackupSettingsSchema>;

export async function loadBackupSettings(db: SupabaseClient): Promise<BackupSettings> {
  const { data } = await db.from("app_settings").select("value").eq("key", "backups").maybeSingle();
  const parsed = BackupSettingsSchema.safeParse((data as { value?: unknown } | null)?.value ?? {});
  return parsed.success ? parsed.data : BackupSettingsSchema.parse({});
}

export const mayRestore = (settings: BackupSettings, email: string) => settings.restore_emails.map((e) => e.toLowerCase()).includes(email.toLowerCase());
