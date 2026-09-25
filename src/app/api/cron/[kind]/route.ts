import { timingSafeEqual } from "node:crypto";
import { processPendingEvents, runScheduled } from "@/lib/engine/automations";
import { deliverQueued } from "@/lib/engine/email";
import { adminDb, hasAdminKey } from "@/lib/supabase/admin";

// Scheduled automations (SPEC §5 'daily' / 'hourly'). Vercel Cron calls this with
// "Authorization: Bearer <CRON_SECRET>"; the schedule itself is set up in M11.
//   /api/cron/daily   date-driven statuses and reminders
//   /api/cron/hourly  project financial status
//   /api/cron/events  catch up on change history and retry queued email

export const maxDuration = 300;

function authorized(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const got = Buffer.from(req.headers.get("authorization") ?? "");
  const want = Buffer.from(`Bearer ${secret}`);
  return got.length === want.length && timingSafeEqual(got, want);
}

export async function GET(req: Request, ctx: RouteContext<"/api/cron/[kind]">) {
  if (!authorized(req)) return new Response("Unauthorized", { status: 401 });
  if (!hasAdminKey()) return Response.json({ error: "SUPABASE_SECRET_KEY is not set" }, { status: 500 });
  const { kind } = await ctx.params;
  const events = await processPendingEvents();
  if (kind === "daily" || kind === "hourly") {
    const result = await runScheduled(kind);
    await deliverQueued(adminDb());
    return Response.json({ kind, ...events, ...result });
  }
  if (kind === "events") {
    await deliverQueued(adminDb());
    return Response.json({ kind, ...events });
  }
  return new Response("Not found", { status: 404 });
}
