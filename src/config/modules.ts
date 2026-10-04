// Main menu and tab order, taken from WebAuthor (SPEC §1.1).
// `tabs` list record types; later milestones attach a registry table to each.

/** `permission` is the key that shows the tab (see scripts/lib/permissions-map.ts). */
export type ModuleTab = { slug: string; title: string; permission: string };
export type ModuleDef = {
  slug: string;
  title: string;
  shortTitle: string; // for the mobile bottom bar
  icon: "calendar" | "folder-kanban" | "briefcase" | "boxes" | "life-buoy" | "clipboard-list";
  tabs: ModuleTab[];
};

const tab = (module: string, slug: string, title: string, resource = slug): ModuleTab => ({
  slug,
  title,
  permission: `${module}.${resource}.view_page`,
});

export const MODULES: ModuleDef[] = [
  {
    // F1 (not in WebAuthor): the calendar is a custom page; Visits is the plain list.
    slug: "schedule",
    title: "Schedule",
    shortTitle: "Schedule",
    icon: "calendar",
    tabs: [tab("schedule", "calendar", "Calendar", "visits"), tab("schedule", "map", "Map", "visits"), tab("schedule", "visits", "Visits")],
  },
  {
    slug: "projects",
    title: "Projects",
    shortTitle: "Projects",
    icon: "folder-kanban",
    tabs: [
      tab("projects", "projects", "Projects"),
      tab("projects", "contacts", "Contacts"),
      tab("projects", "organizations", "Organizations"),
      tab("projects", "buildings", "Buildings / Developments"),
      tab("projects", "permits", "Permits"),
      tab("projects", "punch-list", "Punch List"),
    ],
  },
  {
    slug: "administrative",
    title: "Administrative",
    shortTitle: "Admin",
    icon: "briefcase",
    tabs: [
      tab("administrative", "employees", "Employees"),
      tab("administrative", "payroll", "Payroll"),
      tab("administrative", "transactions", "Transactions"),
      tab("administrative", "vehicles", "Vehicle"),
      tab("administrative", "rma", "RMA"),
      tab("administrative", "tasks", "Tasks"),
    ],
  },
  {
    slug: "inventory",
    title: "Inventory",
    shortTitle: "Inventory",
    icon: "boxes",
    // Inventory Checkout moved here from Administrative and replaces Sale (Fred 2026-10-04, SPEC §9.1 INV-a).
    tabs: [
      tab("inventory", "products", "Product"),
      tab("inventory", "stock", "Stock"),
      tab("inventory", "inventory-checkout", "Inventory Checkout"),
    ],
  },
  {
    // Each FLEX form has its own permissions since SPEC §9.1 M12-b (WebAuthor shared one set, SPEC §7.3).
    slug: "forms",
    // Renamed from WebAuthor's "FLEX Forms" (Fred 2026-09-30): the forms technicians fill in for each job.
    title: "Reports",
    shortTitle: "Reports",
    icon: "clipboard-list",
    tabs: [
      tab("forms", "job-reports", "Job Report"),
      tab("forms", "notes", "Note"),
      tab("forms", "staff-performance", "Staff Performance"),
      tab("forms", "survey-and-proposals", "Survey and Proposals"),
      tab("forms", "tv-installations", "TV Installation"),
    ],
  },
];

export function findModule(slug: string) {
  return MODULES.find((m) => m.slug === slug);
}

/** Modules and tabs a user may see, given their permission keys. Modules with no visible tab are dropped. */
export function visibleModules(permissions: ReadonlySet<string>): ModuleDef[] {
  return MODULES.map((m) => ({ ...m, tabs: m.tabs.filter((t) => permissions.has(t.permission)) })).filter(
    (m) => m.tabs.length > 0,
  );
}
