import { timingSafeEqual } from "node:crypto";
import { after } from "next/server";
import { processPendingEvents, runScheduled, tick } from "@/lib/engine/automations";
import { deliverQueued } from "@/lib/engine/email";
import { adminDb, hasAdminKey } from "@/lib/supabase/admin";

// Scheduled automations (SPEC §5 'daily' / 'hourly', PLAN M11). Callers send
// "Authorization: Bearer <CRON_SECRET>".
//   /api/cron/tick    the timer (Supabase pg_cron hourly, Vercel Cron daily backup): answers at once,
//                     then runs whatever daily / hourly slot is due, once per slot
//   /api/cron/daily   run the daily check now (manual; not slot-limited)
//   /api/cron/hourly  run the hourly check now (manual)
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

  if (kind === "tick") {
    // The timer's HTTP call times out after 30 s; the work carries on after the response.
    after(async () => {
      try {
        console.log("cron tick:", JSON.stringify(await tick()));
      } catch (e) {
        console.error("cron tick failed:", e);
      }
    });
    return Response.json({ kind, started: true }, { status: 202 });
  }

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
