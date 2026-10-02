import { z } from "zod";

// F4 message templates (docs/portal-features-merge.md §L, SPEC §9.1 F4-d). Pure: shared by the
// admin editor, the "Message the client" panel and the tests. Stored in app_settings 'messages'.
// Messages open in the phone's own Messages / Mail app (free); nothing is sent by the server.

export const MSG_LANGS = ["en", "pt", "es"] as const;
export type MsgLang = (typeof MSG_LANGS)[number];
export const LANG_NAMES: Record<MsgLang, string> = { en: "English", pt: "Português", es: "Español" };

const Text = z.object({ subject: z.string().trim().max(200).default(""), body: z.string().trim().max(2000).default("") });
export const TemplateSchema = z.object({
  key: z.string().trim().regex(/^[a-z0-9_]{1,40}$/),
  name: z.string().trim().min(1, "Each template needs a name").max(80),
  active: z.boolean().default(true),
  texts: z.object({ en: Text, pt: Text, es: Text }),
});
// No review links (Fred 2026-10-02: clients are never sent a Google review link).
export const MessagesSchema = z.object({
  templates: z.array(TemplateSchema).max(30).default([]),
});
export type MessageTemplate = z.infer<typeof TemplateSchema>;
export type MessageSettings = z.infer<typeof MessagesSchema>;

export function parseMessages(raw: unknown): MessageSettings {
  const r = MessagesSchema.safeParse(raw ?? {});
  return r.success ? r.data : { templates: [] };
}

/** Contacts › Preferred Language (stored value) → template language. */
export function langFor(preferred: unknown): MsgLang {
  if (preferred === "Português") return "pt";
  if (preferred === "Español") return "es";
  return "en";
}

/** The words a template can use, e.g. {first_name}. */
export const TOKENS = ["first_name", "client_name", "project", "address", "sender", "visit_date", "visit_time", "plan"] as const;
export type MessageValues = Partial<Record<(typeof TOKENS)[number], string>>;

/** Fill {tokens}; an unknown or empty one becomes "" and leftover double spaces are tidied. */
export function fillTemplate(text: string, values: MessageValues): string {
  return text
    .replace(/\{(\w+)\}/g, (_, k: string) => (values as Record<string, string | undefined>)[k] ?? "")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/ ([,.!?])/g, "$1")
    .trim();
}

/** Text in the chosen language, falling back to English when that language is left blank. */
export function templateText(tpl: MessageTemplate, lang: MsgLang): { subject: string; body: string } {
  const own = tpl.texts[lang];
  return own.body ? own : tpl.texts.en;
}

/** Digits for an sms: link (keeps a leading +). */
export function phoneDigits(phone: string | null | undefined): string {
  const s = (phone ?? "").trim();
  const digits = s.replace(/\D/g, "");
  if (!digits) return "";
  return s.startsWith("+") ? `+${digits}` : digits.length === 10 ? `+1${digits}` : digits;
}

/** Opens the phone's Messages app with the text filled in (iPhone and Android both accept "?&body="). */
export function smsLink(phone: string, body: string): string {
  return `sms:${phoneDigits(phone)}?&body=${encodeURIComponent(body)}`;
}

export function mailLink(email: string, subject: string, body: string): string {
  return `mailto:${encodeURIComponent(email.trim()).replace(/%40/g, "@")}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}
