"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/session";
import { getRecord, recordsDb } from "@/lib/records/data";
import type { ActionResult } from "@/lib/records/record-actions";
import { deliverQueuedSms, queueSms, smsConfigured, smsTestMode } from "@/lib/sms/twilio";
import { toE164 } from "@/lib/sms/phone";
import { adminDb, hasAdminKey } from "@/lib/supabase/admin";
import { getTable } from "@/registry";
import { canDo } from "@/registry/permissions";
import { recordHref } from "@/registry/routes";

// F18 Visit = Report rule: excusing a deficiency (Admin / COO, with a reason) and the Admin test SMS.

/** Excuse a deficiency: status Excused, reason, who and when. History (audit log) keeps the trail. */
export async function excuseDeficiencyAction(id: number, reason: string): Promise<ActionResult> {
  const user = await requireUser();
  const t = getTable("report_deficiencies");
  if (!canDo(user.permissions, t, "modify", getTable)) return { ok: false, message: "Only an administrator or the COO can excuse a deficiency." };
  const text = reason.trim().slice(0, 1000);
  if (!text) return { ok: false, message: "Write the reason first." };
  const row = await getRecord(t, id);
  if (!row) return { ok: false, message: "This record no longer exists or you can't see it." };
  if (row.status === "Excused") return { ok: false, message: "Already excused." };
  const db = await recordsDb();
  const { data, error } = await db.from("report_deficiencies").update({ status: "Excused", excuse_reason: text, excused_by: user.id, excused_at: new Date().toISOString() }).eq("id", id).select("id, performance_id");
  if (error) return { ok: false, message: error.message };
  if (!data?.length) return { ok: false, message: "You don't have permission to do that." };
  // The Negative performance report that came with it no longer counts.
  const perf = (data[0] as { performance_id: number | null }).performance_id;
  if (perf && hasAdminKey()) await adminDb().from("staff_performance").update({ deleted_at: new Date().toISOString() }).eq("id", perf).is("deleted_at", null);
  revalidatePath(recordHref(t, id));
  return { ok: true };
}

/** Admin › Field day: one test SMS, so the Twilio keys and the number are proven (administrators only). */
export async function sendTestSmsAction(to: string): Promise<{ ok: true; message: string } | { ok: false; message: string }> {
  const me = await requireUser();
  if (!me.isSysadmin) return { ok: false, message: "Only an administrator can send a test SMS." };
  if (!hasAdminKey()) return { ok: false, message: "The server has no admin key." };
  if (!smsConfigured()) return { ok: false, message: "Twilio is not set up: TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN and TWILIO_FROM are needed." };
  const number = toE164(to);
  if (!number) return { ok: false, message: "That doesn't look like a mobile number." };
  const db = adminDb();
  const id = await queueSms(db, { to: number, body: "Tech Squad Reports - teste de envio. Se recebeu esta mensagem, os avisos de relatório estão funcionando.", kind: "test" });
  const r = await deliverQueuedSms(db);
  const { data } = await db.from("sms_outbox").select("status, error").eq("id", id).maybeSingle();
  const row = data as { status: string; error: string | null } | null;
  if (row?.status === "sent") return { ok: true, message: smsTestMode() ? `Sent to the test number (${process.env.SMS_TEST_RECIPIENT}) because SMS_TEST_MODE is on.` : `Sent to ${number}.` };
  return { ok: false, message: row?.error ?? `Not sent (${r.failed} failed).` };
}
