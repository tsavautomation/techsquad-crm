import "server-only";
import webpush from "web-push";
import { adminDb } from "@/lib/supabase/admin";
import { recipientsFor, type PushKind, type PushMessage } from "./engine";

// F27 Push notifications: sends a message to every device of every login that asked for this
// kind of event, and writes a line in push_log for each. Runs after the response (next/server after()).

export const pushConfigured = () => Boolean(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);

let ready = false;
function configure() {
  if (ready) return true;
  if (!pushConfigured()) return false;
  webpush.setVapidDetails(process.env.VAPID_SUBJECT || "mailto:info@tsav.net", process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!, process.env.VAPID_PRIVATE_KEY!);
  ready = true;
  return true;
}

type Sub = { id: string; user_id: string; endpoint: string; p256dh: string; auth: string };

/** Sends `message` for `kind` to its recipients. Never throws: failures land in push_log.error. */
export async function notifyPush(kind: PushKind, message: PushMessage, exceptUserId?: string): Promise<{ sent: number; failed: number }> {
  if (!configure()) return { sent: 0, failed: 0 };
  const db = adminDb();
  const { data: profiles } = await db.from("profiles").select("id, active, push_events").not("push_events", "eq", "{}");
  const people = recipientsFor(kind, (profiles ?? []) as { id: string; active: boolean; push_events: string[] | null }[]).filter((p) => p.id !== exceptUserId);
  if (!people.length) return { sent: 0, failed: 0 };
  const { data: subs } = await db.from("push_subscriptions").select("id, user_id, endpoint, p256dh, auth").in("user_id", people.map((p) => p.id)).is("failed_at", null);
  let sent = 0, failed = 0;
  const payload = JSON.stringify(message);
  await Promise.all(
    ((subs ?? []) as Sub[]).map(async (s) => {
      const log = { user_id: s.user_id, kind, title: message.title, body: message.body, url: message.url };
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: 60 * 60 });
        sent++;
        await Promise.all([db.from("push_log").insert({ ...log, sent_at: new Date().toISOString() }), db.from("push_subscriptions").update({ last_used_at: new Date().toISOString() }).eq("id", s.id)]);
      } catch (e) {
        failed++;
        const status = (e as { statusCode?: number }).statusCode;
        const msg = `${status ?? ""} ${(e as Error).message ?? e}`.trim();
        await db.from("push_log").insert({ ...log, error: msg });
        // 404 / 410: the browser dropped the subscription; it is dead for good.
        if (status === 404 || status === 410) await db.from("push_subscriptions").update({ failed_at: new Date().toISOString() }).eq("id", s.id);
      }
    }),
  );
  return { sent, failed };
}
