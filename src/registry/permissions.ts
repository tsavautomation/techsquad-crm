// Which permission keys protect a registry table. Mirrors app.perm_key(),
// app.can_do() etc. in the database (M4) so the UI shows exactly what RLS allows.
import type { TableDef } from "./types";

export type RecordAction = "view_page" | "view_all" | "create" | "modify" | "delete" | "archive";
export type LockAction = "modify_locked" | "lock_unlock" | "delete_locked";

/**
 * Permission resource protecting a table: the tab slug for most, `records` for the
 * five FLEX forms (they share permissions), none for child tables (they use the
 * parent's) and utility lists (special rule).
 */
export function permissionResource(t: TableDef): string | null {
  if (t.parent) return null;
  if (t.module === "forms") return "records";
  return t.tab ?? null;
}

const LOCK_RESOURCE: Record<string, string> = {
  projects: "projects",
  administrative: "records",
  inventory: "products",
  "help-desk": "tickets",
  forms: "records",
};

/** Resource holding a module's "Records: Modify Locked / Lock/Unlock / Delete Locked" permissions. */
export function lockResource(t: TableDef): string | null {
  return t.parent ? null : (LOCK_RESOURCE[t.module] ?? null);
}

export const UTILITY_KEYS = [
  "projects.module.options_utility_tables",
  "administrative.module.options_utility_tables",
  "inventory.module.options_utility_tables",
  "help-desk.module.options_utility_tables",
];

export const isUtility = (t: TableDef) => t.module === "utility";

type Lookup = (name: string) => TableDef;

/** Mirrors app.can_do(): may the user perform `action` on records of table `t`? */
export function canDo(perms: ReadonlySet<string>, t: TableDef, action: RecordAction, getTable: Lookup): boolean {
  if (isUtility(t)) {
    if (action === "view_page" || action === "view_all") return true;
    return UTILITY_KEYS.some((k) => perms.has(k));
  }
  if (t.parent) {
    const parent = getTable(t.parent.table);
    if (action === "view_page" || action === "view_all") return canDo(perms, parent, action, getTable);
    // Adding/removing sub-grid rows counts as modifying the parent.
    return canDo(perms, parent, "modify", getTable);
  }
  const resource = permissionResource(t);
  return resource ? perms.has(`${t.module}.${resource}.${action}`) : false;
}

/** Mirrors app.can_lock_action(). */
export function canLockAction(perms: ReadonlySet<string>, t: TableDef, action: LockAction, getTable: Lookup): boolean {
  if (t.parent) return canLockAction(perms, getTable(t.parent.table), action, getTable);
  const resource = lockResource(t);
  return resource ? perms.has(`${t.module}.${resource}.${action}`) : false;
}

/** Can the user open the table's list at all (own records at least)? */
export function canOpen(perms: ReadonlySet<string>, t: TableDef, getTable: Lookup) {
  return canDo(perms, t, "view_page", getTable) || canDo(perms, t, "view_all", getTable);
}
