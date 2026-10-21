// F27 Push notifications: the pure part. Which events exist, who receives one, and what it says.
// Sending lives in send.ts (server only); this file has no I/O so it can be unit-tested.

export const PUSH_EVENTS = [
  { kind: "visit_check_in", label: "Technician checked in" },
  { kind: "visit_check_out", label: "Technician checked out" },
] as const;
export type PushKind = (typeof PUSH_EVENTS)[number]["kind"];
export const isPushKind = (s: string): s is PushKind => PUSH_EVENTS.some((e) => e.kind === s);

export type PushMessage = { title: string; body: string; url: string; tag?: string };

/** Logins that asked for this kind of event (profiles.push_events), active ones only. */
export function recipientsFor<T extends { id: string; active: boolean; push_events: string[] | null }>(kind: PushKind, profiles: T[]): T[] {
  return profiles.filter((p) => p.active && (p.push_events ?? []).includes(kind));
}

const hhmm = (iso: string) => new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "numeric", minute: "2-digit" }).format(new Date(iso));

/** "Jeferson Medeiros checked in · 826 Meridian House · 9:42 AM", tapping opens the visit. */
export function visitStepMessage(kind: PushKind, p: { person: string; project: string | null; at: string; visitId: number }): PushMessage {
  const verb = kind === "visit_check_in" ? "checked in" : "checked out";
  return {
    title: `${p.person} ${verb}`,
    body: [p.project ?? "Internal", hhmm(p.at)].join(" · "),
    url: `/schedule/visits/${p.visitId}`,
    tag: `visit-${p.visitId}-${kind}`,
  };
}
