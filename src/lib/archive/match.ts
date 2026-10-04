import { scoreProjects, type CatProject, type ProjectScore } from "@/lib/google/match";
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
export const comparable = (s: string) => digits(arabic(s));

export type ArchiveCandidate = { id: number; score: number };

/** All projects that score, best first. */
export function scoreArchiveFile(folder: ParsedFolder, name: ParsedName, projects: CatProject[]): ProjectScore[] {
  const summary = comparable(["Archive", folder.client, folder.place, name.job].filter(Boolean).join(" – "));
  const location = comparable([folder.place, folder.unit ? `#${folder.unit}` : null].filter(Boolean).join(" "));
  return scoreProjects({ id: folder.raw, summary, location }, projects.map((p) => ({ ...p, title: comparable(p.title) })), name.technicians);
}

/** The project to use, or null when the best score is weak or two projects are too close. */
export function pickProject(scores: ArchiveCandidate[]): number | null {
  const best = scores[0];
  const second = scores[1];
  const matched = best && (best.score >= 85 || (best.score >= 60 && best.score - (second?.score ?? 0) >= 20));
  return matched ? best.id : null;
}
