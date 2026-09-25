"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ModuleDef } from "@/config/modules";
import { cn } from "@/lib/utils";
import { ModuleIcon } from "./module-icon";

/** A module the user may open; the server layout filters these by permission. */
export type NavItem = { href: string; title: string; shortTitle: string; icon: ModuleDef["icon"] };

const HOME = { href: "/", title: "Dashboard", shortTitle: "Home", icon: "dashboard" as const };

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}

/** Left sidebar, shown from the md breakpoint up. */
export function Sidebar({ items }: { items: NavItem[] }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Main" className="hidden w-60 shrink-0 border-r bg-muted/30 md:block">
      <ul className="flex flex-col gap-1 p-3">
        {[HOME, ...items].map((item) => (
          <li key={item.href}>
            <Link
              href={item.href}
              className={cn(
                "flex h-11 items-center gap-3 rounded-lg px-3 text-sm font-medium hover:bg-muted",
                isActive(pathname, item.href) && "bg-muted text-foreground",
              )}
            >
              <ModuleIcon name={item.icon} className="size-5" />
              {item.title}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/** Bottom tab bar for phones, hidden from md up. */
export function BottomNav({ items }: { items: NavItem[] }) {
  const pathname = usePathname();
  const all = [HOME, ...items];
  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-40 border-t bg-background pb-[env(safe-area-inset-bottom)] md:hidden"
    >
      <ul className="grid" style={{ gridTemplateColumns: `repeat(${all.length}, minmax(0, 1fr))` }}>
        {all.map((item) => (
          <li key={item.href}>
            <Link
              href={item.href}
              className={cn(
                "flex h-14 flex-col items-center justify-center gap-0.5 text-[10px] text-muted-foreground",
                isActive(pathname, item.href) && "text-foreground",
              )}
            >
              <ModuleIcon name={item.icon} className="size-5" />
              {item.shortTitle}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
