"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/session";
import { disconnect } from "./client";

/** Admin › Bouncie › Disconnect: forget the tokens; the map stops showing vehicles. Administrators only. */
export async function disconnectBouncieAction(): Promise<{ ok: true } | { ok: false; message: string }> {
  const me = await requireUser();
  if (!me.isSysadmin) return { ok: false, message: "Only an administrator can disconnect Bouncie." };
  await disconnect();
  revalidatePath("/admin/bouncie");
  revalidatePath("/schedule/map");
  return { ok: true };
}
