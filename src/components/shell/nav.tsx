"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ModuleDef } from "@/config/modules";
import { cn } from "@/lib/utils";
import { ModuleIcon } from "./module-icon";

/** A module the user may open; the server layout filters these (and their tabs) by permission. */
export type NavItem = { href: string; title: string; shortTitle: string; icon: ModuleDef["icon"]; tabs?: { href: string; title: string }[] };

const HOME = { href: "/", title: "Dashboard", shortTitle: "Home", icon: "dashboard" as const };

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}

/** Left sidebar, shown from the md breakpoint up. The open module lists its tabs underneath. */
export function Sidebar({ items }: { items: NavItem[] }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Main" className="hidden w-60 shrink-0 border-r bg-muted/30 md:block">
      <ul className="sticky top-14 flex flex-col gap-1 p-3">
        {[HOME, ...items].map((item) => {
          const open = isActive(pathname, item.href) && "tabs" in item && item.tabs?.length;
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                className={cn("flex h-11 items-center gap-3 rounded-lg px-3 text-sm font-medium hover:bg-muted", isActive(pathname, item.href) && "bg-muted text-foreground")}
              >
                <ModuleIcon name={item.icon} className="size-5" />
                {item.title}
              </Link>
              {open && (
                <ul className="mt-1 mb-2 ml-5 flex flex-col border-l pl-3">
                  {(item as NavItem).tabs!.map((t) => (
                    <li key={t.href}>
                      <Link
                        href={t.href}
                        className={cn(
                          "flex h-10 items-center rounded-md px-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground",
                          isActive(pathname, t.href) && "font-medium text-foreground",
                        )}
                      >
                        {t.title}
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/** Phones: the open module's tabs as a scrollable strip under the header, so switching tabs needs no "back". */
export function ModuleTabsBar({ items }: { items: NavItem[] }) {
  const pathname = usePathname();
  const mod = items.find((i) => isActive(pathname, i.href));
  if (!mod?.tabs || mod.tabs.length < 2) return null;
  return (
    <nav aria-label={`${mod.title} pages`} className="sticky top-14 z-20 border-b bg-background md:hidden">
      <ul className="flex gap-2 overflow-x-auto px-4 py-2 [scrollbar-width:none]">
        {mod.tabs.map((t) => (
          <li key={t.href} className="shrink-0">
            <Link
              href={t.href}
              aria-current={isActive(pathname, t.href) ? "page" : undefined}
              className={cn(
                "inline-flex h-9 items-center rounded-full border px-3 text-sm whitespace-nowrap",
                isActive(pathname, t.href) ? "border-foreground bg-foreground text-background" : "text-muted-foreground active:bg-muted",
              )}
            >
              {t.title}
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
    <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-40 border-t bg-background pb-[env(safe-area-inset-bottom)] md:hidden">
      <ul className="grid" style={{ gridTemplateColumns: `repeat(${all.length}, minmax(0, 1fr))` }}>
        {all.map((item) => (
          <li key={item.href}>
            <Link
              href={item.href}
              className={cn("flex h-14 flex-col items-center justify-center gap-0.5 text-[10px] text-muted-foreground", isActive(pathname, item.href) && "text-foreground")}
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
