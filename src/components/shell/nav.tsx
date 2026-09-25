"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { MODULES } from "@/config/modules";
import { cn } from "@/lib/utils";
import { ModuleIcon } from "./module-icon";

const ITEMS = [
  { href: "/", title: "Dashboard", shortTitle: "Home", icon: "dashboard" as const },
  ...MODULES.map((m) => ({ href: `/${m.slug}`, title: m.title, shortTitle: m.shortTitle, icon: m.icon })),
];

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}

/** Left sidebar, shown from the md breakpoint up. */
export function Sidebar() {
  const pathname = usePathname();
  return (
    <nav aria-label="Main" className="hidden w-60 shrink-0 border-r bg-muted/30 md:block">
      <ul className="flex flex-col gap-1 p-3">
        {ITEMS.map((item) => (
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
export function BottomNav() {
  const pathname = usePathname();
  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-40 border-t bg-background pb-[env(safe-area-inset-bottom)] md:hidden"
    >
      <ul className="grid grid-cols-6">
        {ITEMS.map((item) => (
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
