// Tagging people in notes: "@First Last" in the text. Pure helpers shared by the note box and the server.

export type Mentionable = { id: string; name: string };

/** The people whose "@Name" still appears in the text (they may have been picked, then deleted from the text). */
export function mentionedIn(body: string, people: Mentionable[]): string[] {
  const names = new Set(splitMentions(body, people.map((p) => p.name)).filter((p) => p.tag).map((p) => p.text.slice(1).toLowerCase()));
  return [...new Set(people.filter((p) => names.has(p.name.trim().toLowerCase())).map((p) => p.id))];
}

/** The "@word" being typed just before the cursor, if any: what to suggest names for. */
export function mentionQuery(body: string, cursor: number): { start: number; query: string } | null {
  const before = body.slice(0, cursor);
  const m = /(^|\s)@([\p{L}'-]*(?: [\p{L}'-]*)?)$/u.exec(before);
  if (!m) return null;
  return { start: before.length - m[2].length - 1, query: m[2] };
}

/** Split note text into plain and "@Name" parts so tags can be highlighted. */
export function splitMentions(body: string, names: string[]): { text: string; tag: boolean }[] {
  const list = [...new Set(names.map((n) => n.trim()).filter(Boolean))].sort((a, b) => b.length - a.length);
  if (!list.length) return [{ text: body, tag: false }];
  const esc = list.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  // Longest names first, and never inside a longer word ("@Luca" is not a tag in "@Lucas").
  const re = new RegExp(`@(?:${esc.join("|")})(?![\\p{L}\\p{N}])`, "giu");
  const out: { text: string; tag: boolean }[] = [];
  let last = 0;
  for (const m of body.matchAll(re)) {
    if (m.index > last) out.push({ text: body.slice(last, m.index), tag: false });
    out.push({ text: m[0], tag: true });
    last = m.index + m[0].length;
  }
  if (last < body.length) out.push({ text: body.slice(last), tag: false });
  return out;
}
