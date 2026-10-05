/** "Carlos Gurgel" → "CG", "Kleider Loregian Junior" → "KJ", "Anderson" → "AN"; null when there is no name. */
export function initialsOf(name: string | null | undefined): string | null {
  const words = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (!words.length) return null;
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[words.length - 1][0]).toUpperCase();
}
