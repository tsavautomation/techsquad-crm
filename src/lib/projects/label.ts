// Pure helper, shared by server and client code.

/**
 * How a project is named on screen: its title followed by its number, "Jun Isaji - One Ocean #305 (1195)"
 * (Fred 2026-11-04, SPEC §9.1 PJ-c): the number is what people quote on the phone and what the OneDrive
 * folder carries, so it shows wherever a project appears (record title, lists, pickers, cards, search).
 * Stored titles never change; this is display only. Emails and PDFs keep their own wording.
 */
export function projectLabel(title: string | null | undefined, id: number | string): string {
  return `${title ?? "Project"} (${id})`;
}

/** The record number typed into a search box: "1195" or "#1195" → 1195, anything else → null. */
export function searchedId(q: string): number | null {
  const m = q.trim().match(/^#?(\d{1,15})$/);
  return m ? Number(m[1]) : null;
}
