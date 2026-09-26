import Link from "next/link";
import { requireUser } from "@/lib/auth/session";
import { visibleModules } from "@/config/modules";
import { BottomNav, ModuleTabsBar, Sidebar, type NavItem } from "@/components/shell/nav";
import { ThemeToggle } from "@/components/shell/theme-toggle";
import { Button } from "@/components/ui/button";
import { Settings } from "lucide-react";
import { ADMIN_SCREENS, canSeeScreen } from "@/lib/admin/screens";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const user = await requireUser();
  const navItems: NavItem[] = visibleModules(user.permissions).map((m) => ({
    href: `/${m.slug}`,
    title: m.title,
    shortTitle: m.shortTitle,
    icon: m.icon,
    tabs: m.tabs.map((t) => ({ href: `/${m.slug}/${t.slug}`, title: t.title })),
  }));
  const showAdmin = ADMIN_SCREENS.some((s) => canSeeScreen(s, user.permissions, user.isSysadmin));
  const displayName = [user.firstName, user.lastName].filter(Boolean).join(" ") || user.email;

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b bg-background px-4 pt-[env(safe-area-inset-top)]">
        <Link href="/" className="font-semibold tracking-tight">
          TechSquad CRM
        </Link>
        <div className="flex items-center gap-3">
          <span className="hidden text-sm text-muted-foreground sm:inline">{displayName}</span>
          <ThemeToggle />
          {showAdmin && (
            <Link href="/admin" aria-label="Admin" title="Admin" className="inline-flex size-10 items-center justify-center rounded-lg hover:bg-muted">
              <Settings className="size-5" aria-hidden />
            </Link>
          )}
          <form action="/auth/signout" method="post">
            <Button type="submit" variant="outline" size="sm">
              Sign out
            </Button>
          </form>
        </div>
      </header>
      <ModuleTabsBar items={navItems} />
      <div className="flex flex-1">
        <Sidebar items={navItems} />
        {/* pb-20 keeps content clear of the mobile bottom bar */}
        <main className="min-w-0 flex-1 p-4 pb-20 md:p-6 md:pb-6">{children}</main>
      </div>
      <BottomNav items={navItems} />
    </div>
  );
}
