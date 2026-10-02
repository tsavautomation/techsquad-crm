// F4 pipeline board (SPEC §9.1 F4-a): dragging a card takes a workflow option, so the WebAuthor path
// rules still hold (e.g. Proposal Approved → Installation only through ON HOLD) unless the user has
// Override at that stage. Pure, so the board and the tests share it.

export type BoardOutcome = { id: number; title: string; kind: "goto" | "override" | "unsubmit"; target: number | null };
export type BoardLevel = { id: number; title: string; color: string; place: number; is_start: boolean; may_act: boolean; outcomes: BoardOutcome[] };

/** "Not submitted" column: projects that aren't in the workflow yet. */
export const NOT_SUBMITTED = 0;

export type Move = { kind: "submit" } | { kind: "outcome"; outcomeId: number; target: number | null };

/**
 * How to get a card from `from` to `to`, or null when it isn't allowed.
 * A direct option wins over Override; Override needs the target level id.
 */
export function moveFor(levels: BoardLevel[], from: number, to: number, canSubmit: boolean): Move | null {
  if (from === to) return null;
  if (from === NOT_SUBMITTED) return canSubmit && levels.find((l) => l.id === to)?.is_start ? { kind: "submit" } : null;
  if (to === NOT_SUBMITTED) return null; // leaving the workflow is "Remove from Workflow" on the project page
  const level = levels.find((l) => l.id === from);
  if (!level?.may_act || !levels.some((l) => l.id === to)) return null;
  const direct = level.outcomes.find((o) => o.kind === "goto" && o.target === to);
  if (direct) return { kind: "outcome", outcomeId: direct.id, target: null };
  const override = level.outcomes.find((o) => o.kind === "override");
  return override ? { kind: "outcome", outcomeId: override.id, target: to } : null;
}

/** Every column a card in `from` may be dropped on. */
export function targetsFrom(levels: BoardLevel[], from: number, canSubmit: boolean): number[] {
  return [NOT_SUBMITTED, ...levels.map((l) => l.id)].filter((to) => moveFor(levels, from, to, canSubmit) !== null);
}

/** Whole days since `iso` (for "12 days in this stage"). */
export function daysSince(iso: string | null | undefined, now: number): number | null {
  if (!iso) return null;
  return Math.max(0, Math.floor((now - Date.parse(iso)) / 86_400_000));
}
