import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { adminDb, hasAdminKey } from "@/lib/supabase/admin";

// F28-e: the capture PC says "still here" every minute (wa_agent.py v2), with its version, when it started and how
// many messages wait in its outbox. The board shows it; the 5-minute cron warns when it stops (whatsapp_silent).

const Body = z.object({
  device: z.string().trim().min(1).max(80),
  version: z.string().trim().max(40).optional(),
  started_at: z.string().datetime({ offset: true }).optional(),
  pending: z.coerce.number().int().min(0).max(1_000_000).optional(),
});

function authorized(req: Request) {
  const secret = process.env.WHATSAPP_AGENT_SECRET;
  if (!secret) return false;
  const got = Buffer.from(req.headers.get("x-agent-secret") ?? "");
  const want = Buffer.from(secret);
  return got.length === want.length && timingSafeEqual(got, want);
}

export async function POST(req: Request) {
  if (!authorized(req)) return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  if (!hasAdminKey()) return Response.json({ ok: false, error: "SUPABASE_SECRET_KEY is not set" }, { status: 500 });
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return Response.json({ ok: false, error: "Body must be JSON" }, { status: 400 });
  }
  const parsed = Body.safeParse(json);
  if (!parsed.success) return Response.json({ ok: false, error: "Bad body" }, { status: 400 });
  const b = parsed.data;
  const { error } = await adminDb().from("wa_agents").upsert({ device: b.device, version: b.version ?? null, started_at: b.started_at ?? null, pending: b.pending ?? 0, last_seen_at: new Date().toISOString() }, { onConflict: "device" });
  if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });
  return Response.json({ ok: true });
}
