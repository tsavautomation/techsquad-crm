// F31 Texts by email (Fred 2026-10-22): RingCentral emails the office each text message it receives
// ("New Text Message from …"); a cPanel filter sends those emails on to the CRM mailbox. Here one such email
// is read into the same shape as a WhatsApp notification, so the text joins the WhatsApp Monitor board: one
// card per conversation, language kept, ignore and mute rules. Pure; tests/f31-sms.test.ts.
import { normalizeText } from "./engine";

export const RINGCENTRAL_SENDER = /@(?:ringcentral\.com|rc\.com)$/i;
const SUBJECT = /new\s+text\s+message\s+from\s+(.+?)\s*$/i;

/** Lines of RingCentral's template that are not the text itself. */
const BOILERPLATE = [
  /ringcentral/i,
  /new (?:text|sms) message/i,
  /^\s*(?:from|to|received|sent|date|time|phone number|extension|line)\s*:/i,
  /\breply\b.*\b(?:app|link|click|here)\b/i,
  /^\s*(?:https?:\/\/|www\.)/i,
  /unsubscribe|automatically generated|do not reply|notification settings|manage (?:your )?notifications|this is an automated/i,
  /^\s*(?:dear|hi|hello)\b.*,\s*$/i,
  /^\s*(?:thank you|thanks),?\s*$/i,
  /^\s*[-=_*]{3,}\s*$/,
];

export type ParsedSms = { phone: string | null; sender: string; body: string };

/** The digits of a phone number, with a leading 1 dropped for US numbers: "+1 (954) 856-6166" → "9548566166". */
export function phoneDigits(s: string | null | undefined): string | null {
  const d = (s ?? "").replace(/\D/g, "");
  if (d.length < 7) return null;
  return d.length === 11 && d.startsWith("1") ? d.slice(1) : d;
}

/** "(954) 856-6166" for a 10-digit US number, else the digits as they are. */
export function formatPhone(digits: string): string {
  return /^\d{10}$/.test(digits) ? `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}` : digits;
}

export const isRingCentralText = (fromEmail: string | null | undefined, subject: string | null | undefined) => RINGCENTRAL_SENDER.test((fromEmail ?? "").trim()) && SUBJECT.test(subject ?? "");

/**
 * The text and who sent it, out of RingCentral's notification email. The sender comes from the subject ("from
 * (954) 856-6166" or "from John Doe"); the text from a "Message:" line when there is one, otherwise from the
 * lines that are not template. Null when nothing readable is left.
 */
export function parseRingCentralText(mail: { subject: string | null | undefined; text: string | null | undefined }): ParsedSms | null {
  const m = (mail.subject ?? "").match(SUBJECT);
  if (!m) return null;
  const sender = m[1].replace(/\s+(?:at|on|-)\s+[\d/:\sAPMapm,]+$/, "").trim();
  const text = (mail.text ?? "").replace(/\r\n/g, "\n");
  let phone = phoneDigits(sender);
  if (!phone) {
    const fromLine = text.match(/^\s*from\s*:\s*(.+)$/im);
    phone = phoneDigits(fromLine?.[1]);
  }
  let body = "";
  const labelled = text.match(/(?:^|\n)[ \t]*(?:message|text message|text|mensagem|msg)[ \t]*:[ \t]*\n?([\s\S]+?)(?:\n[ \t]*\n|$)/i);
  if (labelled && normalizeText(labelled[1])) body = labelled[1].trim();
  else {
    body = text
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l && !BOILERPLATE.some((re) => re.test(l)) && !/^new text message from/i.test(l))
      .join("\n")
      .trim();
  }
  body = body.replace(/\n{3,}/g, "\n\n").slice(0, 4000);
  if (!body) return null;
  return { phone, sender, body };
}
