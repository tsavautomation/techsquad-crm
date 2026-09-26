// Pure helpers for reading AI answers (unit-tested).

/** Pull a valid YYYY-MM-DD out of the model's JSON answer (anything else → null). */
export function parseDate(text: string): string | null {
  const m = text.match(/"date"\s*:\s*"(\d{4})-(\d{2})-(\d{2})"/);
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null;
  if (y < 2000 || y > 2100) return null;
  return `${m[1]}-${m[2]}-${m[3]}`;
}
