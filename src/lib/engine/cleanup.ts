import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { deleteItem, oneDriveReady } from "@/lib/files/onedrive";
import { BUCKET } from "@/lib/records/relations";

// Files are uploaded straight from the phone before the record is saved (CLAUDE.md "Files").
// If the form is abandoned, the upload has no attachments row. After two days it is removed.
// Files of deleted records or removed attachments are kept (they can be restored).

const ORPHAN_HOURS = 48;

export async function cleanupOrphanUploads(db: SupabaseClient): Promise<{ removed: number; oneDriveRemoved: number }> {
  const { data, error } = await db.rpc("orphan_uploads", { p_hours: ORPHAN_HOURS });
  if (error) throw new Error(`orphan_uploads: ${error.message}`);
  const paths = ((data ?? []) as { name: string }[]).map((r) => r.name);
  let removed = 0;
  for (let i = 0; i < paths.length; i += 100) {
    const { data: gone, error: rmError } = await db.storage.from(BUCKET).remove(paths.slice(i, i + 100));
    if (rmError) throw new Error(`storage remove: ${rmError.message}`);
    removed += gone?.length ?? 0;
  }
  return { removed, ...(await cleanupOneDriveUploads(db)) };
}

/** OneDrive uploads never attached to a record (form abandoned) after 48 hours: delete them from OneDrive. */
async function cleanupOneDriveUploads(db: SupabaseClient): Promise<{ oneDriveRemoved: number }> {
  if (!(await oneDriveReady())) return { oneDriveRemoved: 0 };
  const cutoff = new Date(Date.now() - ORPHAN_HOURS * 3_600_000).toISOString();
  const { data } = await db.from("onedrive_uploads").select("id, item_id").in("status", ["open", "done"]).lt("created_at", cutoff).limit(200);
  let n = 0;
  for (const u of (data ?? []) as { id: string; item_id: string | null }[]) {
    if (u.item_id) await deleteItem(u.item_id).catch(() => undefined);
    await db.from("onedrive_uploads").update({ status: "abandoned" }).eq("id", u.id);
    n++;
  }
  return { oneDriveRemoved: n };
}
