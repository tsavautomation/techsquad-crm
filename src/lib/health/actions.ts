"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/session";
import { runHealthChecks } from "./checks";
import type { HealthReport } from "./report";

/** HC-a: Admin › Diagnostics › Run now (administrators). */
export async function runHealthNowAction(): Promise<{ ok: true; report: HealthReport } | { ok: false; message: string }> {
  const me = await requireUser();
  if (!me.isSysadmin) return { ok: false, message: "Administrators only." };
  try {
    const report = await runHealthChecks("manual");
    revalidatePath("/admin/health");
    revalidatePath("/");
    return { ok: true, report };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  }
}
