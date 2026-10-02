// The admin screens (PLAN M12) and who sees each. Keys are permissions from the checklist
// (src/lib/permissions/checklist.ts); "sysadmin" means administrators only.
export type AdminScreen = { href: string; title: string; description: string; anyOf: string[] | "sysadmin" };

export const ADMIN_SCREENS: AdminScreen[] = [
  { href: "/admin/users", title: "Users", description: "Invite people, edit names, deactivate logins, set what each person may do", anyOf: ["site.admin.members", "site.admin.add_new_member"] },
  { href: "/admin/forms", title: "Form settings", description: "Labels, dropdown options, required fields, order and help text", anyOf: ["projects.module.design_design"] },
  { href: "/admin/onedrive", title: "OneDrive", description: "Where photos, videos and files are stored", anyOf: "sysadmin" },
  { href: "/admin/bouncie", title: "Bouncie", description: "Live vehicle positions on the Schedule map", anyOf: "sysadmin" },
  { href: "/admin/field-day", title: "Field day", description: "Who gets return cards, when they're due, checklists and tools per service type", anyOf: ["projects.module.design_design"] },
  { href: "/admin/messages", title: "Messages", description: "Texts sent to clients (follow-ups, visit confirmations…) in English, Português and Español", anyOf: ["projects.module.design_design"] },
  { href: "/admin/automations", title: "Automations", description: "What runs when records change, the run log and sent emails", anyOf: ["projects.module.design_triggers"] },
  { href: "/admin/catalogue", title: "Field catalogue", description: "Every table, field and rule, read-only", anyOf: ["projects.module.design_design"] },
];

export function canSeeScreen(s: AdminScreen, perms: ReadonlySet<string>, sysadmin: boolean) {
  return s.anyOf === "sysadmin" ? sysadmin : s.anyOf.some((k) => perms.has(k));
}
