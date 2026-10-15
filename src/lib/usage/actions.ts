"use server";

import { getSession } from "@/lib/auth/session";
import { readImpersonator } from "@/lib/admin/impersonate";
import { todayET } from "@/lib/dates";
import { adminDb, hasAdminKey } from "@/lib/supabase/admin";
import { applyPing, type UsageDay } from "./engine";

// ADM-b: the heartbeat. Called by the browser every minute while the person is active, and on each page.
// Writes through the service role (the table is read-only for people); never throws to the client.
// While an administrator is signed in as someone else (ADM-a) nothing is counted for either of them.

export async function usagePingAction(page: boolean): Promise<void> {
  try {
    const session = await getSession();
    if (session.status !== "active" || !hasAdminKey()) return;
    if (await readImpersonator()) return;
    const db = adminDb();
    const now = new Date();
    const day = todayET(now);
    const { data } = await db.from("usage_days").select("first_at, last_at, active_seconds, sessions, pages").eq("user_id", session.user.id).eq("day", day).maybeSingle();
    const next = applyPing((data as UsageDay | null) ?? null, now, Boolean(page));
    await db.from("usage_days").upsert({ user_id: session.user.id, day, ...next });
  } catch {
    // usage is best effort
  }
}
