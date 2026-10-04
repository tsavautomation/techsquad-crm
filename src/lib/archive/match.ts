import { norm, scoreProjects, type CatProject, type ProjectScore } from "@/lib/google/match";
import type { ParsedFolder, ParsedName } from "./parse";

// F16 Report archive: which project a file belongs to, from its client folder and its name.
// The same scoring as the calendar import, which reads a title as "Technician – Client – Place" and
// drops the first segment. The archive has no technician in front, so a placeholder goes there and the
// client stays in the part that is scored.

/** "Acta I" and "ACTA 1" are the same job: roman numerals become digits before scoring. */
const ROMAN: Record<string, string> = { i: "1", ii: "2", iii: "3", iv: "4", v: "5", vi: "6" };
const arabic = (s: string) => s.replace(/\b(i{1,3}|iv|vi?)\b/gi, (m) => ROMAN[m.toLowerCase()] ?? m);
/** A single digit after a word ("Acta 1") would be dropped as a one-letter token: "n1" keeps it, so Acta I and Acta II stay apart. */
const digits = (s: string) => s.replace(/\b([a-z]{2,}) (\d)\b/gi, "$1 n$2");
/** Place names written two ways. */
const ALIASES: [RegExp, string][] = [[/\bNYC\b/gi, "New York"]];
const aliases = (s: string) => ALIASES.reduce((t, [re, to]) => t.replace(re, to), s);
export const comparable = (s: string) => digits(arabic(aliases(s)));

const firstNumber = (s: string | null | undefined) => norm(s).match(/(^| )(\d{1,6})( |$)/)?.[2] ?? null;

export type ArchiveCandidate = { id: number; score: number };

/** All projects that score, best first. */
export function scoreArchiveFile(folder: ParsedFolder, name: ParsedName, projects: CatProject[]): ProjectScore[] {
  // The folder as written ("CAPOTE, JUAN - MIAMI SPRINGS") too, since projects keep the "Last, First" order.
  const asWritten = folder.raw.replace(/\s[-–]\s*\d{4,6}$/, "");
  const summary = comparable(["Archive", folder.client, asWritten, folder.place, name.job].filter(Boolean).join(" – "));
  const location = comparable([folder.place, folder.unit ? `#${folder.unit}` : null].filter(Boolean).join(" "));
  const scores = scoreProjects({ id: folder.raw, summary, location }, projects.map((p) => ({ ...p, title: comparable(p.title) })), name.technicians);
  // "MARINA PALMS #310" is not at 310 Tacoma Ln: a unit number never counts as a street number.
  const unitDigits = folder.unit?.replace(/\D/g, "") ?? null;
  const onlyUnit = unitDigits !== null && firstNumber(asWritten.replace(/#\s*[0-9]{1,5}\s?[A-Za-z]?\b/g, " ")) === null;
  const byId = new Map(projects.map((p) => [p.id, p]));
  return scores
    .map((s) => {
      if (!onlyUnit || !s.why.includes("street number") || firstNumber(byId.get(s.id)?.street) !== unitDigits) return s;
      return { ...s, score: s.score - 45 - (s.why.includes("street name") ? 20 : 0), why: s.why.filter((w) => w !== "street number" && w !== "street name") };
    })
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score);
}

/** The project to use, or null when the best score is weak or two projects are too close. */
export function pickProject(scores: ArchiveCandidate[]): number | null {
  const best = scores[0];
  const second = scores[1];
  const matched = best && (best.score >= 85 || (best.score >= 60 && best.score - (second?.score ?? 0) >= 20));
  return matched ? best.id : null;
}

/** How a folder name is compared with the hand-made decisions: case and spacing do not count. */
export const folderKey = (s: string) => s.trim().toUpperCase().replace(/\s+/g, " ");
