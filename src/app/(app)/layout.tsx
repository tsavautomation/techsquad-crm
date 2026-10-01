import { requireUser } from "@/lib/auth/session";
import { visibleModules } from "@/config/modules";
import { BottomNav, ModuleTabsBar, Sidebar, TopBar, type CreateItem, type Extras, type Me, type NavItem } from "@/components/shell/nav";
import { ADMIN_SCREENS, canSeeScreen } from "@/lib/admin/screens";
import { getTable } from "@/registry";
import { canDo, canOpen } from "@/registry/permissions";
import { tableHref } from "@/registry/routes";

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
  const navItems: NavItem[] = visibleModules(user.permissions).map((m) => ({
    slug: m.slug,
    href: `/${m.slug}`,
    title: m.title,
    shortTitle: m.shortTitle,
    icon: m.icon,
    tabs: m.tabs.map((t) => ({ href: `/${m.slug}/${t.slug}`, title: t.title })),
  }));
  const create: CreateItem[] = CREATE.map(([n, label]) => ({ t: getTable(n), label }))
    .filter(({ t }) => canDo(user.permissions, t, "create", getTable))
    .map(({ t, label }) => ({ href: `${tableHref(t)}/new`, label, icon: t.tab ?? t.name }));
  const opens = (t: string) => canOpen(user.permissions, getTable(t), getTable);
  const extras: Extras = { tasks: opens("tasks"), insights: opens("projects"), data: opens("contacts") };
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
