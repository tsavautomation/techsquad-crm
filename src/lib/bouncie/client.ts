import "server-only";
import { decrypt, encrypt } from "@/lib/crypto";
import { adminDb } from "@/lib/supabase/admin";
import { parseBouncieVehicles, type LiveVehicle } from "./match";

// Bouncie (F8, SPEC §9.1 F8-b): the OBD trackers in the vans. One Bouncie account is connected by an
// administrator (OAuth 2.0 authorization code flow, docs.bouncie.dev); its tokens are kept encrypted in
// app_integrations under 'bouncie'. Access tokens expire (expires_in) and the refresh token rotates on
// every refresh, so the stored pair is replaced each time. The vehicles list is read server-side only
// and cached for a few seconds, so many open maps don't hammer Bouncie.
//
// Bouncie quirk: REST calls send the bare access token in Authorization — no "Bearer" prefix (their FAQ).

const AUTH = "https://auth.bouncie.com";
const API = "https://api.bouncie.dev/v1";
const CACHE_MS = 10_000;

export type BouncieSettings = {
  access_token: string;
  refresh_token: string;
  /** ISO time the access token stops working. */
  expires_at: string;
  account: string;
  name: string;
  connected_at: string;
  connected_by: string;
};

export const bouncieConfigured = () => Boolean(process.env.BOUNCIE_CLIENT_ID && process.env.BOUNCIE_CLIENT_SECRET);
const site = () => (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/$/, "");
export const redirectUri = () => `${site()}/api/bouncie/callback`;

export function authorizeUrl(state: string) {
  const p = new URLSearchParams({ client_id: process.env.BOUNCIE_CLIENT_ID!, response_type: "code", redirect_uri: redirectUri(), state });
  return `${AUTH}/dialog/authorize?${p}`;
}

type TokenResponse = { access_token: string; refresh_token: string; expires_in: number };

async function tokenRequest(body: Record<string, string>): Promise<TokenResponse> {
  const res = await fetch(`${AUTH}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ client_id: process.env.BOUNCIE_CLIENT_ID, client_secret: process.env.BOUNCIE_CLIENT_SECRET, ...body }),
    cache: "no-store",
  });
  const json = (await res.json().catch(() => ({}))) as Partial<TokenResponse> & { error?: string; error_description?: string; message?: string };
  if (!res.ok || !json.access_token) throw new Error(`Bouncie sign-in failed: ${json.error_description ?? json.message ?? json.error ?? res.status}`);
  return { access_token: json.access_token, refresh_token: json.refresh_token ?? body.refresh_token ?? "", expires_in: Number(json.expires_in) || 3600 };
}

const expiresAt = (t: TokenResponse) => new Date(Date.now() + t.expires_in * 1000).toISOString();

// ---------------------------------------------------------------- settings (app_integrations 'bouncie')

export async function loadSettings(): Promise<BouncieSettings | null> {
  const { data } = await adminDb().from("app_integrations").select("data").eq("key", "bouncie").maybeSingle();
  const d = (data as { data: BouncieSettings } | null)?.data;
  if (!d?.refresh_token || !d.access_token) return null;
  return { ...d, access_token: decrypt(d.access_token), refresh_token: decrypt(d.refresh_token) };
}

async function saveSettings(s: BouncieSettings, userId: string | null) {
  const { error } = await adminDb()
    .from("app_integrations")
    .upsert({ key: "bouncie", data: { ...s, access_token: encrypt(s.access_token), refresh_token: encrypt(s.refresh_token) }, updated_at: new Date().toISOString(), updated_by: userId });
  if (error) throw new Error(`Could not save the Bouncie connection: ${error.message}`);
}

/** Admin › Bouncie › Connect: exchange the code, read who the account is, keep the tokens. */
export async function connectWithCode(code: string, userId: string) {
  const t = await tokenRequest({ grant_type: "authorization_code", code, redirect_uri: redirectUri() });
  type Me = { email?: string; name?: string };
  const me: Me = await fetch(`${API}/user`, { headers: { Authorization: t.access_token }, cache: "no-store" })
    .then((r): Promise<Me> => (r.ok ? (r.json() as Promise<Me>) : Promise.resolve({})))
    .catch((): Me => ({}));
  await saveSettings(
    { access_token: t.access_token, refresh_token: t.refresh_token, expires_at: expiresAt(t), account: me.email ?? "", name: me.name ?? me.email ?? "Bouncie", connected_at: new Date().toISOString(), connected_by: userId },
    userId,
  );
  cache = null;
}

export async function disconnect() {
  await adminDb().from("app_integrations").delete().eq("key", "bouncie");
  cache = null;
}

export async function isConnected(): Promise<boolean> {
  const { data } = await adminDb().from("app_integrations").select("key").eq("key", "bouncie").maybeSingle();
  return Boolean(data);
}

// ---------------------------------------------------------------- tokens

let refreshing: Promise<string> | null = null;

/** A working access token; refreshed (and re-saved, since Bouncie rotates the refresh token) when it has expired. */
async function accessToken(force = false): Promise<string> {
  const s = await loadSettings();
  if (!s) throw new Error("Bouncie is not connected.");
  if (!force && Date.parse(s.expires_at) - 60_000 > Date.now()) return s.access_token;
  // One refresh at a time in this process: the old refresh token dies the moment it is used.
  refreshing ??= (async () => {
    try {
      const t = await tokenRequest({ grant_type: "refresh_token", refresh_token: s.refresh_token });
      await saveSettings({ ...s, access_token: t.access_token, refresh_token: t.refresh_token, expires_at: expiresAt(t) }, null);
      return t.access_token;
    } catch (e) {
      // Another server may have refreshed first (serverless): its new token is already saved.
      const again = await loadSettings();
      if (again && again.access_token !== s.access_token) return again.access_token;
      throw e;
    } finally {
      refreshing = null;
    }
  })();
  return refreshing;
}

// ---------------------------------------------------------------- vehicles

let cache: { at: number; vehicles: LiveVehicle[] } | null = null;

async function getVehicles(token: string) {
  return fetch(`${API}/vehicles`, { headers: { Authorization: token, "Content-Type": "application/json" }, cache: "no-store" });
}

/** Every vehicle on the connected Bouncie account with its last known position. Cached 10 s. */
export async function fetchVehicles(): Promise<LiveVehicle[]> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.vehicles;
  let res = await getVehicles(await accessToken());
  if (res.status === 401) res = await getVehicles(await accessToken(true));
  if (!res.ok) throw new Error(`Bouncie answered ${res.status}${res.status === 401 ? ": reconnect it in Admin › Bouncie" : ""}`);
  const vehicles = parseBouncieVehicles(await res.json());
  cache = { at: Date.now(), vehicles };
  return vehicles;
}

// ---------------------------------------------------------------- trips (F19-b Report vs. reality)

export type BouncieTrip = { start: string; end: string; endLat: number | null; endLng: number | null; distance: number | null };

/**
 * The trips of one device between two moments (Bouncie `GET /v1/trips?imei=…&gps-format=geojson&starts-after=…&ends-before=…`).
 * The last GeoJSON point of a trip is where the van stopped. Throws when Bouncie refuses; callers decide what to do.
 */
export async function fetchTrips(imei: string, from: string, to: string): Promise<BouncieTrip[]> {
  const q = new URLSearchParams({ imei, "gps-format": "geojson", "starts-after": from, "ends-before": to });
  const get = async (token: string) => fetch(`${API}/trips?${q}`, { headers: { Authorization: token, "Content-Type": "application/json" }, cache: "no-store" });
  let res = await get(await accessToken());
  if (res.status === 401) res = await get(await accessToken(true));
  if (!res.ok) throw new Error(`Bouncie trips answered ${res.status}`);
  const raw = (await res.json()) as unknown;
  const list = Array.isArray(raw) ? raw : [];
  return list.flatMap((t) => {
    const x = t as { startTime?: string; endTime?: string; distance?: number; gps?: { coordinates?: unknown } };
    if (!x.startTime || !x.endTime) return [];
    let endLat: number | null = null;
    let endLng: number | null = null;
    const coords = x.gps?.coordinates;
    if (Array.isArray(coords) && coords.length) {
      const last = coords[coords.length - 1] as unknown;
      if (Array.isArray(last) && typeof last[0] === "number" && typeof last[1] === "number") {
        endLng = last[0];
        endLat = last[1];
      }
    }
    return [{ start: x.startTime, end: x.endTime, endLat, endLng, distance: typeof x.distance === "number" ? x.distance : null }];
  });
}
