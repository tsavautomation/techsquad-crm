// Pure helper for record titles (see title.ts).

/**
 * Join formula pieces, skipping empty tokens together with the separator before them.
 * "{a} – {b} – {c}" with b empty → "a – c"; "{year} {model} ({tag})" with no tag → "year model".
 */
export function joinTitleParts(parts: { text: string; token: boolean }[]): string | null {
  let out = "";
  let anyFilled = false;
  let lastTokenFilled = false;
  let pendingLiteral = "";
  for (const p of parts) {
    if (!p.token) {
      pendingLiteral += p.text;
      continue;
    }
    if (p.text) {
      // The separator before the first filled token is kept only if it opens the formula (e.g. "#{id}").
      const leading = !anyFilled && out === "" && parts.indexOf(p) === (pendingLiteral ? 1 : 0);
      out += (anyFilled || leading ? pendingLiteral : "") + p.text;
      anyFilled = true;
    }
    lastTokenFilled = Boolean(p.text);
    pendingLiteral = "";
  }
  if (lastTokenFilled) out += pendingLiteral; // closing text such as ")"
  const title = out.replace(/\s+/g, " ").trim();
  return title || null;
}
