// Main menu and tab order, taken from WebAuthor (SPEC §1.1).
// `tabs` list record types; later milestones attach a registry table to each.

export type ModuleTab = { slug: string; title: string };
export type ModuleDef = {
  slug: string;
  title: string;
  shortTitle: string; // for the mobile bottom bar
  icon: "folder-kanban" | "briefcase" | "boxes" | "life-buoy" | "clipboard-list";
  tabs: ModuleTab[];
};

export const MODULES: ModuleDef[] = [
  {
    slug: "projects",
    title: "Projects",
    shortTitle: "Projects",
    icon: "folder-kanban",
    tabs: [
      { slug: "projects", title: "Projects" },
      { slug: "contacts", title: "Contacts" },
      { slug: "organizations", title: "Organizations" },
      { slug: "buildings", title: "Buildings / Developments" },
      { slug: "permits", title: "Permits" },
      { slug: "punch-list", title: "Punch List" },
    ],
  },
  {
    slug: "administrative",
    title: "Administrative",
    shortTitle: "Admin",
    icon: "briefcase",
    tabs: [
      { slug: "employees", title: "Employees" },
      { slug: "payroll", title: "Payroll" },
      { slug: "transactions", title: "Transactions" },
      { slug: "vehicles", title: "Vehicle" },
      { slug: "rma", title: "RMA" },
      { slug: "tasks", title: "Tasks" },
      { slug: "inventory-checkout", title: "Inventory Checkout" },
    ],
  },
  {
    slug: "inventory",
    title: "Inventory",
    shortTitle: "Inventory",
    icon: "boxes",
    tabs: [
      { slug: "products", title: "Product" },
      { slug: "stock", title: "Stock" },
      { slug: "sales", title: "Sale" },
    ],
  },
  {
    slug: "help-desk",
    title: "TS Help Desk",
    shortTitle: "Help Desk",
    icon: "life-buoy",
    tabs: [
      { slug: "tickets", title: "Tickets" },
      { slug: "articles", title: "Articles" },
    ],
  },
  {
    slug: "forms",
    title: "FLEX Forms",
    shortTitle: "Forms",
    icon: "clipboard-list",
    tabs: [
      { slug: "job-reports", title: "Job Report" },
      { slug: "notes", title: "Note" },
      { slug: "staff-performance", title: "Staff Performance" },
      { slug: "survey-and-proposals", title: "Survey and Proposals" },
      { slug: "tv-installations", title: "TV Installation" },
    ],
  },
];

export function findModule(slug: string) {
  return MODULES.find((m) => m.slug === slug);
}
