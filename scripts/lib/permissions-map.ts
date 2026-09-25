/**
 * Turns the WebAuthor permission export (techsquad_crm_spec.json) into
 * normalised permission keys + group grants. Used by the seed generator and
 * by tests, so the mapping is defined once. See SPEC.md §7.
 *
 * Key format: `<module>.<resource>.<action>`, e.g. `projects.contacts.create`.
 */

export type GroupDef = { slug: string; name: string; legacyCode: string | null; isSystem: boolean };

// The 12 WebAuthor groups (SPEC §7.2). `slug` is our stable identifier.
export const GROUPS: GroupDef[] = [
  { slug: "system_administrators", name: "System Administrators", legacyCode: "SYSADMIN", isSystem: true },
  { slug: "everyone", name: "Everyone", legacyCode: "EVERYONE", isSystem: true },
  { slug: "accounting", name: "Accounting", legacyCode: "ACCOUNTING", isSystem: false },
  { slug: "admin", name: "Admin", legacyCode: null, isSystem: false },
  { slug: "office_management", name: "Office Management", legacyCode: "OFFICE MGMT", isSystem: false },
  { slug: "coo", name: "COO", legacyCode: "OPERATIONS", isSystem: false },
  { slug: "technician", name: "Technician", legacyCode: "TECHNICIAN", isSystem: false },
  { slug: "project_manager", name: "Project Manager", legacyCode: "PROJECT MANAGER", isSystem: false },
  { slug: "treasurer", name: "Treasurer", legacyCode: "TREASURER", isSystem: false },
  { slug: "test", name: "Test", legacyCode: "Test", isSystem: false },
  { slug: "electrical_department", name: "Electrical Department", legacyCode: "ELECTRICAL", isSystem: false },
  { slug: "lv_department", name: "LV Department", legacyCode: "LOW VOLTAGE", isSystem: false },
];

const GROUP_BY_NAME = new Map(GROUPS.map((g) => [g.name, g.slug]));

// The app-menu export identifies groups by WebAuthor internal IDs. These were
// matched against the name-based module export (identical grant sets).
const GROUP_BY_WEBAUTHOR_ID: Record<string, string> = {
  group_14865: "system_administrators",
  group_14866: "everyone",
  group_14880: "accounting",
  group_14881: "admin",
  group_14885: "office_management",
  group_14886: "coo",
  group_14887: "technician",
  group_14888: "project_manager",
  group_14905: "treasurer",
  group_14906: "test",
};

export type PermissionRow = {
  key: string;
  module: string;
  resource: string;
  action: string;
  kind: "page" | "action" | "pod";
  area: string;
  label: string;
  description: string;
  groups: string[]; // group slugs
};

const MODULE_BY_TABLE: Record<string, string> = {
  fx_techsquad_projects: "projects",
  fx_techsquad_employee: "administrative",
  fx_techsquad_inventory: "inventory",
  fx_techsquad_help_desk: "help-desk",
};

/** Record-type areas → our resource slugs (match the tab slugs in src/config/modules.ts). */
const RESOURCE_BY_AREA: Record<string, Record<string, string>> = {
  projects: {
    Buildings: "buildings",
    Contacts: "contacts",
    Organizations: "organizations",
    Permits: "permits",
    "Punch List": "punch-list",
  },
  administrative: {
    Employees: "employees",
    Fleet: "vehicles",
    Tasks: "tasks",
    RMA: "rma",
    "Pay-ins": "transactions",
    Payouts: "payroll",
    "Inventory Checkout": "inventory-checkout",
    Onboarding: "onboarding",
  },
  inventory: { Stock: "stock", Sale: "sales", "Return / RMA": "returns" },
  "help-desk": { Articles: "articles" },
};

/**
 * The module's "Records (…)" page and "Records: …" actions apply to its main
 * table. Administrative has an explicit Employees area, so its generic records
 * permissions are kept under `records` and not merged into employees.
 */
const MAIN_RESOURCE: Record<string, string> = {
  projects: "projects",
  administrative: "records",
  inventory: "products",
  "help-desk": "tickets",
  forms: "records",
};

const RECORD_VERBS: Record<string, string> = {
  "Archive Records": "archive",
  "Create Records": "create",
  "Delete Records": "delete",
  "Form Designer": "form_designer",
  "Import Records": "import",
  "Modify Records": "modify",
  "View All Records": "view_all",
};

const GENERIC_RECORD_ACTIONS: Record<string, string> = {
  "Records: Add": "create",
  "Add Records": "create",
  "Records: Modify": "modify",
  "Modify Records": "modify",
  "Records: Delete": "delete",
  "Delete Records": "delete",
  "Records: View All": "view_all",
  "Records: View All in My Organization": "view_all_org",
  "Records: Archive": "archive",
  "Records: Import": "import",
  "Records: Delete Locked": "delete_locked",
  "Records: Modify Locked": "modify_locked",
  "Records: Lock/Unlock Records": "lock_unlock",
  "Records: Bulk Move WF Level": "bulk_move_wf",
  "View Records": "view_page",
};

export function slugify(s: string) {
  return s
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
}

type Mapped = { resource: string; action: string };

function mapItem(module: string, area: string, type: string, item: string): Mapped {
  const resources = RESOURCE_BY_AREA[module] ?? {};
  const resource = resources[area];
  if (resource) {
    if (type === "Pages") return { resource, action: "view_page" };
    const verb = item.slice(item.indexOf(":") + 1).trim();
    const action = RECORD_VERBS[verb];
    if (action) return { resource, action };
  }
  if (/^Records \(.+\)$/.test(item) && type === "Pages") {
    return { resource: MAIN_RESOURCE[module], action: "view_page" };
  }
  const generic = GENERIC_RECORD_ACTIONS[item];
  if (generic && MAIN_RESOURCE[module]) return { resource: MAIN_RESOURCE[module], action: generic };

  // Everything else is a module-level capability (dashboard, grid tools, setup pages, pods…).
  const prefix = type === "Pods" ? "pod" : area === "View" ? "" : slugify(area);
  return { resource: "module", action: [prefix, slugify(item)].filter(Boolean).join("_") };
}

function kindOf(type: string): PermissionRow["kind"] {
  return type === "Pages" ? "page" : type === "Pods" ? "pod" : "action";
}

type SpecJson = {
  module_permissions: Record<
    string,
    {
      rows?: { area: string; type: string; item: string; desc: string; granted: string[] }[];
    }
  >;
  app_menu_permissions: {
    rows: ({ module: string; type: string; area: string; title: string; description?: string } & Record<
      string,
      unknown
    >)[];
  };
};

/** Platform menus from the app-menu export that we carry over (WebAuthor vendor Support is dropped). */
const APP_MENU_MODULES: Record<string, { module: string; resource: string | null }> = {
  "FLEX Forms": { module: "forms", resource: null }, // uses FORMS mapping below
  Admin: { module: "site", resource: "admin" },
  Files: { module: "files", resource: "library" },
  "My Profile": { module: "site", resource: "profile" },
};

/**
 * Keys held by a user in `groupSlugs` — mirrors public.my_permissions() in SQL:
 * everyone is implicit, system administrators hold every key.
 */
export function effectivePermissions(rows: PermissionRow[], groupSlugs: string[]): Set<string> {
  if (groupSlugs.includes("system_administrators")) return new Set(rows.map((r) => r.key));
  const held = new Set([...groupSlugs, "everyone"]);
  return new Set(rows.filter((r) => r.groups.some((g) => held.has(g))).map((r) => r.key));
}

export function buildPermissions(spec: SpecJson): PermissionRow[] {
  const rows = new Map<string, PermissionRow>();

  const add = (row: PermissionRow) => {
    const existing = rows.get(row.key);
    if (existing) {
      // Same key produced twice (rare): union the grants.
      existing.groups = [...new Set([...existing.groups, ...row.groups])];
      return;
    }
    rows.set(row.key, row);
  };

  for (const [table, perms] of Object.entries(spec.module_permissions)) {
    const mod = MODULE_BY_TABLE[table];
    if (!mod || !perms.rows) continue;
    for (const r of perms.rows) {
      const { resource, action } = mapItem(mod, r.area, r.type, r.item);
      add({
        key: `${mod}.${resource}.${action}`,
        module: mod,
        resource,
        action,
        kind: kindOf(r.type),
        area: r.area,
        label: r.item,
        description: r.desc ?? "",
        groups: r.granted.map((g) => {
          const slug = GROUP_BY_NAME.get(g);
          if (!slug) throw new Error(`Unknown group "${g}"`);
          return slug;
        }),
      });
    }
  }

  for (const r of spec.app_menu_permissions.rows) {
    const target = APP_MENU_MODULES[r.module];
    if (!target) continue;
    let resource: string;
    let action: string;
    if (target.module === "forms") {
      ({ resource, action } = mapItem("forms", r.area, r.type, r.title));
    } else {
      resource = target.resource!;
      action = [r.area === "Global" ? "" : slugify(r.area), slugify(r.title)].filter(Boolean).join("_");
    }
    const groups = Object.entries(r)
      .filter(([k, v]) => k in GROUP_BY_WEBAUTHOR_ID && Boolean(v))
      .map(([k]) => GROUP_BY_WEBAUTHOR_ID[k]);
    add({
      key: `${target.module}.${resource}.${action}`,
      module: target.module,
      resource,
      action,
      kind: kindOf(r.type),
      area: r.area,
      label: r.title,
      description: typeof r.description === "string" ? r.description : "",
      groups,
    });
  }

  return [...rows.values()].sort((a, b) => a.key.localeCompare(b.key));
}
