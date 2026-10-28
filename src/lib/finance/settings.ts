import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

// FIN-c: app_settings 'finance'. Grace days before an open invoice counts as Past Due (Fred 2026-10-28: default 0).
export const FinanceSettingsSchema = z.object({
  grace_days: z.coerce.number().int().min(0).max(120).default(0),
});
export type FinanceSettings = z.infer<typeof FinanceSettingsSchema>;

export async function loadFinanceSettings(db: SupabaseClient): Promise<FinanceSettings> {
  const { data } = await db.from("app_settings").select("value").eq("key", "finance").maybeSingle();
  const parsed = FinanceSettingsSchema.safeParse((data as { value?: unknown } | null)?.value ?? {});
  return parsed.success ? parsed.data : FinanceSettingsSchema.parse({});
}
