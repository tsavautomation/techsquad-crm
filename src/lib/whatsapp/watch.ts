import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { notifyPush } from "@/lib/push/send";
import { agentState, type AgentState } from "./triage-engine";

// F28-e: the 5-minute cron looks at each capture PC. Down (no heartbeat for 10 minutes) or quiet (heartbeat fine
// but nothing forwarded for two hours in business hours) → one push (whatsapp_silent) to the office logins that
// take it, repeated at most every two hours while it lasts. Nothing is sent outside business hours for "quiet".

export type AgentRow = { device: string; version: string | null; started_at: string | null; last_seen_at: string | null; last_message_at: string | null; pending: number };

const REPEAT_MS = 2 * 60 * 60_000;

function ago(iso: string | null, nowMs: number): string {
  if (!iso) return "never";
  const m = Math.round((nowMs - Date.parse(iso)) / 60_000);
  return m < 60 ? `${m} min ago` : m < 48 * 60 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} days ago`;
}

export async function watchAgents(db: SupabaseClient, nowMs = Date.now()): Promise<{ checked: number; warned: string[] }> {
  const { data } = await db.from("wa_agents").select("device, version, started_at, last_seen_at, last_message_at, pending");
  const agents = (data ?? []) as AgentRow[];
  const warned: string[] = [];
  for (const a of agents) {
    const state: AgentState = agentState(a, nowMs);
    if (state !== "down" && state !== "quiet") continue;
    const { count } = await db.from("push_log").select("id", { count: "exact", head: true }).eq("kind", "whatsapp_silent").gte("created_at", new Date(nowMs - REPEAT_MS).toISOString()).not("sent_at", "is", null).ilike("body", `%${a.device}%`);
    if (count) continue;
    const message =
      state === "down"
        ? { title: "WhatsApp PC stopped", body: `No sign of the capture agent on ${a.device} since ${ago(a.last_seen_at, nowMs)}. Check that the PC is on and the agent window is running.`, url: "/whatsapp", tag: "wa-silent" }
        : { title: "WhatsApp PC is quiet", body: `${a.device} is running but forwarded no WhatsApp message for ${ago(a.last_message_at, nowMs)}. Is WhatsApp open on a chat, or notifications off?`, url: "/whatsapp", tag: "wa-silent" };
    const r = await notifyPush("whatsapp_silent", message);
    if (r.sent) warned.push(`${a.device}:${state}`);
  }
  return { checked: agents.length, warned };
}
