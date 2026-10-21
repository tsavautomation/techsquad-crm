// F26-1 Project requests and shared alerts (SPEC §9.1 F26-a / F26-c): pure helpers shared by the alerts
// bell, the request card, the timeline and the tests. No database here.
import { z } from "zod";

// ---------------------------------------------------------------- settings (app_settings 'shared_alerts')

/** Who gets the request alerts (Fred 2026-10-21: Saulo, Jessica, Lucas, Luana, Fred). */
export const SharedAlertsSchema = z.object({
  request_recipient_emails: z.array(z.string().email()).default(["saulo@tsav.net", "jessica@tsav.net", "lucas@tsav.net", "luana@tsav.net", "fred@tsav.net"]),
});
export type SharedAlertsSettings = z.infer<typeof SharedAlertsSchema>;

export function parseSharedAlerts(value: unknown): SharedAlertsSettings {
  const r = SharedAlertsSchema.safeParse(value ?? {});
  return r.success ? r.data : SharedAlertsSchema.parse({});
}

export const isRequestRecipient = (settings: SharedAlertsSettings, email: string) => settings.request_recipient_emails.map((e) => e.toLowerCase()).includes(email.toLowerCase());

// ---------------------------------------------------------------- acknowledgements

export type AckAction = "read" | "acknowledged" | "cleared";
export const ACK_ACTIONS: AckAction[] = ["read", "acknowledged", "cleared"];
export type Ack = { ref_id: number; user_id: string; action: AckAction; at: string };

/**
 * Which open requests still ring in this person's bell: a "cleared" row by anyone hides the alert for
 * everyone (Fred: "whoever clears one clears it for everyone"); "acknowledged" hides it for that person only;
 * "read" changes nothing (it is only logged).
 */
export function pendingForMe<T extends { id: number }>(open: T[], acks: Ack[], meId: string): T[] {
  const hidden = new Set<number>();
  for (const a of acks) if (a.action === "cleared" || (a.action === "acknowledged" && a.user_id === meId)) hidden.add(a.ref_id);
  return open.filter((r) => !hidden.has(r.id));
}

export type AckLine = { action: AckAction; who: string; at: string };

/** The log shown on a request line: read, acknowledged, cleared — each in time order, names resolved. */
export function ackLog(acks: Ack[], refId: number, names: Map<string, string>): AckLine[] {
  return acks
    .filter((a) => a.ref_id === refId)
    .sort((a, b) => a.at.localeCompare(b.at) || ACK_ACTIONS.indexOf(a.action) - ACK_ACTIONS.indexOf(b.action))
    .map((a) => ({ action: a.action, who: names.get(a.user_id) ?? "Someone", at: a.at }));
}

/** True once anyone cleared the alert (the request may still be Open). */
export const isCleared = (acks: Ack[], refId: number) => acks.some((a) => a.ref_id === refId && a.action === "cleared");

// ---------------------------------------------------------------- audit-log readings for the timeline

export type AuditRow = { id: number; record_id: number; action: string; at: string; actor: string | null; changes: Record<string, [unknown, unknown]> };

export type FieldChange = { auditId: number; recordId: number; at: string; actor: string | null; from: string | null; to: string | null };

/**
 * The changes of one field in a record's history, as the timeline shows them (a "create" row counts when the
 * field was set from the start). Values that did not change (same before and after) are skipped.
 */
export function fieldChanges(rows: AuditRow[], field: string): FieldChange[] {
  const out: FieldChange[] = [];
  for (const r of rows) {
    const c = r.changes?.[field];
    if (!c) continue;
    const from = r.action === "create" ? null : str(c[0]);
    const to = str(c[1]);
    if (from === to || to === null) continue;
    out.push({ auditId: r.id, recordId: r.record_id, at: r.at, actor: r.actor, from, to });
  }
  return out;
}

const str = (v: unknown) => (v === null || v === undefined || v === "" ? null : String(v));
