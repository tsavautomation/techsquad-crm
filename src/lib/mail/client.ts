import "server-only";
import { decrypt, encrypt } from "@/lib/crypto";
import { emailFromIdToken, expiresAt, googleAuthorizeUrl, siteUrl, tokenRequest } from "@/lib/google/client";
import { adminDb } from "@/lib/supabase/admin";
import type { GmailMessage } from "./engine";

// F26-2 Gmail intake (SPEC §9.1 F26-a): the CRM's own free Gmail mailbox (tsavcrm@gmail.com, Fred
// 2026-10-21), connected by an administrator with the same Google app as the calendar (second account,
// read-only scope). Tokens are kept encrypted in app_integrations under 'gmail'. Google refresh tokens do
// not rotate; access tokens last an hour and are refreshed on demand.

export const KEY = "gmail";
export const MAILBOX = "tsavcrm@gmail.com";
const API = "https://gmail.googleapis.com/gmail/v1/users/me";
const SCOPES = ["openid", "email", "https://www.googleapis.com/auth/gmail.readonly"];
export const redirectUri = () => `${siteUrl()}/api/gmail/callback`;

export type GmailSettings = {
  access_token: string;
  refresh_token: string;
  expires_at: string;
  account: string;
  connected_at: string;
  connected_by: string;
  last_sync_at: string | null;
  last_sync_error: string | null;
  /** Gmail's internalDate (ms) of the newest email read; the next check starts a little before it. */
  last_internal_date: number | null;
  read_total: number;
};

export const authorizeUrl = (state: string) => googleAuthorizeUrl({ scopes: SCOPES, redirectUri: redirectUri(), state, loginHint: MAILBOX });

// ---------------------------------------------------------------- settings

export async function loadSettings(): Promise<GmailSettings | null> {
  const { data } = await adminDb().from("app_integrations").select("data").eq("key", KEY).maybeSingle();
  const d = (data as { data: Partial<GmailSettings> } | null)?.data;
  if (!d?.refresh_token || !d.access_token) return null;
  const s = d as GmailSettings;
  return { ...s, last_sync_at: s.last_sync_at ?? null, last_sync_error: s.last_sync_error ?? null, last_internal_date: s.last_internal_date ?? null, read_total: s.read_total ?? 0, access_token: decrypt(s.access_token), refresh_token: decrypt(s.refresh_token) };
}

export async function saveSettings(s: GmailSettings, userId: string | null = null) {
  const { error } = await adminDb()
    .from("app_integrations")
    .upsert({ key: KEY, data: { ...s, access_token: encrypt(s.access_token), refresh_token: encrypt(s.refresh_token) }, updated_at: new Date().toISOString(), updated_by: userId });
  if (error) throw new Error(`Could not save the Gmail connection: ${error.message}`);
}

export async function patchSettings(patch: Partial<GmailSettings>) {
  const s = await loadSettings();
  if (!s) throw new Error("Gmail is not connected.");
  await saveSettings({ ...s, ...patch });
}

/** Admin › Gmail intake › Connect: exchange the code, remember which account it is, keep the tokens. */
export async function connectWithCode(code: string, userId: string) {
  const t = await tokenRequest({ grant_type: "authorization_code", code, redirect_uri: redirectUri() });
  if (!t.refresh_token) throw new Error("Google did not hand out a refresh token. Remove the CRM from the account's third-party access (myaccount.google.com › Security) and connect again.");
  await saveSettings(
    { access_token: t.access_token, refresh_token: t.refresh_token, expires_at: expiresAt(t), account: emailFromIdToken(t.id_token), connected_at: new Date().toISOString(), connected_by: userId, last_sync_at: null, last_sync_error: null, last_internal_date: null, read_total: 0 },
    userId,
  );
}

export async function disconnect() {
  await adminDb().from("app_integrations").delete().eq("key", KEY);
}

// ---------------------------------------------------------------- tokens and calls

let refreshing: Promise<string> | null = null;

async function accessToken(force = false): Promise<string> {
  const s = await loadSettings();
  if (!s) throw new Error("Gmail is not connected.");
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

async function call<T>(path: string, retry = true): Promise<T> {
  const token = await accessToken();
  const res = await fetch(`${API}${path}`, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
  if (res.status === 401 && retry) {
    await accessToken(true);
    return call(path, false);
  }
  const json = (await res.json().catch(() => ({}))) as T & { error?: { message?: string } };
  if (!res.ok) throw new Error(`Gmail answered ${res.status}: ${json.error?.message ?? res.statusText}${res.status === 401 || res.status === 403 ? " (check the connection in Admin › Gmail intake)" : ""}`);
  return json;
}

/** Message ids matching a Gmail search (newest first), up to `max`. */
export async function listMessageIds(q: string, max = 200): Promise<{ id: string; threadId: string }[]> {
  const out: { id: string; threadId: string }[] = [];
  let pageToken: string | undefined;
  do {
    const p = new URLSearchParams({ q, maxResults: String(Math.min(100, max - out.length)) });
    if (pageToken) p.set("pageToken", pageToken);
    const r = await call<{ messages?: { id: string; threadId: string }[]; nextPageToken?: string }>(`/messages?${p}`);
    out.push(...(r.messages ?? []));
    pageToken = r.nextPageToken;
  } while (pageToken && out.length < max);
  return out;
}

export const getMessage = (id: string) => call<GmailMessage>(`/messages/${encodeURIComponent(id)}?format=full`);

/** The bytes of one attachment. */
export async function getAttachment(messageId: string, attachmentId: string): Promise<Buffer> {
  const r = await call<{ data?: string; size?: number }>(`/messages/${encodeURIComponent(messageId)}/attachments/${encodeURIComponent(attachmentId)}`);
  return Buffer.from((r.data ?? "").replace(/-/g, "+").replace(/_/g, "/"), "base64");
}

/** The signed-in account's address (a connection check). */
export async function profileAddress(): Promise<string> {
  return (await call<{ emailAddress?: string }>("/profile")).emailAddress ?? "";
}
