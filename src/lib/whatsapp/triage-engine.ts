import { z } from "zod";

// F28 WhatsApp Monitor (SPEC §9.1 F28-a): the pure part of the triage. The capture PC forwards each WhatsApp
// notification; Claude reads it and the board shows one card per message. This file holds the prompt, the
// reading of the answer and the colour rule, so tests cover them without a model or a database.

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

export const TRIAGE_SYSTEM = `You triage incoming WhatsApp messages for a technology/AV service company (Crestron, networking, audio-video, smart home). For each message return ONLY a JSON object with: category ("service_call"|"follow_up"|"quote"|"scheduling"|"fyi"), priority ("urgent"|"normal"|"low"), customer, phone (or null), system (or null), summary (one scannable sentence), details (the concrete problem/request). Rules: fix/repair/"not working"/"frozen"/"service call" => service_call. "ASAP"/"emergency"/"down"/"urgent" => priority urgent. Pleasantries/confirmations with no action => fyi/low. The summary names who asked and what they want, in English, in one sentence, even when the message is in Portuguese or Spanish. customer is the person or company the message is about (the chat name when nothing better). Never put passwords, door or gate codes or Wi-Fi keys in summary or details.`;

export type Incoming = { chat: string; sender: string | null; body: string };

export const triagePrompt = (m: Incoming) => `Chat: ${m.chat}\nSender: ${m.sender ?? m.chat}\nMessage: ${m.body}`;

export type Triage = { category: Category; priority: Priority; customer: string | null; phone: string | null; system: string | null; summary: string; details: string | null };

const text = (max: number) =>
  z
    .union([z.string(), z.number()])
    .nullish()
    .transform((v) => (v == null ? null : String(v).replace(/\s+/g, " ").trim().slice(0, max) || null));

const AnswerSchema = z.object({
  category: z.enum(CATEGORIES).catch("fyi"),
  priority: z.enum(PRIORITIES).catch("normal"),
  customer: text(120),
  phone: text(40),
  system: text(80),
  summary: text(200),
  details: text(1000),
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

/** When the AI is off or failed: the message still reaches the board as an FYI with its first 80 characters. */
export function fallbackTriage(m: Incoming): Triage {
  return { category: "fyi", priority: "normal", customer: m.chat.slice(0, 120), phone: null, system: null, summary: fallbackSummary(m.body), details: null };
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

/** Board order: urgent first, then normal, then low; newest first inside each. */
export function compareTasks<T extends { priority: Priority; occurred_at: string }>(a: T, b: T): number {
  const p = PRIORITIES.indexOf(a.priority) - PRIORITIES.indexOf(b.priority);
  return p !== 0 ? p : b.occurred_at.localeCompare(a.occurred_at);
}
