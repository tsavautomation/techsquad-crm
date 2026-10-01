import "server-only";
import { decrypt, encrypt } from "@/lib/crypto";
import { todayET } from "@/lib/dates";
import { adminDb } from "@/lib/supabase/admin";
import { safeName } from "./paths";
import type { TableDef } from "@/registry/types";

// Personal OneDrive through Microsoft Graph (Fred 2026-09-30). One Microsoft account is connected by a
// System Administrator (delegated sign-in, "consumers" authority); its refresh token is stored encrypted
// in app_integrations. Phones upload straight to OneDrive with resumable upload sessions; this module
// creates the sessions, files uploads into TechSquad CRM / Projects / <project> / <form> / <date>, and
// gives the app download links.

const AUTH = "https://login.microsoftonline.com/consumers/oauth2/v2.0";
const GRAPH = "https://graph.microsoft.com/v1.0";
export const SCOPES = "offline_access Files.ReadWrite User.Read";
const ROOT = "TechSquad CRM";
const STAGING = `${ROOT}/_Uploading`;

export type OneDriveSettings = { refresh_token: string; account: string; name: string; drive_id: string; connected_at: string; connected_by: string };

export const oneDriveConfigured = () => Boolean(process.env.ONEDRIVE_CLIENT_ID && process.env.ONEDRIVE_CLIENT_SECRET);
const redirectUri = () => `${(process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/$/, "")}/api/onedrive/callback`;

export function authorizeUrl(state: string) {
  const p = new URLSearchParams({ client_id: process.env.ONEDRIVE_CLIENT_ID!, response_type: "code", redirect_uri: redirectUri(), response_mode: "query", scope: SCOPES, state, prompt: "select_account" });
  return `${AUTH}/authorize?${p}`;
}

async function tokenRequest(params: Record<string, string>) {
  const res = await fetch(`${AUTH}/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: process.env.ONEDRIVE_CLIENT_ID!, client_secret: process.env.ONEDRIVE_CLIENT_SECRET!, redirect_uri: redirectUri(), scope: SCOPES, ...params }),
  });
  const body = (await res.json()) as { access_token?: string; refresh_token?: string; expires_in?: number; error_description?: string };
  if (!res.ok || !body.access_token) throw new Error(`Microsoft sign-in failed: ${body.error_description?.split("\r\n")[0] ?? res.status}`);
  return body as { access_token: string; refresh_token?: string; expires_in: number };
}

// ---------------------------------------------------------------- connection

export async function loadSettings(): Promise<OneDriveSettings | null> {
  const { data } = await adminDb().from("app_integrations").select("data").eq("key", "onedrive").maybeSingle();
  const d = (data as { data: OneDriveSettings } | null)?.data;
  return d?.refresh_token ? { ...d, refresh_token: decrypt(d.refresh_token) } : null;
}

async function saveSettings(s: OneDriveSettings, userId: string | null) {
  await adminDb()
    .from("app_integrations")
    .upsert({ key: "onedrive", data: { ...s, refresh_token: encrypt(s.refresh_token) }, updated_at: new Date().toISOString(), updated_by: userId });
}

/** Finish the "Connect OneDrive" sign-in: exchange the code, remember the account. */
export async function connectWithCode(code: string, userId: string) {
  const t = await tokenRequest({ grant_type: "authorization_code", code });
  const headers = { Authorization: `Bearer ${t.access_token}` };
  const [me, drive] = await Promise.all([fetch(`${GRAPH}/me`, { headers }).then((r) => r.json()), fetch(`${GRAPH}/me/drive`, { headers }).then((r) => r.json())]);
  const account = (me as { userPrincipalName?: string; mail?: string }).mail ?? (me as { userPrincipalName?: string }).userPrincipalName ?? "";
  await saveSettings(
    { refresh_token: t.refresh_token!, account, name: (me as { displayName?: string }).displayName ?? account, drive_id: (drive as { id?: string }).id ?? "", connected_at: new Date().toISOString(), connected_by: userId },
    userId,
  );
  cache = { token: t.access_token, until: Date.now() + (t.expires_in - 120) * 1000 };
  await adminDb().from("onedrive_folders").delete().neq("path", ""); // a different account has different folders
}

export async function disconnect(userId: string) {
  await adminDb().from("app_integrations").delete().eq("key", "onedrive");
  await adminDb().from("onedrive_folders").delete().neq("path", "");
  cache = null;
  void userId;
}

let cache: { token: string; until: number } | null = null;

/** A valid access token (refreshed when needed; Microsoft returns a new refresh token each time). */
async function accessToken(): Promise<string> {
  if (cache && cache.until > Date.now()) return cache.token;
  const s = await loadSettings();
  if (!s) throw new Error("OneDrive is not connected");
  const t = await tokenRequest({ grant_type: "refresh_token", refresh_token: s.refresh_token });
  cache = { token: t.access_token, until: Date.now() + (t.expires_in - 120) * 1000 };
  if (t.refresh_token && t.refresh_token !== s.refresh_token) await saveSettings({ ...s, refresh_token: t.refresh_token }, null);
  return t.access_token;
}

export async function oneDriveReady(): Promise<boolean> {
  if (!oneDriveConfigured()) return false;
  const { data } = await adminDb().from("app_integrations").select("key").eq("key", "onedrive").maybeSingle();
  return Boolean(data);
}

async function graph<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${GRAPH}${path}`, { ...init, headers: { Authorization: `Bearer ${await accessToken()}`, "Content-Type": "application/json", ...init.headers } });
  if (res.status === 204) return undefined as T;
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(`OneDrive ${res.status}: ${(body as { error?: { message?: string } }).error?.message ?? "error"}`), { status: res.status });
  return body as T;
}

// ---------------------------------------------------------------- folders

const enc = (path: string) => path.split("/").map(encodeURIComponent).join("/");

/** Item id of a folder path under the drive root, creating missing folders one level at a time. */
export async function ensureFolder(path: string): Promise<string> {
  const db = adminDb();
  const { data: hit } = await db.from("onedrive_folders").select("item_id").eq("path", path).maybeSingle();
  if (hit) return (hit as { item_id: string }).item_id;
  let id: string;
  try {
    id = (await graph<{ id: string }>(`/me/drive/root:/${enc(path)}`)).id;
  } catch (e) {
    if ((e as { status?: number }).status !== 404) throw e;
    const cut = path.lastIndexOf("/");
    const parent = cut > 0 ? await ensureFolder(path.slice(0, cut)) : null;
    const name = path.slice(cut + 1);
    try {
      id = (await graph<{ id: string }>(parent ? `/me/drive/items/${parent}/children` : "/me/drive/root/children", { method: "POST", body: JSON.stringify({ name, folder: {}, "@microsoft.graph.conflictBehavior": "fail" }) })).id;
    } catch (e2) {
      if ((e2 as { status?: number }).status !== 409) throw e2; // created meanwhile by another upload
      id = (await graph<{ id: string }>(`/me/drive/root:/${enc(path)}`)).id;
    }
  }
  await db.from("onedrive_folders").upsert({ path, item_id: id });
  return id;
}

/** Where a record's files belong: TechSquad CRM / Projects / <project> / <form> / <date>, or / <form> / <record>. */
export async function folderFor(t: TableDef, recordId: number): Promise<string> {
  const db = adminDb();
  const projectField = t.name === "projects" ? null : t.fields.find((f) => f.type === "lookup" && !f.multiple && f.lookup?.table === "projects");
  let projectId: number | null = t.name === "projects" ? recordId : null;
  let recordTitle: string | null = null;
  const { data } = await db
    .from(t.name)
    .select(projectField ? `title, ${projectField.name}` : "title")
    .eq("id", recordId)
    .maybeSingle();
  if (data) {
    recordTitle = (data as unknown as { title: string | null }).title;
    if (projectField) projectId = (data as unknown as Record<string, number | null>)[projectField.name] ?? null;
  }
  if (projectId) {
    const { data: p } = await db.from("projects").select("title").eq("id", projectId).maybeSingle();
    const project = safeName(`${(p as { title: string | null } | null)?.title ?? "Project"} (${projectId})`);
    const where = t.name === "projects" ? "Project files" : safeName(t.label);
    return `${ROOT}/Projects/${project}/${where}/${todayET()}`;
  }
  return `${ROOT}/${safeName(t.label)}/${safeName(recordTitle ? `${recordTitle} (${recordId})` : `${t.itemLabel} ${recordId}`)}`;
}

// ---------------------------------------------------------------- uploads

/** A resumable upload session in the staging folder; the phone sends the file to `uploadUrl` in pieces. */
export async function createUploadSession(fileName: string, uploadId: string): Promise<string> {
  const staging = await ensureFolder(STAGING);
  const name = safeName(`${uploadId}-${fileName}`);
  const s = await graph<{ uploadUrl: string }>(`/me/drive/items/${staging}:/${encodeURIComponent(name)}:/createUploadSession`, {
    method: "POST",
    body: JSON.stringify({ item: { "@microsoft.graph.conflictBehavior": "rename" } }),
  });
  return s.uploadUrl;
}

export type DriveItem = { id: string; name: string; size: number; file?: { mimeType?: string }; parentReference?: { id?: string; path?: string }; webUrl?: string };

export const getItem = (id: string) => graph<DriveItem>(`/me/drive/items/${encodeURIComponent(id)}`);

/** File a finished upload: move it out of staging into the record's folder, under its real name. */
export async function moveIntoFolder(itemId: string, folderPath: string, name: string) {
  const parent = await ensureFolder(folderPath);
  return graph<DriveItem>(`/me/drive/items/${encodeURIComponent(itemId)}?@microsoft.graph.conflictBehavior=rename`, {
    method: "PATCH",
    body: JSON.stringify({ parentReference: { id: parent }, name: safeName(name) }),
  });
}

export async function deleteItem(itemId: string) {
  try {
    await graph(`/me/drive/items/${encodeURIComponent(itemId)}`, { method: "DELETE" });
  } catch (e) {
    if ((e as { status?: number }).status !== 404) throw e;
  }
}

/** Short-lived links that open / show each file (about an hour), fetched 20 at a time. */
export async function downloadUrls(ids: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  for (let i = 0; i < ids.length; i += 20) {
    const part = ids.slice(i, i + 20);
    const r = await graph<{ responses: { id: string; status: number; body?: { "@microsoft.graph.downloadUrl"?: string } }[] }>("/$batch", {
      method: "POST",
      // The whole item: asking for only the download link with $select makes OneDrive leave it out.
      body: JSON.stringify({ requests: part.map((id, k) => ({ id: String(k), method: "GET", url: `/me/drive/items/${encodeURIComponent(id)}` })) }),
    });
    for (const x of r.responses) {
      const url = x.body?.["@microsoft.graph.downloadUrl"];
      if (x.status === 200 && url) out.set(part[Number(x.id)], url);
    }
  }
  return out;
}

export async function downloadItem(itemId: string): Promise<{ bytes: Buffer; mime: string | null } | null> {
  const urls = await downloadUrls([itemId]);
  const url = urls.get(itemId);
  if (!url) return null;
  const res = await fetch(url);
  if (!res.ok) return null;
  return { bytes: Buffer.from(await res.arrayBuffer()), mime: res.headers.get("content-type") };
}

/** Server-side upload (moving old files): small files in one request, larger ones in pieces. */
export async function uploadBytes(folderPath: string, name: string, bytes: Buffer): Promise<DriveItem> {
  const parent = await ensureFolder(folderPath);
  const file = encodeURIComponent(safeName(name));
  if (bytes.length <= 4 * 1024 * 1024) {
    return graph<DriveItem>(`/me/drive/items/${parent}:/${file}:/content?@microsoft.graph.conflictBehavior=rename`, { method: "PUT", body: new Uint8Array(bytes), headers: { "Content-Type": "application/octet-stream" } });
  }
  const s = await graph<{ uploadUrl: string }>(`/me/drive/items/${parent}:/${file}:/createUploadSession`, { method: "POST", body: JSON.stringify({ item: { "@microsoft.graph.conflictBehavior": "rename" } }) });
  const CHUNK = 320 * 1024 * 32; // 10 MiB, a multiple of 320 KiB as OneDrive requires
  for (let start = 0; start < bytes.length; start += CHUNK) {
    const end = Math.min(bytes.length, start + CHUNK);
    const res = await fetch(s.uploadUrl, { method: "PUT", headers: { "Content-Range": `bytes ${start}-${end - 1}/${bytes.length}` }, body: new Uint8Array(bytes.subarray(start, end)) });
    if (res.status === 200 || res.status === 201) return (await res.json()) as DriveItem;
    if (res.status !== 202) throw new Error(`OneDrive upload failed (${res.status})`);
  }
  throw new Error("OneDrive upload did not finish");
}

