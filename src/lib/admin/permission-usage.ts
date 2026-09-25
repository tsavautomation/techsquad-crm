import { MODULES } from "@/config/modules";
import { ADMIN_SCREENS } from "@/lib/admin/screens";
import type { ModuleAction } from "@/lib/records/extras";
import { REGISTRY } from "@/registry";
import { lockResource, permissionResource, UTILITY_KEYS, type LockAction, type RecordAction } from "@/registry/permissions";

// Which of WebAuthor's 538 permission keys actually do something in this app. The rest
// (Binders, WIKI, Onboarding, impersonation, email broadcast …) belong to WebAuthor features
// that were not carried over; the permission screen shows them apart so nobody hunts for their effect.

const RECORD_ACTIONS: RecordAction[] = ["view_page", "view_all", "create", "modify", "delete", "archive"];
const LOCK_ACTIONS: LockAction[] = ["modify_locked", "lock_unlock", "delete_locked"];
const MODULE_ACTIONS: ModuleAction[] = [
  "activity_history_view",
  "activity_history_add",
  "notes_allow_delete",
  "notes_allow_delete_of_my_notes",
  "files_view_files_pod",
  "files_add_new",
  "files_allow_delete",
  "audit_log",
  "deleted_items",
];
const OTHER = ["site.admin.members", "site.admin.add_new_member", "site.admin.groups", "projects.module.design_design", "projects.module.design_triggers"];

export function usedPermissionKeys(): Set<string> {
  const keys = new Set<string>([...UTILITY_KEYS, ...OTHER]);
  for (const t of REGISTRY) {
    const res = permissionResource(t);
    if (res) for (const a of RECORD_ACTIONS) keys.add(`${t.module}.${res}.${a}`);
    const lock = lockResource(t);
    if (lock) for (const a of LOCK_ACTIONS) keys.add(`${t.module}.${lock}.${a}`);
  }
  for (const m of MODULES) {
    for (const tab of m.tabs) keys.add(tab.permission);
    for (const a of MODULE_ACTIONS) keys.add(`${m.slug}.module.${a}`);
  }
  for (const s of ADMIN_SCREENS) if (Array.isArray(s.anyOf)) for (const k of s.anyOf) keys.add(k);
  return keys;
}
