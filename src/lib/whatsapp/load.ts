import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { CurrentUser } from "@/lib/auth/session";
import { CATEGORIES, compareCards, type Category, type Priority, type Status } from "./triage-engine";

// F28: what the /whatsapp board reads. The signed-in user's client, so RLS (the WhatsApp permission) applies.

export const WHATSAPP_PERMISSION = "whatsapp.page.view";
export const canSeeWhatsApp = (user: CurrentUser) => user.isSysadmin || user.permissions.has(WHATSAPP_PERMISSION);

/** Period choices, in days. */
export const WINDOWS = [1, 7, 14, 30, 90] as const;
export const DEFAULT_WINDOW = 7;

export type WaMessage = { id: number; captured_at: string; sender: string | null; body: string };

export type WaCard = {
  id: number;
  chat: string;
  project_id: number | null;
  project_title: string | null;
  started_at: string;
  last_message_at: string;
  message_count: number;
  ai_pending: boolean;
  customer: string | null;
  phone: string | null;
  category: Category;
  priority: Priority;
  system: string | null;
  summary: string;
  details: string | null;
  status: Status;
  assigned_to: string | null;
  triage: "ai" | "fallback";
  triage_error: string | null;
  /** The thread as captured, oldest first. */
  messages: WaMessage[];
};

export type Board = {
  days: number;
  finished: boolean;
  cards: WaCard[];
  counts: Record<Category, number>;
  urgentOpen: number;
  /** Names the Assigned to list offers (active logins). */
  people: string[];
};

type Row = Omit<WaCard, "messages" | "project_title">;

/** F28-c: finished cards (done / dismissed) leave the board; "Show finished" brings them back for the period. */
export async function loadBoard(db: SupabaseClient, days: number, finished = false): Promise<Board> {
  const since = new Date(Date.now() - days * 86_400_000).toISOString();
  const [{ data }, { data: profiles }] = await Promise.all([
    db.from("wa_conversations").select("id, chat, project_id, started_at, last_message_at, message_count, ai_pending, customer, phone, category, priority, system, summary, details, status, assigned_to, triage, triage_error").gte("last_message_at", since).in("status", finished ? ["done", "dismissed"] : ["open", "in_progress"]).order("last_message_at", { ascending: false }).limit(300),
    db.from("profiles").select("first_name, last_name, email").eq("active", true).is("contact_id", null).order("first_name"),
  ]);
  const rows = (data ?? []) as Row[];
  const ids = rows.map((r) => r.id);
  const projectIds = [...new Set(rows.map((r) => r.project_id).filter((x): x is number => x !== null))];
  const [{ data: msgs }, { data: projects }] = await Promise.all([
    ids.length ? db.from("wa_messages").select("id, conversation_id, captured_at, sender, body").in("conversation_id", ids).order("id") : Promise.resolve({ data: [] as unknown[] }),
    projectIds.length ? db.from("projects").select("id, title").in("id", projectIds) : Promise.resolve({ data: [] as unknown[] }),
  ]);
  const byConv = new Map<number, WaMessage[]>();
  for (const m of (msgs ?? []) as (WaMessage & { conversation_id: number })[]) {
    const list = byConv.get(m.conversation_id) ?? [];
    list.push({ id: m.id, captured_at: m.captured_at, sender: m.sender, body: m.body });
    byConv.set(m.conversation_id, list);
  }
  const titles = new Map(((projects ?? []) as { id: number; title: string | null }[]).map((p) => [p.id, p.title]));
  const cards: WaCard[] = rows.map((r) => ({ ...r, project_title: r.project_id ? (titles.get(r.project_id) ?? null) : null, messages: byConv.get(r.id) ?? [] })).sort(compareCards);
  const counts = Object.fromEntries(CATEGORIES.map((c) => [c, 0])) as Record<Category, number>;
  let urgentOpen = 0;
  for (const c of cards) {
    counts[c.category] += 1;
    if (c.priority === "urgent" && (c.status === "open" || c.status === "in_progress")) urgentOpen += 1;
  }
  const people = ((profiles ?? []) as { first_name: string | null; last_name: string | null; email: string }[]).map((p) => [p.first_name, p.last_name].filter(Boolean).join(" ") || p.email);
  for (const c of cards) if (c.assigned_to && !people.includes(c.assigned_to)) people.push(c.assigned_to);
  return { days, finished, cards, counts, urgentOpen, people };
}

export type MutedChat = { chat: string; muted_at: string; muted_by_name: string | null };

/** F28-c: the chats whose messages make no cards. */
export async function loadMuted(db: SupabaseClient): Promise<MutedChat[]> {
  const { data } = await db.from("wa_muted_chats").select("chat, muted_at, muted_by").order("chat");
  const rows = (data ?? []) as { chat: string; muted_at: string; muted_by: string | null }[];
  const ids = [...new Set(rows.map((r) => r.muted_by).filter((x): x is string => Boolean(x)))];
  const { data: profiles } = ids.length ? await db.from("profiles").select("id, first_name, last_name, email").in("id", ids) : { data: [] };
  const names = new Map(((profiles ?? []) as { id: string; first_name: string | null; last_name: string | null; email: string }[]).map((p) => [p.id, [p.first_name, p.last_name].filter(Boolean).join(" ") || p.email]));
  return rows.map((r) => ({ chat: r.chat, muted_at: r.muted_at, muted_by_name: r.muted_by ? (names.get(r.muted_by) ?? null) : null }));
}

export const mutedCount = async (db: SupabaseClient): Promise<number> => (await db.from("wa_muted_chats").select("chat", { count: "exact", head: true })).count ?? 0;

export type IgnoreRuleRow = { id: number; chat: string | null; kind: "contains" | "regex"; pattern: string; note: string | null; created_at: string };

/** F28-d: the ignore rules, for the settings list. */
export async function loadIgnoreRules(db: SupabaseClient): Promise<IgnoreRuleRow[]> {
  const { data } = await db.from("wa_ignore_rules").select("id, chat, kind, pattern, note, created_at").order("chat").order("id");
  return (data ?? []) as IgnoreRuleRow[];
}
