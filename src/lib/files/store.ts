import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { adminDb } from "@/lib/supabase/admin";
import type { TableDef } from "@/registry/types";
import { downloadItem, downloadUrls, folderFor, getItem, moveIntoFolder } from "./onedrive";
import { isOneDrivePath, isPendingOneDrive, oneDriveId, uploadIdOf } from "./paths";

// One place that knows where files live (CRM storage or OneDrive): viewing links, downloads for
// emails / PDFs / AI, and attaching finished OneDrive uploads to a record.

export const BUCKET = "attachments";
const SIGNED_URL_SECONDS = 60 * 60;

/** Viewing links for app paths (see paths.ts), valid about an hour. */
export async function fileUrls(db: SupabaseClient, paths: string[]): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const crm = paths.filter((p) => !isOneDrivePath(p) && !isPendingOneDrive(p));
  const od = paths.filter(isOneDrivePath);
  const pending = paths.filter(isPendingOneDrive);
  if (crm.length) {
    const { data } = await db.storage.from(BUCKET).createSignedUrls(crm, SIGNED_URL_SECONDS);
    for (const s of data ?? []) if (s.path && s.signedUrl) map.set(s.path, s.signedUrl);
  }
  if (od.length || pending.length) {
    // Uploads not attached yet are looked up through their session row.
    const ids = new Map(od.map((p) => [oneDriveId(p), p]));
    if (pending.length) {
      const { data } = await adminDb().from("onedrive_uploads").select("id, item_id").in("id", pending.map(uploadIdOf));
      for (const r of (data ?? []) as { id: string; item_id: string | null }[]) if (r.item_id) ids.set(r.item_id, `od-upload:${r.id}`);
    }
    try {
      const urls = await downloadUrls([...ids.keys()]);
      for (const [id, url] of urls) map.set(ids.get(id)!, url);
    } catch (e) {
      console.error("OneDrive links:", e); // files still show by name if OneDrive is unreachable
    }
  }
  return map;
}

/** A file's bytes, for email attachments, PDFs and reading photos. */
export async function downloadFile(db: SupabaseClient, path: string): Promise<{ bytes: Buffer; mime: string | null } | null> {
  if (isOneDrivePath(path)) return downloadItem(oneDriveId(path));
  if (isPendingOneDrive(path)) {
    const { data } = await adminDb().from("onedrive_uploads").select("item_id").eq("id", uploadIdOf(path)).maybeSingle();
    const id = (data as { item_id: string | null } | null)?.item_id;
    return id ? downloadItem(id) : null;
  }
  const { data } = await db.storage.from(BUCKET).download(path);
  return data ? { bytes: Buffer.from(await data.arrayBuffer()), mime: data.type || null } : null;
}

/**
 * Attach finished OneDrive uploads to a record: check they are this user's, move them into the
 * record's folder and return the attachments rows to insert.
 */
export async function attachOneDriveUploads(t: TableDef, recordId: number, field: string | null, paths: string[], userId: string) {
  if (!paths.length) return [];
  const db = adminDb();
  const ids = paths.map(uploadIdOf);
  const { data } = await db.from("onedrive_uploads").select("*").in("id", ids);
  const rows = (data ?? []) as { id: string; user_id: string; table_name: string; field: string; file_name: string; mime_type: string | null; size_bytes: number; item_id: string | null; status: string }[];
  const folder = await folderFor(t, recordId);
  const out: { provider: "onedrive"; provider_path: string; provider_folder: string; file_name: string; mime_type: string | null; size_bytes: number }[] = [];
  for (const id of ids) {
    const u = rows.find((r) => r.id === id);
    if (!u || u.user_id !== userId || u.table_name !== t.name || u.field !== (field ?? "_files")) throw new Error("Unexpected file");
    if (u.status !== "done" || !u.item_id) throw new Error(`“${u.file_name}” hasn't finished uploading.`);
    const moved = await moveIntoFolder(u.item_id, folder, u.file_name);
    await db.from("onedrive_uploads").update({ status: "attached" }).eq("id", id);
    out.push({ provider: "onedrive", provider_path: moved.id, provider_folder: folder, file_name: u.file_name.slice(0, 200), mime_type: u.mime_type, size_bytes: u.size_bytes });
  }
  return out;
}

/** Confirm a phone finished sending a file: OneDrive must have it, at the expected size. */
export async function confirmUpload(uploadId: string, itemId: string, userId: string): Promise<{ ok: true } | { ok: false; message: string }> {
  const db = adminDb();
  const { data } = await db.from("onedrive_uploads").select("user_id, size_bytes, status").eq("id", uploadId).maybeSingle();
  const u = data as { user_id: string; size_bytes: number; status: string } | null;
  if (!u || u.user_id !== userId) return { ok: false, message: "Upload not found." };
  const item = await getItem(itemId).catch(() => null);
  if (!item || Number(item.size) !== Number(u.size_bytes)) return { ok: false, message: "OneDrive didn't receive the whole file. Try again." };
  await db.from("onedrive_uploads").update({ status: "done", item_id: itemId }).eq("id", uploadId);
  return { ok: true };
}
