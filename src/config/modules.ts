// Main menu and tab order, taken from WebAuthor (SPEC §1.1).
// `tabs` list record types; later milestones attach a registry table to each.

/** `permission` is the key that shows the tab (see scripts/lib/permissions-map.ts). */
export type ModuleTab = { slug: string; title: string; permission: string };
export type ModuleDef = {
  slug: string;
  title: string;
  shortTitle: string; // for the mobile bottom bar
  icon: "folder-kanban" | "briefcase" | "boxes" | "life-buoy" | "clipboard-list";
  tabs: ModuleTab[];
};

const tab = (module: string, slug: string, title: string, resource = slug): ModuleTab => ({
  slug,
  title,
  permission: `${module}.${resource}.view_page`,
});

export const MODULES: ModuleDef[] = [
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
      tab("administrative", "inventory-checkout", "Inventory Checkout"),
    ],
  },
  {
    slug: "inventory",
    title: "Inventory",
    shortTitle: "Inventory",
    icon: "boxes",
    tabs: [
      tab("inventory", "products", "Product"),
      tab("inventory", "stock", "Stock"),
      tab("inventory", "sales", "Sale"),
    ],
  },
  {
    slug: "help-desk",
    title: "TS Help Desk",
    shortTitle: "Help Desk",
    icon: "life-buoy",
    tabs: [tab("help-desk", "tickets", "Tickets"), tab("help-desk", "articles", "Articles")],
  },
  {
    // All five FLEX forms share the module-level FLEX Forms permissions (SPEC §7.3).
    slug: "forms",
    title: "FLEX Forms",
    shortTitle: "Forms",
    icon: "clipboard-list",
    tabs: [
      tab("forms", "job-reports", "Job Report", "records"),
      tab("forms", "notes", "Note", "records"),
      tab("forms", "staff-performance", "Staff Performance", "records"),
      tab("forms", "survey-and-proposals", "Survey and Proposals", "records"),
      tab("forms", "tv-installations", "TV Installation", "records"),
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
