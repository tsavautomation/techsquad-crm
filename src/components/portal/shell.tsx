"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTransition } from "react";
import { LogOut } from "lucide-react";
import { Logo } from "@/components/shell/nav";
import { ThemeToggle } from "@/components/shell/theme-toggle";
import { setLanguageAction } from "@/i18n/actions";
import { useLang, useT } from "@/i18n/client";
import { LANGS, type Lang } from "@/i18n/core";
import { cn } from "@/lib/utils";

/** Customer portal top bar (F6): logo, language, day / night, sign out. One row that fits a phone. */
export function PortalTopBar({ name, projectsHref }: { name: string; projectsHref: string | null }) {
  const t = useT();
  return (
    <header className="sticky top-0 z-20 border-b bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/80">
      <div className="mx-auto flex h-14 max-w-3xl items-center gap-3 px-4">
        <Link href="/portal" className="flex min-w-0 items-center gap-2" aria-label={t("Home")}>
          <Logo className="size-8" />
          <span className="truncate text-[15px] font-semibold">Tech Squad</span>
        </Link>
        <div className="ml-auto flex items-center gap-1.5">
          {projectsHref && (
            <Link href={projectsHref} className="hidden h-9 items-center rounded-lg px-3 text-sm hover:bg-muted sm:inline-flex">
              {t("My projects")}
            </Link>
          )}
          <LangToggle />
          <ThemeToggle />
          <form action="/auth/signout?to=portal" method="post">
            <button type="submit" className="inline-flex size-9 items-center justify-center rounded-lg hover:bg-muted" aria-label={t("Sign out")} title={t("Sign out")}>
              <LogOut className="size-4" aria-hidden />
            </button>
          </form>
        </div>
      </div>
      <p className="sr-only">{name}</p>
    </header>
  );
}

function LangToggle() {
  const t = useT();
  const lang = useLang();
  const router = useRouter();
  const [pending, start] = useTransition();
  const pick = (l: Lang) =>
    start(async () => {
      await setLanguageAction(l);
      router.refresh();
    });
  return (
    <div className="flex rounded-lg border bg-muted p-0.5" role="radiogroup" aria-label={t("Language")}>
      {LANGS.map((l) => (
        <button
          key={l.code}
          type="button"
          role="radio"
          aria-checked={lang === l.code}
          disabled={pending}
          onClick={() => pick(l.code)}
          className={cn("h-8 min-w-9 rounded-md px-2 text-xs font-medium uppercase", lang === l.code ? "bg-card shadow-sm" : "text-muted-foreground")}
        >
          {l.code}
        </button>
      ))}
    </div>
  );
}

export type PortalTab = { href: string; label: string; exact?: boolean };

/** The project's sections as a scrollable row of tabs (phones) that wraps on wide screens. */
export function ProjectTabs({ tabs }: { tabs: PortalTab[] }) {
  const pathname = usePathname();
  return (
    <nav className="-mx-4 overflow-x-auto px-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" aria-label="Sections">
      <ul className="flex w-max gap-1 border-b sm:w-auto sm:flex-wrap">
        {tabs.map((tab) => {
          const active = tab.exact ? pathname === tab.href : pathname === tab.href || pathname.startsWith(`${tab.href}/`);
          return (
            <li key={tab.href}>
              <Link
                href={tab.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "inline-flex h-11 items-center border-b-2 px-3 text-sm whitespace-nowrap",
                  active ? "border-primary font-semibold text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
                )}
              >
                {tab.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/** White card used by every portal section. */
export function PortalCard({ title, children, className, action }: { title?: string; children: React.ReactNode; className?: string; action?: React.ReactNode }) {
  return (
    <section className={cn("rounded-2xl border bg-card p-4 shadow-card", className)}>
      {(title || action) && (
        <div className="mb-3 flex items-center justify-between gap-3">
          {title && <h2 className="text-[15px] font-semibold">{title}</h2>}
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

const TONES: Record<string, string> = {
  ok: "bg-ok-bg text-ok-fg",
  warn: "bg-warn-bg text-warn-fg",
  bad: "bg-bad-bg text-bad-fg",
  info: "bg-info-bg text-info-fg",
  muted: "bg-muted text-muted-foreground",
};

export function Pill({ tone = "muted", children }: { tone?: keyof typeof TONES; children: React.ReactNode }) {
  return <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium", TONES[tone])}>{children}</span>;
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <p className="rounded-xl border border-dashed p-4 text-center text-sm text-muted-foreground">{children}</p>;
}
