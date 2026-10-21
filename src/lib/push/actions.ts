"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/session";
import { recordsDb } from "@/lib/records/data";
import { isPushKind } from "./engine";
import { notifyPush, pushConfigured } from "./send";

// F27 Push notifications: this device's subscription (the person), the events a login receives
// (administrators), and a test message.

type Result = { ok: true } | { ok: false; message: string };

export type PushStatus = { configured: boolean; events: string[]; devices: number };

/** What the account menu needs: whether push is set up, which events this login gets, how many devices are subscribed. */
export async function pushStatusAction(): Promise<PushStatus> {
  const user = await requireUser();
  const db = await recordsDb();
  const { count } = await db.from("push_subscriptions").select("id", { count: "exact", head: true }).eq("user_id", user.id).is("failed_at", null);
  return { configured: pushConfigured(), events: [...user.pushEvents], devices: count ?? 0 };
}

/** The browser allowed notifications: keep its endpoint. Re-saving the same endpoint refreshes it. */
export async function savePushSubscriptionAction(sub: { endpoint: string; keys: { p256dh: string; auth: string } }, userAgent: string | null): Promise<Result> {
  const user = await requireUser();
  if (!sub?.endpoint || !sub.keys?.p256dh || !sub.keys?.auth) return { ok: false, message: "Incomplete subscription." };
  const db = await recordsDb();
  const { error } = await db.from("push_subscriptions").upsert({ user_id: user.id, endpoint: sub.endpoint, p256dh: sub.keys.p256dh, auth: sub.keys.auth, user_agent: userAgent?.slice(0, 200) ?? null, failed_at: null }, { onConflict: "endpoint" });
  if (error) return { ok: false, message: error.message };
  return { ok: true };
}

/** Notifications turned off on this device. */
export async function removePushSubscriptionAction(endpoint: string): Promise<Result> {
  const user = await requireUser();
  const db = await recordsDb();
  const { error } = await db.from("push_subscriptions").delete().eq("user_id", user.id).eq("endpoint", endpoint);
  if (error) return { ok: false, message: error.message };
  return { ok: true };
}

/** A test message to this person's own devices. */
export async function sendTestPushAction(): Promise<Result & { sent?: number }> {
  const user = await requireUser();
  const db = await recordsDb();
  const { data: subs } = await db.from("push_subscriptions").select("endpoint").eq("user_id", user.id).is("failed_at", null);
  if (!subs?.length) return { ok: false, message: "No device of yours has notifications on." };
  const kinds = [...user.pushEvents];
  if (!kinds.length || !isPushKind(kinds[0])) return { ok: false, message: "No events are turned on for your login." };
  const r = await notifyPush(kinds[0], { title: "Tech Squad test", body: "Notifications are working on this device.", url: "/" }, user.id);
  return r.sent ? { ok: true, sent: r.sent } : { ok: false, message: "Could not send: check the keys on the server." };
}

/** Administrators: which events a login receives (Admin › Users). */
export async function setPushEventsAction(userId: string, events: string[]): Promise<Result> {
  const me = await requireUser();
  if (!me.isSysadmin) return { ok: false, message: "Only an administrator can change this." };
  const clean = [...new Set(events.filter(isPushKind))];
  const db = await recordsDb();
  const { error } = await db.from("profiles").update({ push_events: clean }).eq("id", userId);
  if (error) return { ok: false, message: error.message };
  revalidatePath(`/admin/users/${userId}`);
  return { ok: true };
}
