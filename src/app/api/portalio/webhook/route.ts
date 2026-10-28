import { after } from "next/server";
import { loadSettings } from "@/lib/portalio/client";
import { verifyWebhookSignature } from "@/lib/portalio/sign";
import { refreshProposal } from "@/lib/portalio/sync";
import { hasAdminKey } from "@/lib/supabase/admin";

// PI-b (SPEC §9.1): Portal.io POSTs here when a proposal changes status. The body is checked against the
// subscription's secret (X-Webhook-Signature: t=…,v1=…; five-minute window), then that one proposal is read
// again from Portal.io in the background. Portal.io retries on anything but a 2xx, so a bad signature is 401
// and an unknown body is 200 (nothing to do), never an error that would make it retry forever.

export const maxDuration = 60;

export async function POST(req: Request) {
  if (!hasAdminKey()) return Response.json({ ok: false, error: "SUPABASE_SECRET_KEY is not set" }, { status: 500 });
  const settings = await loadSettings().catch(() => null);
  if (!settings?.webhook) return Response.json({ ok: false, error: "No webhook is registered" }, { status: 401 });
  const raw = await req.text();
  const v = verifyWebhookSignature(settings.webhook.secret, req.headers.get("x-webhook-signature"), raw);
  if (!v.ok) return Response.json({ ok: false, error: v.reason }, { status: 401 });
  let body: unknown = null;
  try {
    body = JSON.parse(raw);
  } catch {
    return Response.json({ ok: true, ignored: "not JSON" });
  }
  // The payload carries the proposal ({"id":10025,"number":4123,…}); some events wrap it under data/proposal.
  const b = body as { id?: unknown; proposalId?: unknown; data?: { id?: unknown; proposalId?: unknown }; proposal?: { id?: unknown } } | null;
  const id = Number(b?.id ?? b?.proposalId ?? b?.data?.id ?? b?.data?.proposalId ?? b?.proposal?.id);
  if (!Number.isFinite(id) || id <= 0) return Response.json({ ok: true, ignored: "no proposal id" });
  after(() => refreshProposal(id).catch(() => undefined));
  return Response.json({ ok: true, proposal: id });
}
