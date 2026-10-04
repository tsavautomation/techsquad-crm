import "server-only";
import { decrypt, encrypt } from "@/lib/crypto";
import { adminDb } from "@/lib/supabase/admin";
import type { EventBody, GEvent } from "./match";

// Google Calendar (F15, SPEC §9.1 F15-a): one Google account's shared calendar is connected by an
// administrator (OAuth 2.0 authorization code, offline access). Tokens are kept encrypted in
// app_integrations under 'google_calendar', together with the chosen calendar, the colour →
// technician map, the incremental sync token and the import progress. Google refresh tokens do not
// rotate; access tokens last an hour and are refreshed on demand.

const AUTH = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN = "https://oauth2.googleapis.com/token";
const API = "https://www.googleapis.com/calendar/v3";
const SCOPES = ["openid", "email", "https://www.googleapis.com/auth/calendar"];
export const KEY = "google_calendar";

export type ImportPhase = "idle" | "reading" | "read" | "creating" | "done" | "error";
export type ImportState = {
  phase: ImportPhase;
  /** Events are read from this date on (YYYY-MM-DD). */
  from: string;
  pageToken?: string;
  read: number;
  created: number;
  matched: number;
  unmatched: number;
  skipped: number;
  /** Last time a chunk made progress; a stale heartbeat means the chunk died and another may start. */
  heartbeat: string;
  startedAt: string;
  finishedAt?: string;
  error?: string;
};

export type GoogleSettings = {
  access_token: string;
  refresh_token: string;
  expires_at: string;
  account: string;
  connected_at: string;
  connected_by: string;
  calendar_id: string | null;
  calendar_name: string | null;
  color_map: Record<string, number>;
  /** Name at the start of the titles (lower case) → employee id; suggested after reading, corrected by the admin. */
  name_map: Record<string, number>;
  /** The names seen most often, with counts, for the Admin page. */
  name_stats: { name: string; count: number }[];
  ai_match: boolean;
  sync_token: string | null;
  last_sync_at: string | null;
  last_sync_error: string | null;
  last_push: { pushed: number; at: string } | null;
  import: ImportState | null;
};

export const googleConfigured = () => Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
const site = () => (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/$/, "");
export const redirectUri = () => `${site()}/api/google/callback`;
export const siteUrl = site;

export function authorizeUrl(state: string) {
  const p = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!,
    response_type: "code",
    redirect_uri: redirectUri(),
    scope: SCOPES.join(" "),
    access_type: "offline",
    prompt: "consent", // always hand out a refresh token
    include_granted_scopes: "true",
    state,
  });
  return `${AUTH}?${p}`;
}

type TokenResponse = { access_token: string; refresh_token?: string; expires_in: number; id_token?: string };

async function tokenRequest(body: Record<string, string>): Promise<TokenResponse> {
  const res = await fetch(TOKEN, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: process.env.GOOGLE_CLIENT_ID!, client_secret: process.env.GOOGLE_CLIENT_SECRET!, ...body }),
    cache: "no-store",
  });
  const json = (await res.json().catch(() => ({}))) as Partial<TokenResponse> & { error?: string; error_description?: string };
  if (!res.ok || !json.access_token) throw new Error(`Google sign-in failed: ${json.error_description ?? json.error ?? res.status}`);
  return { access_token: json.access_token, refresh_token: json.refresh_token, expires_in: Number(json.expires_in) || 3600, id_token: json.id_token };
}

const expiresAt = (t: TokenResponse) => new Date(Date.now() + t.expires_in * 1000).toISOString();

/** The e-mail inside an OpenID id_token (no extra request). */
function emailFromIdToken(idToken: string | undefined): string {
  try {
    const payload = JSON.parse(Buffer.from((idToken ?? "").split(".")[1] ?? "", "base64url").toString("utf8")) as { email?: string };
    return payload.email ?? "";
  } catch {
    return "";
  }
}

// ---------------------------------------------------------------- settings

export async function loadSettings(): Promise<GoogleSettings | null> {
  const { data } = await adminDb().from("app_integrations").select("data").eq("key", KEY).maybeSingle();
  const d = (data as { data: Partial<GoogleSettings> } | null)?.data;
  if (!d?.refresh_token || !d.access_token) return null;
  // Older rows may lack the newer fields.
  const defaults: Omit<GoogleSettings, "access_token" | "refresh_token" | "expires_at" | "account" | "connected_at" | "connected_by"> = { color_map: {}, name_map: {}, name_stats: [], ai_match: true, calendar_id: null, calendar_name: null, sync_token: null, last_sync_at: null, last_sync_error: null, last_push: null, import: null };
  return { ...defaults, ...(d as GoogleSettings), access_token: decrypt(d.access_token), refresh_token: decrypt(d.refresh_token) };
}

export async function saveSettings(s: GoogleSettings, userId: string | null = null) {
  const { error } = await adminDb()
    .from("app_integrations")
    .upsert({ key: KEY, data: { ...s, access_token: encrypt(s.access_token), refresh_token: encrypt(s.refresh_token) }, updated_at: new Date().toISOString(), updated_by: userId });
  if (error) throw new Error(`Could not save the Google Calendar connection: ${error.message}`);
}

/** Change a few settings fields (the tokens are left as they are). */
export async function patchSettings(patch: Partial<GoogleSettings>, userId: string | null = null) {
  const s = await loadSettings();
  if (!s) throw new Error("Google Calendar is not connected.");
  await saveSettings({ ...s, ...patch }, userId);
}

/** Admin › Google Calendar › Connect: exchange the code, remember who the account is, keep the tokens. */
export async function connectWithCode(code: string, userId: string) {
  const t = await tokenRequest({ grant_type: "authorization_code", code, redirect_uri: redirectUri() });
  if (!t.refresh_token) throw new Error("Google did not hand out a refresh token. Remove the CRM from the account's third-party access (myaccount.google.com › Security) and connect again.");
  const old = await loadSettings().catch(() => null);
  await saveSettings(
    {
      ...(old ?? { calendar_id: null, calendar_name: null, color_map: {}, name_map: {}, name_stats: [], ai_match: true, sync_token: null, last_sync_at: null, last_sync_error: null, last_push: null, import: null }),
      access_token: t.access_token,
      refresh_token: t.refresh_token,
      expires_at: expiresAt(t),
      account: emailFromIdToken(t.id_token),
      connected_at: new Date().toISOString(),
      connected_by: userId,
    },
    userId,
  );
}

export async function disconnect() {
  await adminDb().from("app_integrations").delete().eq("key", KEY);
}

export async function isConnected(): Promise<boolean> {
  const { data } = await adminDb().from("app_integrations").select("key").eq("key", KEY).maybeSingle();
  return Boolean(data);
}

// ---------------------------------------------------------------- tokens

let refreshing: Promise<string> | null = null;

async function accessToken(force = false): Promise<string> {
  const s = await loadSettings();
  if (!s) throw new Error("Google Calendar is not connected.");
  if (!force && Date.parse(s.expires_at) - 60_000 > Date.now()) return s.access_token;
  refreshing ??= (async () => {
    try {
      const t = await tokenRequest({ grant_type: "refresh_token", refresh_token: s.refresh_token });
      await saveSettings({ ...s, access_token: t.access_token, expires_at: expiresAt(t) });
      return t.access_token;
    } finally {
      refreshing = null;
    }
  })();
  return refreshing;
}

// ---------------------------------------------------------------- Calendar API

export class GoogleApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

async function call<T>(method: string, path: string, body?: unknown, retry = true): Promise<T> {
  const token = await accessToken();
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, ...(body ? { "Content-Type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
  });
  if (res.status === 401 && retry) {
    await accessToken(true);
    return call(method, path, body, false);
  }
  if (res.status === 204) return undefined as T;
  const json = (await res.json().catch(() => ({}))) as T & { error?: { message?: string } };
  if (!res.ok) throw new GoogleApiError(res.status, `Google answered ${res.status}: ${json.error?.message ?? res.statusText}${res.status === 401 ? " (reconnect it in Admin › Google Calendar)" : ""}`);
  return json;
}

export type GCalendar = { id: string; summary: string; primary?: boolean; accessRole: string; backgroundColor?: string };

/** The calendars the connected account can see (the admin picks one). */
export async function listCalendars(): Promise<GCalendar[]> {
  const r = await call<{ items?: GCalendar[] }>("GET", "/users/me/calendarList?minAccessRole=reader&maxResults=250");
  return (r.items ?? []).sort((a, b) => Number(Boolean(b.primary)) - Number(Boolean(a.primary)) || a.summary.localeCompare(b.summary));
}

export type EventsPage = { items: GEvent[]; nextPageToken?: string; nextSyncToken?: string };

/**
 * One page of events. A full read passes timeMin (the history start); an incremental read passes
 * the sync token Google handed out at the end of the last read. Series come as single instances.
 */
export async function listEvents(calendarId: string, o: { timeMin?: string; pageToken?: string; syncToken?: string; maxResults?: number }): Promise<EventsPage> {
  const p = new URLSearchParams({ singleEvents: "true", maxResults: String(o.maxResults ?? 250) });
  if (o.syncToken) p.set("syncToken", o.syncToken);
  else {
    if (o.timeMin) p.set("timeMin", o.timeMin);
    p.set("showDeleted", "false");
  }
  if (o.pageToken) p.set("pageToken", o.pageToken);
  const r = await call<EventsPage>("GET", `/calendars/${encodeURIComponent(calendarId)}/events?${p}`);
  return { items: r.items ?? [], nextPageToken: r.nextPageToken, nextSyncToken: r.nextSyncToken };
}

export const insertEvent = (calendarId: string, body: EventBody) => call<GEvent>("POST", `/calendars/${encodeURIComponent(calendarId)}/events`, body);
export const patchEvent = (calendarId: string, eventId: string, body: EventBody) => call<GEvent>("PATCH", `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`, body);
export async function deleteEvent(calendarId: string, eventId: string) {
  try {
    await call<void>("DELETE", `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`);
  } catch (e) {
    // Already gone is fine.
    if (!(e instanceof GoogleApiError && (e.status === 404 || e.status === 410))) throw e;
  }
}
