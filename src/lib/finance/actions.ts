"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/session";
import { adminDb, hasAdminKey } from "@/lib/supabase/admin";
import { FinanceSettingsSchema } from "./settings";

// FIN-c: the grace days before an open invoice counts as Past Due (administrators, on the Finance tab).

export async function setGraceDaysAction(days: number): Promise<{ ok: true } | { ok: false; message: string }> {
  const me = await requireUser();
  if (!me.isSysadmin) return { ok: false, message: "Only an administrator can change the grace days." };
  if (!hasAdminKey()) return { ok: false, message: "The server has no admin key." };
  const parsed = FinanceSettingsSchema.safeParse({ grace_days: days });
  if (!parsed.success) return { ok: false, message: "Grace days must be a whole number between 0 and 120." };
  const { error } = await adminDb().from("app_settings").upsert({ key: "finance", value: parsed.data });
  if (error) return { ok: false, message: error.message };
  revalidatePath("/administrative/finance");
  revalidatePath("/");
  return { ok: true };
}
