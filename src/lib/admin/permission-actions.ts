"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/session";
import { recordsDb } from "@/lib/records/data";
import type { ActionResult } from "@/lib/records/record-actions";

/**
 * Apply a group's permission changes (PLAN M12). System Administrators only; the database
 * policy on group_permissions enforces the same. Returns how many grants were added / removed.
 */
export async function saveGroupPermissionsAction(groupId: number, add: string[], remove: string[]): Promise<ActionResult & { added?: number; removed?: number }> {
  const me = await requireUser();
  if (!me.isSysadmin) return { ok: false, message: "Only System Administrators can change permissions." };
  const db = await recordsDb();
  const { data: group } = await db.from("groups").select("slug").eq("id", groupId).maybeSingle();
  if (!group) return { ok: false, message: "Group not found." };
  if (group.slug === "system_administrators") return { ok: false, message: "System Administrators always have every permission." };

  let added = 0;
  let removed = 0;
  if (add.length) {
    const { data, error } = await db
      .from("group_permissions")
      .upsert(
        add.map((permission_key) => ({ group_id: groupId, permission_key })),
        { onConflict: "group_id,permission_key", ignoreDuplicates: true },
      )
      .select("permission_key");
    if (error) return { ok: false, message: error.message };
    added = data?.length ?? 0;
  }
  if (remove.length) {
    const { data, error } = await db.from("group_permissions").delete().eq("group_id", groupId).in("permission_key", remove).select("permission_key");
    if (error) return { ok: false, message: error.message };
    removed = data?.length ?? 0;
  }
  revalidatePath("/admin/permissions");
  revalidatePath("/", "layout"); // menus depend on permissions
  return { ok: true, added, removed };
}
