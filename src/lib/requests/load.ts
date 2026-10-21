import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { CurrentUser } from "@/lib/auth/session";
import { ackLog, isRequestRecipient, parseSharedAlerts, type Ack, type AckLine, type SharedAlertsSettings } from "./engine";

// F26-1: reading project requests, their acknowledgement log and the recipients setting (RLS applies).

export const ALERT_KIND = "project_request";

export async function loadSharedAlerts(db: SupabaseClient): Promise<SharedAlertsSettings> {
  const { data } = await db.from("app_settings").select("value").eq("key", "shared_alerts").maybeSingle();
  return parseSharedAlerts((data as { value: unknown } | null)?.value);
}

export async function isRecipient(db: SupabaseClient, user: CurrentUser): Promise<boolean> {
  return isRequestRecipient(await loadSharedAlerts(db), user.email);
}

export type RequestRow = { id: number; project_id: number; date: string; type: string; description: string | null; status: string; closed_by: string | null; closed_at: string | null; created_at: string; created_by: string | null };
export type RequestLine = RequestRow & { who: string | null; closedBy: string | null; log: AckLine[]; cleared: boolean };

const COLS = "id, project_id, date, type, description, status, closed_by, closed_at, created_at, created_by";

/** Names of people with a login, for the log and the "closed by" line. */
export async function profileNames(db: SupabaseClient, ids: (string | null)[]): Promise<Map<string, string>> {
  const list = [...new Set(ids.filter((x): x is string => Boolean(x)))];
  const out = new Map<string, string>();
  if (!list.length) return out;
  const { data } = await db.from("profiles").select("id, first_name, last_name, email").in("id", list);
  for (const p of (data ?? []) as { id: string; first_name: string | null; last_name: string | null; email: string }[]) out.set(p.id, [p.first_name, p.last_name].filter(Boolean).join(" ") || p.email);
  return out;
}

export async function loadAcks(db: SupabaseClient, refIds: number[]): Promise<Ack[]> {
  if (!refIds.length) return [];
  const { data } = await db.from("alert_acks").select("ref_id, user_id, action, at").eq("kind", ALERT_KIND).in("ref_id", refIds).order("at");
  return (data ?? []) as Ack[];
}

/** The requests of one project, Open first then newest first, each with its log. */
export async function loadProjectRequests(db: SupabaseClient, projectId: number): Promise<RequestLine[]> {
  const { data } = await db.from("project_requests").select(COLS).eq("project_id", projectId).is("deleted_at", null).order("date", { ascending: false }).order("created_at", { ascending: false });
  const rows = (data ?? []) as RequestRow[];
  if (!rows.length) return [];
  const acks = await loadAcks(db, rows.map((r) => r.id));
  const names = await profileNames(db, [...rows.flatMap((r) => [r.created_by, r.closed_by]), ...acks.map((a) => a.user_id)]);
  const lines = rows.map((r) => ({
    ...r,
    who: r.created_by ? (names.get(r.created_by) ?? null) : null,
    closedBy: r.closed_by ? (names.get(r.closed_by) ?? null) : null,
    log: ackLog(acks, r.id, names),
    cleared: acks.some((a) => a.ref_id === r.id && a.action === "cleared"),
  }));
  return [...lines.filter((l) => l.status === "Open"), ...lines.filter((l) => l.status !== "Open")];
}

/** Logs an action in the signed-in person's name; logging it twice is a no-op (unique index). */
export async function logAck(db: SupabaseClient, userId: string, refIds: number[], action: Ack["action"]): Promise<void> {
  if (!refIds.length) return;
  await db.from("alert_acks").upsert(
    refIds.map((ref_id) => ({ kind: ALERT_KIND, ref_id, user_id: userId, action })),
    { onConflict: "kind,ref_id,user_id,action", ignoreDuplicates: true },
  );
}
