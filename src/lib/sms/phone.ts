// Phone numbers for SMS (F18): the Employee card's Phone Number as people type it ("(305) 555-0123",
// "305.555.0123", "+1 305 555 0123") → E.164 ("+13055550123"), or null when it can't be a mobile number.

export function toE164(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const s = raw.trim();
  const plus = s.startsWith("+");
  const digits = s.replace(/\D/g, "");
  if (plus) return digits.length >= 11 && digits.length <= 15 ? `+${digits}` : null;
  if (digits.length === 10) return /^[2-9]\d{2}[2-9]\d{6}$/.test(digits) ? `+1${digits}` : null;
  if (digits.length === 11 && digits.startsWith("1")) return /^1[2-9]\d{2}[2-9]\d{6}$/.test(digits) ? `+${digits}` : null;
  return null;
}
