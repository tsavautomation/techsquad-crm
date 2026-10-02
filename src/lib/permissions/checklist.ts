// Per-person permission checklist (SPEC §9.1 P1, Fred 2026-10-02): the short list of what someone may
// do, built from the modules and the registry so the screens, the RLS keys and the seed stay in step.
// The keys are the ones app.has_permission() checks in the database; nothing else is granted.
import { MODULES } from "@/config/modules";
import { lockResource, UTILITY_KEYS } from "@/registry/permissions";
import { REGISTRY } from "@/registry";

export type ChecklistItem = { key: string; label: string };
export type ChecklistRow = { id: string; title: string; items: ChecklistItem[] };
/** "grid" sections share the record-action columns; "list" sections are plain checkboxes. */
export type ChecklistSection = { id: string; title: string; kind: "grid" | "list"; rows: ChecklistRow[] };

export const RECORD_COLUMNS = [
  ["view_page", "View"],
  ["view_all", "View all"],
  ["create", "Create"],
  ["modify", "Edit"],
  ["delete", "Delete"],
  ["archive", "Archive"],
] as const;

const LOCK_ITEMS = [
  ["lock_unlock", "Lock / unlock records"],
  ["modify_locked", "Edit locked records"],
  ["delete_locked", "Delete locked records"],
] as const;

const MODULE_ITEMS = [
  ["files_view_files_pod", "See files"],
  ["files_add_new", "Add files"],
  ["files_allow_delete", "Delete files"],
  ["notes_allow_delete_of_my_notes", "Delete own notes"],
  ["notes_allow_delete", "Delete any note"],
  ["activity_history_view", "See history"],
  ["activity_history_add", "Add history entries"],
  ["audit_log", "See the audit log"],
  ["deleted_items", "Restore deleted records"],
  ["options_utility_tables", "Manage dropdown lists"],
] as const;

export const WORKFLOW_ITEMS: ChecklistItem[] = [
  { key: "workflow.project_proposal.act", label: "Move projects through the pipeline" },
  { key: "workflow.punch_list.act", label: "Change punch list status" },
  { key: "workflow.stock_status.act", label: "Change stock status" },
];

export const ADMIN_ITEMS: ChecklistItem[] = [
  { key: "site.admin.add_new_member", label: "Invite people" },
  { key: "site.admin.members", label: "Edit users and deactivate logins" },
  { key: "projects.module.design_design", label: "Form settings, field day, messages and the field catalogue" },
  { key: "projects.module.design_triggers", label: "Automations" },
];

/** The checklist, one grid section per module (its lists) plus a list of extras, then workflows and admin. */
export function checklist(): ChecklistSection[] {
  const out: ChecklistSection[] = [];
  for (const m of MODULES) {
    const rows: ChecklistRow[] = [];
    const seen = new Set<string>();
    for (const tab of m.tabs) {
      const resource = tab.permission.replace(/^.*?\.(.*)\.view_page$/, "$1");
      if (seen.has(resource)) {
        rows[rows.length - 1].title = `${rows[rows.length - 1].title} and ${tab.title.toLowerCase()}`;
        continue;
      }
      seen.add(resource);
      rows.push({ id: `${m.slug}.${resource}`, title: tab.title, items: RECORD_COLUMNS.map(([a, label]) => ({ key: `${m.slug}.${resource}.${a}`, label })) });
    }
    out.push({ id: m.slug, title: m.title, kind: "grid", rows });

    const extras: ChecklistItem[] = [];
    const lock = REGISTRY.filter((t) => t.module === m.slug && !t.parent).map((t) => lockResource(t)).find(Boolean);
    if (lock) extras.push(...LOCK_ITEMS.map(([a, label]) => ({ key: `${m.slug}.${lock}.${a}`, label })));
    extras.push(...MODULE_ITEMS.map(([a, label]) => ({ key: `${m.slug}.module.${a}`, label })));
    out.push({ id: `${m.slug}-more`, title: `${m.title}: more`, kind: "list", rows: [{ id: `${m.slug}.more`, title: "", items: extras }] });
  }
  out.push({ id: "workflows", title: "Workflows", kind: "list", rows: [{ id: "workflows", title: "", items: WORKFLOW_ITEMS }] });
  out.push({ id: "admin", title: "Admin", kind: "list", rows: [{ id: "admin", title: "", items: ADMIN_ITEMS }] });
  return out;
}

/** Every key the checklist can grant (the keys this app checks). */
export function checklistKeys(): Set<string> {
  const keys = new Set<string>(UTILITY_KEYS);
  for (const s of checklist()) for (const r of s.rows) for (const i of r.items) keys.add(i.key);
  return keys;
}

/** Keep only the checklist items the database catalogue knows (the FK target); the rest would fail to save. */
export function availableChecklist(catalogue: ReadonlySet<string>): ChecklistSection[] {
  return checklist()
    .map((s) => ({ ...s, rows: s.rows.map((r) => ({ ...r, items: r.items.filter((i) => catalogue.has(i.key)) })).filter((r) => r.items.length) }))
    .filter((s) => s.rows.length);
}
