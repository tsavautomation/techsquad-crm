import { timingSafeEqual } from "node:crypto";
import { after } from "next/server";
import { z } from "zod";
import { adminDb, hasAdminKey } from "@/lib/supabase/admin";
import { fileMessage, fileMissing, readPending } from "@/lib/whatsapp/triage";
import { QUIET_MS } from "@/lib/whatsapp/triage-engine";

// F28 WhatsApp Monitor: the capture PC (wa_agent.py) POSTs each WhatsApp notification here with the header
// X-Agent-Secret = WHATSAPP_AGENT_SECRET. The message is stored and put on its chat's conversation at once;
// the AI reading waits until the chat has been quiet (F28-b), so a greeting followed by the real request becomes
// one card. A resend after a restart (same device + notif_id) answers 200 and changes nothing.

export const maxDuration = 300;

const Body = z.object({
  device: z.string().trim().min(1).max(80),
  notif_id: z.coerce.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
  captured_at: z.string().datetime({ offset: true }).optional(),
  chat: z.string().trim().min(1).max(300),
  sender: z.string().trim().max(300).nullish(),
  body: z.string().trim().min(1).max(20_000),
});

function authorized(req: Request) {
  const secret = process.env.WHATSAPP_AGENT_SECRET;
  if (!secret) return false;
  const got = Buffer.from(req.headers.get("x-agent-secret") ?? "");
  const want = Buffer.from(secret);
  return got.length === want.length && timingSafeEqual(got, want);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

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
  if (!parsed.success) return Response.json({ ok: false, error: "Bad body", issues: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`) }, { status: 400 });
  const b = parsed.data;
  const db = adminDb();
  const { data, error } = await db
    .from("wa_messages")
    .upsert({ device: b.device, notif_id: b.notif_id, captured_at: b.captured_at ?? new Date().toISOString(), chat: b.chat, sender: b.sender || b.chat, body: b.body }, { onConflict: "device,notif_id", ignoreDuplicates: true })
    .select("id");
  if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });
  const id = (data as { id: number }[] | null)?.[0]?.id;
  if (!id) return Response.json({ ok: true, duplicate: true });
  const conversationId = await fileMessage(db, id);
  // F28-e: the PC status line ("last message … ago").
  await db.from("wa_agents").update({ last_message_at: b.captured_at ?? new Date().toISOString() }).eq("device", b.device);

  after(async () => {
    try {
      const filed = await fileMissing(db).catch(() => 0);
      // Wait out the quiet period, then read whatever has gone quiet (a newer message postpones its chat).
      await sleep(QUIET_MS + 5_000);
      const read = await readPending(db);
      console.log("whatsapp ingest:", JSON.stringify({ id, conversationId, filed, read }));
    } catch (e) {
      console.error("whatsapp reading failed:", e);
    }
  });
  return Response.json({ ok: true, id, conversation_id: conversationId });
}
