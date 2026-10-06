"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/session";
import { recordsDb } from "@/lib/records/data";

// F20: "I understand" on the red warning. RLS limits the update to the person's own rows.
export async function acknowledgeWarningsAction(): Promise<{ ok: true } | { ok: false; message: string }> {
  await requireUser();
  const db = await recordsDb();
  const { error } = await db.from("field_warnings").update({ acknowledged_at: new Date().toISOString() }).is("acknowledged_at", null);
  if (error) return { ok: false, message: error.message };
  revalidatePath("/", "layout");
  return { ok: true };
}
