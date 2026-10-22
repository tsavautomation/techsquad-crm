import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { aiConfigured, claude, describeError } from "@/lib/ai/claude";
import { formatDateTime } from "@/lib/dates";
import { fallbackTriage, joinsConversation, parseTriage, QUIET_MS, THREAD_LIMIT, threadPrompt, threadText, TRIAGE_SYSTEM, type ThreadMessage, type Triage } from "./triage-engine";

// F28-b: messages gather on conversations; after a quiet period Claude reads the thread and updates the card.
// Never throws: when the key is missing or the model fails, the card still shows the latest message's first
// 80 characters as an FYI (triage = fallback) and the reason is kept on the row and in automation_runs (900503).

export const TRIAGE_AUTOMATION_ID = 900503;
/** Fast and cheap: a short thread, one small JSON answer. */
export const TRIAGE_MODEL = "claude-haiku-5-5";

type MessageRow = { id: number; captured_at: string; chat: string; sender: string | null; body: string };
type ConvRow = { id: number; chat: string; project_id: number | null; event_id: number | null; started_at: string; last_message_at: string; message_count: number; ai_pending: boolean; ai_at: string | null; read_through: number | null; status: "open" | "in_progress" | "done" | "dismissed"; summary: string; customer: string | null };

const CONV_COLS = "id, chat, project_id, event_id, started_at, last_message_at, message_count, ai_pending, ai_at, read_through, status, summary, customer";

/** Ingest: puts a stored message on the chat's open conversation, or starts one. Returns the conversation id. */
export async function fileMessage(db: SupabaseClient, messageId: number): Promise<number | null> {
  const { data } = await db.from("wa_messages").select("id, captured_at, chat, sender, body, conversation_id").eq("id", messageId).maybeSingle();
  const m = data as (MessageRow & { conversation_id: number | null }) | null;
  if (!m) return null;
  if (m.conversation_id) return m.conversation_id;
  // F28-c: a muted chat makes no card; the message is kept, flagged, for when the chat is unmuted.
  const { data: muted } = await db.from("wa_muted_chats").select("chat").eq("chat", m.chat).maybeSingle();
  if (muted) {
    await db.from("wa_messages").update({ muted: true }).eq("id", m.id);
    return null;
  }
  const { data: open } = await db.from("wa_conversations").select(CONV_COLS).eq("chat", m.chat).in("status", ["open", "in_progress"]).order("last_message_at", { ascending: false }).limit(1).maybeSingle();
  let conv = open as ConvRow | null;
  if (conv && !joinsConversation(conv, Date.parse(m.captured_at))) conv = null;
  if (!conv) {
    const { data: created, error } = await db.from("wa_conversations").insert({ chat: m.chat, started_at: m.captured_at, last_message_at: m.captured_at, message_count: 0, customer: m.chat.slice(0, 120), summary: m.body.replace(/\s+/g, " ").trim().slice(0, 80) }).select(CONV_COLS).single();
    if (error || !created) return null;
    conv = created as ConvRow;
  }
  await db.from("wa_messages").update({ conversation_id: conv.id }).eq("id", m.id);
  await db
    .from("wa_conversations")
    .update({ last_message_at: m.captured_at > conv.last_message_at ? m.captured_at : conv.last_message_at, message_count: conv.message_count + 1, ai_pending: true })
    .eq("id", conv.id);
  return conv.id;
}

async function loadThread(db: SupabaseClient, convId: number): Promise<MessageRow[]> {
  const { data } = await db.from("wa_messages").select("id, captured_at, chat, sender, body").eq("conversation_id", convId).order("id", { ascending: false }).limit(THREAD_LIMIT);
  return ((data ?? []) as MessageRow[]).reverse();
}

/** Asks the model about a thread. Returns the triage or the reason it failed. */
export async function askTriage(chat: string, messages: ThreadMessage[], previous: { summary: string; readThroughIndex: number } | null): Promise<{ ok: true; triage: Triage } | { ok: false; message: string }> {
  if (!aiConfigured()) return { ok: false, message: "ANTHROPIC_API_KEY is not set" };
  const last = messages[messages.length - 1];
  try {
    const res = await claude().messages.create({ model: TRIAGE_MODEL, max_tokens: 900, system: TRIAGE_SYSTEM, messages: [{ role: "user", content: threadPrompt(chat, messages, previous) }] });
    const raw = res.content.find((b) => b.type === "text")?.text ?? "";
    const answer = parseTriage(raw, { chat, sender: last?.sender ?? null, body: last?.body ?? "" });
    return answer ? { ok: true, triage: answer } : { ok: false, message: `The AI answer could not be read (${res.stop_reason ?? "?"}): ${raw.slice(0, 300)}` };
  } catch (e) {
    return { ok: false, message: describeError(e) };
  }
}

/**
 * Reads one conversation (service role): Claude sees the thread and the earlier card; the card is updated.
 * When the new messages are a different subject, they move to a new conversation, which is read in turn.
 */
export async function readConversation(db: SupabaseClient, convId: number, depth = 0): Promise<{ ok: boolean; triage: "ai" | "fallback"; message?: string; split?: number }> {
  const { data } = await db.from("wa_conversations").select(CONV_COLS).eq("id", convId).maybeSingle();
  const conv = data as ConvRow | null;
  if (!conv) return { ok: false, triage: "fallback", message: "conversation not found" };
  const thread = await loadThread(db, convId);
  if (!thread.length) {
    await db.from("wa_conversations").update({ ai_pending: false }).eq("id", convId);
    return { ok: true, triage: "fallback", message: "no messages" };
  }
  const newest = thread[thread.length - 1];
  if (conv.read_through && newest.id <= conv.read_through) {
    await db.from("wa_conversations").update({ ai_pending: false }).eq("id", convId);
    return { ok: true, triage: "ai", message: "nothing new" };
  }
  const readIdx = conv.read_through ? thread.findIndex((m) => m.id > conv.read_through!) : 0;
  const previous = conv.ai_at && readIdx > 0 ? { summary: conv.summary, readThroughIndex: readIdx } : null;
  const msgs: ThreadMessage[] = thread.map((m) => ({ at: formatDateTime(m.captured_at), sender: m.sender, body: m.body }));
  const r = await askTriage(conv.chat, msgs, previous);

  // A new subject in the same chat: the unread messages start their own card.
  if (r.ok && previous && !r.triage.continues_previous && depth < 1) {
    const moved = thread.slice(readIdx);
    const { data: created } = await db.from("wa_conversations").insert({ chat: conv.chat, started_at: moved[0].captured_at, last_message_at: moved[moved.length - 1].captured_at, message_count: moved.length, customer: conv.customer, summary: moved[moved.length - 1].body.slice(0, 80) }).select("id").single();
    const newId = (created as { id: number } | null)?.id;
    if (newId) {
      await db.from("wa_messages").update({ conversation_id: newId }).in("id", moved.map((m) => m.id));
      await db.from("wa_conversations").update({ ai_pending: false, message_count: Math.max(0, conv.message_count - moved.length), last_message_at: thread[readIdx - 1].captured_at }).eq("id", convId);
      await db.from("automation_runs").insert({ automation_id: TRIAGE_AUTOMATION_ID, table_name: "wa_conversations", record_id: convId, event: "ai_split", status: "done", detail: { new_conversation: newId, moved: moved.length } });
      const inner = await readConversation(db, newId, depth + 1);
      return { ...inner, split: newId };
    }
  }

  const t = r.ok ? r.triage : fallbackTriage({ chat: conv.chat, sender: newest.sender, body: newest.body });
  const { continues_previous: _cp, ...fields } = t;
  void _cp;
  const { error } = await db
    .from("wa_conversations")
    .update({ ...fields, ai_pending: false, ai_at: new Date().toISOString(), read_through: newest.id, triage: r.ok ? "ai" : "fallback", triage_error: r.ok ? null : r.message })
    .eq("id", convId);
  await db.from("automation_runs").insert({ automation_id: TRIAGE_AUTOMATION_ID, table_name: "wa_conversations", record_id: convId, event: "ai_read", status: r.ok && !error ? "done" : "error", detail: r.ok ? { category: t.category, priority: t.priority, messages: thread.length, ...(error ? { write_error: error.message } : {}) } : { fallback: true, reason: r.message } });
  if (conv.project_id) await syncProjectEvent(db, convId).catch(() => undefined);
  if (error) return { ok: false, triage: "fallback", message: error.message };
  return r.ok ? { ok: true, triage: "ai" } : { ok: true, triage: "fallback", message: r.message };
}

/** Reads every conversation that has been quiet for QUIET_MS (the ingest's delayed step and the 5-minute cron). */
export async function readPending(db: SupabaseClient, limit = 10, nowMs = Date.now()): Promise<number> {
  const before = new Date(nowMs - QUIET_MS).toISOString();
  const { data } = await db.from("wa_conversations").select("id").eq("ai_pending", true).lte("last_message_at", before).order("last_message_at").limit(limit);
  const ids = ((data ?? []) as { id: number }[]).map((r) => r.id);
  for (const id of ids) await readConversation(db, id).catch((e) => console.error("whatsapp read failed:", id, e));
  return ids.length;
}

/** Messages that never joined a conversation (the request died after the insert). */
export async function fileMissing(db: SupabaseClient, limit = 20): Promise<number> {
  const { data } = await db.from("wa_messages").select("id").is("conversation_id", null).eq("muted", false).order("id").limit(limit);
  const ids = ((data ?? []) as { id: number }[]).map((r) => r.id);
  for (const id of ids) await fileMessage(db, id);
  return ids.length;
}

/**
 * The project timeline event that mirrors a conversation (service role): created when the card is assigned to a
 * project, moved when it is reassigned, rewritten after each reading, removed when the card leaves the project.
 */
export async function syncProjectEvent(db: SupabaseClient, convId: number, userId: string | null = null): Promise<void> {
  const { data } = await db.from("wa_conversations").select(CONV_COLS).eq("id", convId).maybeSingle();
  const conv = data as ConvRow | null;
  if (!conv) return;
  if (!conv.project_id) {
    if (conv.event_id) await db.from("project_events").update({ deleted_at: new Date().toISOString() }).eq("id", conv.event_id);
    return;
  }
  const thread = await loadThread(db, convId);
  const body = threadText(conv.chat, thread.map((m) => ({ at: m.captured_at, sender: m.sender, body: m.body })), formatDateTime);
  const fields = { project_id: conv.project_id, occurred_at: conv.started_at, actor: conv.customer ?? conv.chat, title: `WhatsApp: ${conv.summary || conv.chat}`, body, deleted_at: null };
  if (conv.event_id) {
    await db.from("project_events").update(fields).eq("id", conv.event_id);
    return;
  }
  const { data: ev } = await db.from("project_events").insert({ ...fields, channel: "whatsapp", source_table: "wa_conversations", source_id: conv.id, source_ref: `wa:${conv.id}`, attachments: [], created_by: userId }).select("id").single();
  const eventId = (ev as { id: number } | null)?.id;
  if (eventId) await db.from("wa_conversations").update({ event_id: eventId }).eq("id", convId);
}
