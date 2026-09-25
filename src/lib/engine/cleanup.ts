import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { BUCKET } from "@/lib/records/relations";

// Files are uploaded straight from the phone before the record is saved (CLAUDE.md "Files").
// If the form is abandoned, the upload has no attachments row. After two days it is removed.
// Files of deleted records or removed attachments are kept (they can be restored).

const ORPHAN_HOURS = 48;

export async function cleanupOrphanUploads(db: SupabaseClient): Promise<{ removed: number }> {
  const { data, error } = await db.rpc("orphan_uploads", { p_hours: ORPHAN_HOURS });
  if (error) throw new Error(`orphan_uploads: ${error.message}`);
  const paths = ((data ?? []) as { name: string }[]).map((r) => r.name);
  let removed = 0;
  for (let i = 0; i < paths.length; i += 100) {
    const { data: gone, error: rmError } = await db.storage.from(BUCKET).remove(paths.slice(i, i + 100));
    if (rmError) throw new Error(`storage remove: ${rmError.message}`);
    removed += gone?.length ?? 0;
  }
  return { removed };
}
