import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { CurrentUser } from "@/lib/auth/session";
import { CATEGORIES, compareTasks, type Category, type Priority, type Status } from "./triage-engine";

// F28: what the /whatsapp board reads. The signed-in user's client, so RLS (the WhatsApp permission) applies.

export const WHATSAPP_PERMISSION = "whatsapp.page.view";
export const canSeeWhatsApp = (user: CurrentUser) => user.isSysadmin || user.permissions.has(WHATSAPP_PERMISSION);

/** Period choices, in days. */
export const WINDOWS = [1, 7, 14, 30, 90] as const;
export const DEFAULT_WINDOW = 7;

export type WaTask = {
  id: number;
  message_id: number;
  occurred_at: string;
  chat: string;
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
  /** The message as captured: sender and full text. */
  sender: string | null;
  body: string;
};

export type Board = {
  days: number;
  tasks: WaTask[];
  counts: Record<Category, number>;
  urgentOpen: number;
  /** Names the Assigned to list offers (active logins). */
  people: string[];
};

type Row = Omit<WaTask, "sender" | "body"> & { wa_messages: { sender: string | null; body: string } | null };

export async function loadBoard(db: SupabaseClient, days: number): Promise<Board> {
  const since = new Date(Date.now() - days * 86_400_000).toISOString();
  const [{ data }, { data: profiles }] = await Promise.all([
    db.from("wa_tasks").select("id, message_id, occurred_at, chat, customer, phone, category, priority, system, summary, details, status, assigned_to, triage, triage_error, wa_messages(sender, body)").gte("occurred_at", since).order("occurred_at", { ascending: false }).limit(500),
    db.from("profiles").select("first_name, last_name, email").eq("active", true).is("contact_id", null).order("first_name"),
  ]);
  const tasks = ((data ?? []) as unknown as Row[]).map(({ wa_messages, ...t }) => ({ ...t, sender: wa_messages?.sender ?? null, body: wa_messages?.body ?? "" })).sort(compareTasks);
  const counts = Object.fromEntries(CATEGORIES.map((c) => [c, 0])) as Record<Category, number>;
  let urgentOpen = 0;
  for (const t of tasks) {
    counts[t.category] += 1;
    if (t.priority === "urgent" && (t.status === "open" || t.status === "in_progress")) urgentOpen += 1;
  }
  const people = ((profiles ?? []) as { first_name: string | null; last_name: string | null; email: string }[]).map((p) => [p.first_name, p.last_name].filter(Boolean).join(" ") || p.email);
  for (const t of tasks) if (t.assigned_to && !people.includes(t.assigned_to)) people.push(t.assigned_to);
  return { days, tasks, counts, urgentOpen, people };
}
