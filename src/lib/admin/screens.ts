// The admin screens (PLAN M12) and who sees each. Keys are WebAuthor permissions (SPEC §7);
// "sysadmin" means System Administrators only.
export type AdminScreen = { href: string; title: string; description: string; anyOf: string[] | "sysadmin" };

export const ADMIN_SCREENS: AdminScreen[] = [
  { href: "/admin/users", title: "Users", description: "Invite people, edit names, deactivate logins, choose groups", anyOf: ["site.admin.members", "site.admin.add_new_member"] },
  { href: "/admin/groups", title: "Groups", description: "Create and rename groups, see who is in each", anyOf: ["site.admin.groups"] },
  { href: "/admin/permissions", title: "Permissions", description: "What each group may see and do", anyOf: "sysadmin" },
  { href: "/admin/forms", title: "Form settings", description: "Labels, dropdown options, required fields, order and help text", anyOf: ["projects.module.design_design"] },
  { href: "/admin/automations", title: "Automations", description: "What runs when records change, the run log and sent emails", anyOf: ["projects.module.design_triggers"] },
  { href: "/admin/catalogue", title: "Field catalogue", description: "Every table, field and rule, read-only", anyOf: ["projects.module.design_design"] },
];

export function canSeeScreen(s: AdminScreen, perms: ReadonlySet<string>, sysadmin: boolean) {
  return s.anyOf === "sysadmin" ? sysadmin : s.anyOf.some((k) => perms.has(k));
}
