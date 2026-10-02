import { requireUser } from "@/lib/auth/session";
import { visibleModules } from "@/config/modules";
import { BottomNav, ModuleTabsBar, Sidebar, TopBar, type CreateItem, type Extras, type Me, type NavItem } from "@/components/shell/nav";
import { ADMIN_SCREENS, canSeeScreen } from "@/lib/admin/screens";
import { getTable } from "@/registry";
import { canDo, canOpen } from "@/registry/permissions";
import { tableHref } from "@/registry/routes";
import { getT } from "@/i18n/server";

// What the Create button offers, most used first (only tables the person may add to).
// Names are our own: WebAuthor's item labels are vague here ("Record", "Item").
const CREATE: [table: string, label: string][] = [
  ["visits", "Visit"],
  ["job_reports", "Job Report"],
  ["projects", "Project"],
  ["punch_list_items", "Punch Item"],
  ["tasks", "Task"],
  ["contacts", "Contact"],
  ["tv_installations", "TV Install"],
];

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const user = await requireUser();
  const t = await getT();
  const navItems: NavItem[] = visibleModules(user.permissions).map((m) => ({
    slug: m.slug,
    href: `/${m.slug}`,
    title: t(m.title),
    shortTitle: t(m.shortTitle),
    icon: m.icon,
    tabs: m.tabs.map((tb) => ({ href: `/${m.slug}/${tb.slug}`, title: t(tb.title) })),
  }));
  const create: CreateItem[] = CREATE.map(([n, label]) => ({ table: getTable(n), label }))
    .filter(({ table }) => canDo(user.permissions, table, "create", getTable))
    .map(({ table, label }) => ({ href: `${tableHref(table)}/new`, label: t(label), icon: table.tab ?? table.name }));
  const opens = (name: string) => canOpen(user.permissions, getTable(name), getTable);
  const extras: Extras = { tasks: opens("tasks"), pipeline: opens("projects"), insights: user.permissions.has("insights.page.view"), data: opens("contacts") };
  const showAdmin = ADMIN_SCREENS.some((s) => canSeeScreen(s, user.permissions, user.isSysadmin));
  const name = [user.firstName, user.lastName].filter(Boolean).join(" ") || user.email;
  const me: Me = {
    name,
    email: user.email,
    initials: (user.firstName && user.lastName ? user.firstName[0] + user.lastName[0] : name.slice(0, 2)).toUpperCase(),
  };

  return (
    <div className="flex min-h-dvh">
      <Sidebar items={navItems} create={create} me={me} showAdmin={showAdmin} extras={extras} />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar me={me} />
        <ModuleTabsBar items={navItems} />
        {/* pb-28 keeps content clear of the mobile bottom bar and its + button */}
        <main className="min-w-0 flex-1 px-3.5 pt-4 pb-28 md:px-7 md:pt-6 md:pb-10">{children}</main>
      </div>
      <BottomNav items={navItems} create={create} showAdmin={showAdmin} extras={extras} />
    </div>
  );
}
