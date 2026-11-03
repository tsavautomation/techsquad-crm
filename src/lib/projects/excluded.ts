// PJ-b item 6 (Luana via Fred 2026-11-02): the office's placeholder projects stay out of every list, total and report.
//   #1158 TEST PROJECT (the office's test record) · #1271 SURVEY (where survey visits wait before "Assign to project", SV-a).
// Loaders that list or total projects filter these ids out; the records themselves still open by their links.
export const EXCLUDED_PROJECT_IDS: readonly number[] = [1158, 1271];
export const isExcludedProject = (id: number | null | undefined) => id != null && EXCLUDED_PROJECT_IDS.includes(id);
/** PostgREST filter value: `.not("id", "in", EXCLUDED_PROJECT_FILTER)`. */
export const EXCLUDED_PROJECT_FILTER = `(${EXCLUDED_PROJECT_IDS.join(",")})`;
