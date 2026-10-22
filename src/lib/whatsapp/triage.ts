import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { aiConfigured, claude, describeError } from "@/lib/ai/claude";
import { fallbackTriage, parseTriage, TRIAGE_SYSTEM, triagePrompt, type Incoming, type Triage } from "./triage-engine";

// F28: reads one forwarded WhatsApp message with Claude and files the card. Never throws: when the key is
// missing or the model fails, the card still appears as an FYI with the first 80 characters (triage = fallback)
// and the reason is kept on the row and in automation_runs under 900503.

export const TRIAGE_AUTOMATION_ID = 900503;
/** Fast and cheap: one short message, one small JSON answer. */
export const TRIAGE_MODEL = "claude-haiku-5-5";

type MessageRow = { id: number; captured_at: string; chat: string; sender: string | null; body: string };

/** Asks the model. Returns the triage or the reason it failed. */
export async function askTriage(m: Incoming): Promise<{ ok: true; triage: Triage } | { ok: false; message: string }> {
  if (!aiConfigured()) return { ok: false, message: "ANTHROPIC_API_KEY is not set" };
  try {
    const res = await claude().messages.create({ model: TRIAGE_MODEL, max_tokens: 500, system: TRIAGE_SYSTEM, messages: [{ role: "user", content: triagePrompt(m) }] });
    const answer = parseTriage(res.content.find((b) => b.type === "text")?.text ?? "", m);
    return answer ? { ok: true, triage: answer } : { ok: false, message: "The AI answer could not be read" };
  } catch (e) {
    return { ok: false, message: describeError(e) };
  }
}

/** Files the card for one message (service role). A message that already has a card is left alone. */
export async function triageMessage(db: SupabaseClient, messageId: number): Promise<{ ok: boolean; triage: "ai" | "fallback"; message?: string }> {
  const { data } = await db.from("wa_messages").select("id, captured_at, chat, sender, body").eq("id", messageId).maybeSingle();
  const m = data as MessageRow | null;
  if (!m) return { ok: false, triage: "fallback", message: "message not found" };
  const { data: existing } = await db.from("wa_tasks").select("id").eq("message_id", messageId).maybeSingle();
  if (existing) return { ok: true, triage: "ai", message: "already filed" };

  const r = await askTriage(m);
  const t = r.ok ? r.triage : fallbackTriage(m);
  const row = { message_id: m.id, occurred_at: m.captured_at, chat: m.chat, ...t, triage: r.ok ? "ai" : "fallback", triage_error: r.ok ? null : r.message };
  const { error } = await db.from("wa_tasks").upsert(row, { onConflict: "message_id", ignoreDuplicates: true });
  const detail = r.ok ? { category: t.category, priority: t.priority, ...(error ? { write_error: error.message } : {}) } : { fallback: true, reason: r.message };
  await db.from("automation_runs").insert({ automation_id: TRIAGE_AUTOMATION_ID, table_name: "wa_messages", record_id: m.id, event: "ai_triage", status: r.ok && !error ? "done" : "error", detail });
  if (error) return { ok: false, triage: "fallback", message: error.message };
  return r.ok ? { ok: true, triage: "ai" } : { ok: true, triage: "fallback", message: r.message };
}

/** Messages that never got a card (the request died after the insert): filed on the next ingest, a few at a time. */
export async function triageMissing(db: SupabaseClient, limit = 5): Promise<number> {
  const { data: filed } = await db.from("wa_tasks").select("message_id").order("message_id", { ascending: false }).limit(500);
  const done = new Set(((filed ?? []) as { message_id: number }[]).map((r) => r.message_id));
  const since = new Date(Date.now() - 2 * 60_000).toISOString();
  const { data } = await db.from("wa_messages").select("id").lt("created_at", since).order("id", { ascending: false }).limit(200);
  const missing = ((data ?? []) as { id: number }[]).map((r) => r.id).filter((id) => !done.has(id)).slice(0, limit);
  for (const id of missing) await triageMessage(db, id);
  return missing.length;
}
