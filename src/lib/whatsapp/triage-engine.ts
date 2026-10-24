import { z } from "zod";

// F28 WhatsApp Monitor (SPEC §9.1 F28-a / F28-b): the pure part of the triage. The capture PC forwards each
// WhatsApp notification; messages of one chat gather on a conversation; after a quiet period Claude reads the
// thread and the board shows one card per conversation. This file holds the prompts, the reading of the answer,
// the grouping rules and the colour rule, so tests cover them without a model or a database.

export const CATEGORIES = ["service_call", "follow_up", "quote", "scheduling", "fyi"] as const;
export const PRIORITIES = ["urgent", "normal", "low"] as const;
export const STATUSES = ["open", "in_progress", "done", "dismissed"] as const;
export type Category = (typeof CATEGORIES)[number];
export type Priority = (typeof PRIORITIES)[number];
export type Status = (typeof STATUSES)[number];

/** English column titles (the screens translate them). */
export const CATEGORY_LABEL: Record<Category, string> = { service_call: "Service Calls", follow_up: "Follow-ups", quote: "Quotes", scheduling: "Scheduling", fyi: "FYI" };
export const CATEGORY_ICON: Record<Category, string> = { service_call: "🔧", follow_up: "📌", quote: "💰", scheduling: "📅", fyi: "ℹ️" };
export const STATUS_LABEL: Record<Status, string> = { open: "Open", in_progress: "In progress", done: "Done", dismissed: "Dismissed" };
export const PRIORITY_LABEL: Record<Priority, string> = { urgent: "Urgent", normal: "Normal", low: "Low" };

/** A new message joins the chat's open card unless the chat has been silent this long (then a new card starts). */
export const CONVERSATION_IDLE_MS = 24 * 60 * 60_000;
/** Claude reads a conversation once no message has arrived for this long. */
export const QUIET_MS = 2 * 60_000;
/** How much of the thread the model sees. */
export const THREAD_LIMIT = 25;

export const TRIAGE_SYSTEM = `You triage incoming WhatsApp conversations for a technology/AV service company (Crestron, networking, audio-video, smart home). You see the messages received so far in one chat, oldest first (the office's own replies are not captured). Return ONLY a JSON object with: category ("service_call"|"follow_up"|"quote"|"scheduling"|"fyi"), priority ("urgent"|"normal"|"low"), customer, phone (or null), system (or null), summary (one scannable sentence about the whole conversation), details (the concrete problem/request), continues_previous (true when the newest messages are about the same subject as the earlier card described; false when they start a different subject). Rules: fix/repair/"not working"/"frozen"/"service call" => service_call. "ASAP"/"emergency"/"down"/"urgent" => priority urgent. Greetings, thanks, confirmations and small talk with no action => fyi/low; a greeting followed by a request is the request. The summary names who asked and what they want, in one sentence, written in the language of the messages: Portuguese messages get a Portuguese summary and details, English stay English, Spanish stay Spanish; never translate. customer is the person or company the conversation is about (the chat name when nothing better). Never put passwords, door or gate codes or Wi-Fi keys in summary or details.`;

export type ThreadMessage = { at: string; sender: string | null; body: string };
export type Incoming = { chat: string; sender: string | null; body: string };

/** The user turn: the chat, the earlier card when there is one, then the thread. */
export function threadPrompt(chat: string, messages: ThreadMessage[], previous: { summary: string; readThroughIndex: number } | null): string {
  const lines = messages.map((m, i) => `${i + 1}. [${m.at}] ${m.sender ?? chat}: ${m.body.replace(/\s+/g, " ").trim()}`);
  const head = previous ? `Earlier card for this chat (messages 1-${previous.readThroughIndex}): ${previous.summary}\nNew messages start at ${previous.readThroughIndex + 1}.` : "No earlier card.";
  return `Chat: ${chat}\n${head}\nMessages:\n${lines.join("\n")}`;
}

export type Triage = { category: Category; priority: Priority; customer: string | null; phone: string | null; system: string | null; summary: string; details: string | null; continues_previous: boolean };

/** A text field the model may fill with anything: strings and numbers as they are, objects and lists flattened, blanks as null. */
const text = (max: number) =>
  z.unknown().optional().transform((v) => {
    if (v == null) return null;
    const s = typeof v === "string" || typeof v === "number" ? String(v) : Array.isArray(v) ? v.map((x) => (typeof x === "object" ? JSON.stringify(x) : String(x))).join("; ") : JSON.stringify(v);
    return s.replace(/\s+/g, " ").trim().slice(0, max) || null;
  });

/** Cuts a long text at the last space before `max`, with an ellipsis, so nothing ends mid-word ("and wirin"). */
export function cutAtWord(s: string, max: number): string {
  if (s.length <= max) return s;
  const cut = s.slice(0, max - 1);
  const sp = cut.lastIndexOf(" ");
  return `${sp > max * 0.6 ? cut.slice(0, sp) : cut}…`;
}

const AnswerSchema = z.object({
  category: z.enum(CATEGORIES).catch("fyi"),
  priority: z.enum(PRIORITIES).catch("normal"),
  customer: text(120),
  phone: text(40),
  system: text(80),
  summary: text(300),
  details: text(1200),
  continues_previous: z
    .unknown()
    .optional()
    .transform((v) => (typeof v === "boolean" ? v : typeof v === "string" ? !/^(false|no|0)$/i.test(v.trim()) : true)),
});

/** Reads Claude's answer: a JSON object, with or without a code fence or chatter around it. Null when unreadable. */
export function parseTriage(raw: string, m: Incoming): Triage | null {
  const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned.slice(start, end + 1));
  } catch {
    return null;
  }
  const r = AnswerSchema.safeParse(parsed);
  if (!r.success) return null;
  const a = r.data;
  return {
    category: a.category,
    priority: a.priority,
    customer: a.customer ?? m.chat.slice(0, 120),
    phone: cleanPhone(a.phone),
    system: a.system,
    summary: a.summary ?? fallbackSummary(m.body),
    details: a.details,
    continues_previous: a.continues_previous,
  };
}

/** Keeps a phone the model found only when it looks like one (7 to 15 digits). */
export function cleanPhone(p: string | null): string | null {
  if (!p) return null;
  const digits = p.replace(/\D/g, "");
  return digits.length >= 7 && digits.length <= 15 ? p.trim() : null;
}

/** What tel: gets: digits only, with the US country code added to a bare 10-digit number. */
export function telHref(p: string): string {
  const digits = p.replace(/\D/g, "");
  const prefix = p.trim().startsWith("+") ? "+" : digits.length === 10 ? "+1" : "";
  return `tel:${prefix}${digits}`;
}

export const fallbackSummary = (body: string) => body.replace(/\s+/g, " ").trim().slice(0, 80);

/** When the AI is off or failed: the conversation still reaches the board as an FYI with its latest 80 characters. */
export function fallbackTriage(m: Incoming): Triage {
  return { category: "fyi", priority: "normal", customer: m.chat.slice(0, 120), phone: null, system: null, summary: fallbackSummary(m.body), details: null, continues_previous: true };
}

/** A message joins the chat's open card when the card is still being worked and the chat was active within a day. */
export function joinsConversation(conv: { status: Status; last_message_at: string }, atMs: number): boolean {
  if (conv.status === "done" || conv.status === "dismissed") return false;
  return atMs - Date.parse(conv.last_message_at) < CONVERSATION_IDLE_MS;
}

/** Ready for Claude: something new since the last reading and no message for QUIET_MS. */
export function readyToRead(conv: { ai_pending: boolean; last_message_at: string }, nowMs: number): boolean {
  return conv.ai_pending && nowMs - Date.parse(conv.last_message_at) >= QUIET_MS;
}

export type Tone = "bad" | "warn" | "ok" | "muted";

/**
 * Fred 2026-10-21: red when urgent, yellow when something is needed from us, green when nothing is.
 * Finished cards (done / dismissed) go grey.
 */
export function tone(t: { category: Category; priority: Priority; status: Status }): Tone {
  if (t.status === "done" || t.status === "dismissed") return "muted";
  if (t.priority === "urgent") return "bad";
  if (t.category === "fyi") return "ok";
  return "warn";
}

/** Board order: urgent first, then normal, then low; most recent activity first inside each. */
export function compareCards<T extends { priority: Priority; last_message_at: string }>(a: T, b: T): number {
  const p = PRIORITIES.indexOf(a.priority) - PRIORITIES.indexOf(b.priority);
  return p !== 0 ? p : b.last_message_at.localeCompare(a.last_message_at);
}

/** The thread as plain text for the project timeline event (newest last). */
export function threadText(chat: string, messages: ThreadMessage[], formatAt: (iso: string) => string): string {
  return messages.map((m) => `${formatAt(m.at)} · ${m.sender ?? chat}: ${m.body.trim()}`).join("\n");
}

export type IgnoreRule = { chat: string | null; kind: "contains" | "regex"; pattern: string };

const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ‎‏]/g, "").toLowerCase().trim();

/** F28-d: a message makes no card when a rule for its chat (or for every chat) matches its text. */
export function ignoredByRule(chat: string, body: string, rules: IgnoreRule[]): IgnoreRule | null {
  const c = fold(chat);
  const text = fold(body);
  for (const r of rules) {
    if (r.chat && fold(r.chat) !== c) continue;
    if (r.kind === "contains") {
      if (text.includes(fold(r.pattern))) return r;
    } else {
      try {
        // Postgres word boundaries (\m \M, as the seeded rule is written) become JavaScript's \b.
        if (new RegExp(r.pattern.replace(/\\m|\\M/g, "\\b"), "iu").test(text)) return r;
      } catch {
        // a bad pattern ignores nothing
      }
    }
  }
  return null;
}

// ---------------------------------------------------------------- F28-e: is the capture PC alive?

/** No heartbeat for this long = the agent is down (it beats every minute). */
export const AGENT_DOWN_MS = 10 * 60_000;
/** Heartbeat fine but nothing forwarded for this long in business hours = probably not capturing. */
export const AGENT_QUIET_MS = 2 * 60 * 60_000;

/** "legacy": the PC still runs agent v1, which sends no heartbeat; only its messages are known. */
export type AgentState = "ok" | "down" | "quiet" | "unknown" | "legacy";

/** Monday to Saturday, 7 AM to 7 PM Eastern: when silence means something. */
export function businessHoursET(nowMs: number): boolean {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", weekday: "short", hour: "numeric", hour12: false }).formatToParts(new Date(nowMs));
  const wd = parts.find((p) => p.type === "weekday")?.value ?? "";
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? "0") % 24;
  return wd !== "Sun" && hour >= 7 && hour < 19;
}

export function agentState(a: { version?: string | null; last_seen_at: string | null; last_message_at: string | null }, nowMs: number): AgentState {
  if (!a.last_seen_at) return "unknown";
  if (!a.version) return "legacy";
  if (nowMs - Date.parse(a.last_seen_at) > AGENT_DOWN_MS) return "down";
  if (businessHoursET(nowMs) && (!a.last_message_at || nowMs - Date.parse(a.last_message_at) > AGENT_QUIET_MS)) return "quiet";
  return "ok";
}
