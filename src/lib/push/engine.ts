// F27 Push notifications: the pure part. Which events exist, who receives one, and what it says.
// Sending lives in send.ts (server only); this file has no I/O so it can be unit-tested.

export const PUSH_EVENTS = [
  { kind: "visit_check_in", label: "Technician checked in" },
  { kind: "visit_check_out", label: "Technician checked out" },
  // F27-b (Fred 2026-10-21): reminders to the person themselves.
  { kind: "arrived_no_check_in", label: "Arrived at the job, no check-in after 45 min" },
  { kind: "forgot_clock_out", label: "Still clocked in after hours" },
  { kind: "missing_report", label: "Report not sent by the evening" },
  // F28-e (Fred 2026-10-23): the WhatsApp capture PC stopped or went quiet in business hours.
  { kind: "whatsapp_silent", label: "WhatsApp PC stopped or silent" },
] as const;

/** F27-b: the van has sat within this distance of the job for this long without a check-in. */
export const ARRIVAL_RADIUS_M = 500;
export const ARRIVAL_WAIT_MIN = 45;

/**
 * F27-b: the evening report reminder fires at a different minute every day, between 7:00 and 7:30 PM
 * (Fred: "don't do it exactly at 7 PM to create a routine"), the same minute all evening for one date.
 */
export function reportReminderTime(date: string): string {
  let h = 0;
  for (const c of date) h = (h * 31 + c.charCodeAt(0)) % 100_003;
  const minute = h % 31;
  return `19:${String(minute).padStart(2, "0")}`;
}

export const arrivalMessage = (p: { project: string | null; visitId: number }): PushMessage => ({
  title: "You arrived. Did you check in?",
  body: `${p.project ?? "Your visit"}: the van has been at the job for ${ARRIVAL_WAIT_MIN} minutes with no check-in.`,
  url: `/schedule/visits/${p.visitId}`,
  tag: `arrival-${p.visitId}`,
});
export const clockOutMessage = (p: { since: string }): PushMessage => ({
  title: "Still clocked in",
  body: `You have been clocked in since ${hhmm(p.since)}. Clock out if your day is over.`,
  url: "/",
  tag: "clock-out-reminder",
});
export const missingReportMessage = (p: { projects: string[] }): PushMessage => ({
  title: p.projects.length === 1 ? "Job report missing" : `${p.projects.length} job reports missing`,
  body: `No report yet for ${p.projects.join(", ")}. Send it before the day closes.`,
  url: "/",
  tag: "missing-report",
});
export type PushKind = (typeof PUSH_EVENTS)[number]["kind"];
export const isPushKind = (s: string): s is PushKind => PUSH_EVENTS.some((e) => e.kind === s);

export type PushMessage = { title: string; body: string; url: string; tag?: string };

const hhmm = (iso: string) => new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "numeric", minute: "2-digit" }).format(new Date(iso));

/** Logins that asked for this kind of event (profiles.push_events), active ones only. */
export function recipientsFor<T extends { id: string; active: boolean; push_events: string[] | null }>(kind: PushKind, profiles: T[]): T[] {
  return profiles.filter((p) => p.active && (p.push_events ?? []).includes(kind));
}

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
