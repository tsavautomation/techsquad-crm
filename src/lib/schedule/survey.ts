import type { Address } from "@/lib/records/values";

// SV Survey visits (Fred 2026-10-26): the pure parts. A survey has no project; its label on the calendar,
// Today, the map and the titles is "SURVEY – <address or contact>". Tests: tests/sv-survey.test.ts.

export const SURVEY = "Survey";
export const isSurvey = (kind: string | null | undefined) => kind === SURVEY;

/** The street line, else the city, else the contact's name, else nothing. */
export function surveyPlace(address: Address | null | undefined, contactName: string | null | undefined): string {
  const street = [address?.street, address?.address_2].filter(Boolean).join(", ").trim();
  const city = [address?.city, address?.state].filter(Boolean).join(", ").trim();
  return street || city || (contactName ?? "").trim() || "";
}

/** "SURVEY – 123 Main St" (or "SURVEY" alone when nothing is known yet). */
export function surveyLabel(address: Address | null | undefined, contactName: string | null | undefined): string {
  const place = surveyPlace(address, contactName);
  return place ? `SURVEY – ${place}` : "SURVEY";
}

/** The visit's or the report's label: a survey's place, the project's title, or the old fallbacks. */
export function visitLabel(v: { kind?: string | null; project_id: number | null; subject?: string | null; address?: Address | null; contact_name?: string | null; title?: string | null }, projectTitle: string | null | undefined, fallback = "No project"): string {
  if (projectTitle) return projectTitle;
  if (v.project_id) return `Project #${v.project_id}`;
  if (isSurvey(v.kind)) return surveyLabel(v.address, v.contact_name);
  if (v.kind === "Internal") return v.subject || "Internal";
  return v.title || fallback;
}

/** Calendar colour of a survey (teal), between the blue of a client visit and the grey of an unmatched import. */
export const SURVEY_COLOR = "#0d9488";
