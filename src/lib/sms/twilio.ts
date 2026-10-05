import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

// F18 SMS through Twilio, always via the sms_outbox table (like email through email_outbox).
// SMS_TEST_MODE (default on everywhere but production) redirects every message to SMS_TEST_RECIPIENT
// and prefixes it with [TEST]. Needs TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN and TWILIO_FROM.

export const smsConfigured = () => Boolean(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_FROM);
export const smsTestMode = () => process.env.SMS_TEST_MODE !== "false";

export type QueuedSms = { to: string; body: string; employee_id?: number | null; visit_id?: number | null; kind?: string };

export async function queueSms(db: SupabaseClient, m: QueuedSms): Promise<string> {
  const { data, error } = await db
    .from("sms_outbox")
    .insert({ to_number: m.to, body: m.body, employee_id: m.employee_id ?? null, visit_id: m.visit_id ?? null, kind: m.kind ?? "report_reminder", test_mode: smsTestMode() })
    .select("id")
    .single();
  if (error || !data) throw new Error(`sms outbox: ${error?.message ?? "not queued"}`);
  return (data as { id: string }).id;
}

/** One message through Twilio's REST API (no SDK needed). Returns the message SID. */
export async function sendSms(to: string, body: string): Promise<string> {
  const sid = process.env.TWILIO_ACCOUNT_SID!;
  const token = process.env.TWILIO_AUTH_TOKEN!;
  const from = process.env.TWILIO_FROM!;
  const params = new URLSearchParams({ To: to, Body: body });
  if (from.startsWith("MG")) params.set("MessagingServiceSid", from);
  else params.set("From", from);
  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: "POST",
    headers: { Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString("base64")}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: params,
  });
  const json = (await res.json().catch(() => ({}))) as { sid?: string; message?: string; code?: number };
  if (!res.ok || !json.sid) throw new Error(json.message ? `Twilio ${json.code ?? res.status}: ${json.message}` : `Twilio answered ${res.status}`);
  return json.sid;
}

/** Send what is queued. Test mode goes to the test number; without Twilio keys the rows stay queued with the reason. */
export async function deliverQueuedSms(db: SupabaseClient, limit = 50): Promise<{ sent: number; failed: number }> {
  const out = { sent: 0, failed: 0 };
  const { data } = await db.from("sms_outbox").select("id, to_number, body, test_mode").eq("status", "queued").order("created_at").limit(limit);
  for (const m of (data ?? []) as { id: string; to_number: string; body: string; test_mode: boolean }[]) {
    if (!smsConfigured()) {
      await db.from("sms_outbox").update({ error: "Twilio is not set up (TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM)" }).eq("id", m.id);
      out.failed++;
      continue;
    }
    const test = m.test_mode || smsTestMode();
    const to = test ? process.env.SMS_TEST_RECIPIENT || "" : m.to_number;
    if (test && !to) {
      await db.from("sms_outbox").update({ status: "failed", error: "SMS_TEST_MODE is on but SMS_TEST_RECIPIENT is empty" }).eq("id", m.id);
      out.failed++;
      continue;
    }
    try {
      const providerId = await sendSms(to, test ? `[TEST → ${m.to_number}] ${m.body}` : m.body);
      await db.from("sms_outbox").update({ status: "sent", provider_id: providerId, sent_at: new Date().toISOString(), error: null }).eq("id", m.id);
      out.sent++;
    } catch (e) {
      await db.from("sms_outbox").update({ status: "failed", error: e instanceof Error ? e.message : String(e) }).eq("id", m.id);
      out.failed++;
    }
  }
  return out;
}
