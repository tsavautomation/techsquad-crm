"use client";

import { useEffect, useState, useTransition } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  ChartColumn,
  ChevronRight,
  Clock,
  Columns3,
  Database,
  KeyRound,
  List,
  LogOut,
  Menu,
  Monitor,
  Moon,
  Plus,
  Settings,
  SquareKanban,
  Sun,
  X,
} from "lucide-react";
import { useTheme } from "next-themes";
import type { ModuleDef } from "@/config/modules";
import { cn } from "@/lib/utils";
import { LANGS, type Lang } from "@/i18n/core";
import { setLanguageAction } from "@/i18n/actions";
import { useLang, useT } from "@/i18n/client";
import { AlertsBell } from "./alerts-bell";
import { GlobalSearch } from "./global-search";
import { ModuleIcon } from "./module-icon";
import { TileIcon } from "./tile-icons";

// App frame in the "Portal Tech Squad" style (docs/portal-features-merge.md): navy sidebar with
// grouped sections and a Create button on computers; on phones a bottom bar with Home, Schedule,
// a big +, Projects and More (the rest in a sheet).

/** A module the user may open; the server layout filters these (and their tabs) by permission. */
export type NavItem = {
  slug: string;
  href: string;
  title: string;
  shortTitle: string;
  icon: ModuleDef["icon"];
  tabs?: { href: string; title: string }[];
};
export type CreateItem = { href: string; label: string; icon: string };
export type Me = { name: string; email: string; initials: string };
/** Pages outside the modules (Portal design): Tasks board, Insights, Data. */
export type Extras = {
  tasks: boolean;
  pipeline: boolean;
  insights: boolean;
  data: boolean;
  timeClock: boolean;
};

const GROUPS: { title: string; slugs: string[] }[] = [
  { title: "", slugs: ["schedule"] },
  { title: "Work", slugs: ["projects", "forms"] },
  { title: "Office", slugs: ["administrative", "inventory"] },
];

function isActive(pathname: string, href: string) {
  return href === "/"
    ? pathname === "/"
    : pathname === href || pathname.startsWith(`${href}/`);
}

/** The Tech Squad mark (public/logo.png, Fred 2026-10-02). */
export function Logo({ className }: { className?: string }) {
  return (
    <Image
      src="/logo.png"
      alt=""
      width={36}
      height={36}
      className={cn("size-9 shrink-0 rounded-full", className)}
      priority
    />
  );
}

function Avatar({ me, className }: { me: Me; className?: string }) {
  return (
    <span
      className={cn(
        "grid size-9 shrink-0 place-items-center rounded-full bg-[#5b8c3a] text-xs font-semibold text-white",
        className,
      )}
    >
      {me.initials}
    </span>
  );
}

/** Bottom sheet on phones, popover-like panel on computers. */
function Sheet({
  open,
  onClose,
  title,
  children,
  side = "bottom",
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  side?: "bottom" | "left";
}) {
  const t = useT();
  useEffect(() => {
    if (!open) return;
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 bg-slate-900/45" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        className={cn(
          "absolute max-h-[82vh] overflow-y-auto bg-card p-2 shadow-float",
          side === "bottom"
            ? "inset-x-0 bottom-0 rounded-t-[20px] pb-[calc(12px+env(safe-area-inset-bottom))] md:inset-x-auto md:bottom-auto md:top-16 md:left-4 md:w-80 md:rounded-2xl"
            : "top-16 left-4 w-80 rounded-2xl",
        )}
      >
        <div className="flex items-center justify-between px-3 pt-2 pb-1">
          <span className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
            {title}
          </span>
          <button
            type="button"
            onClick={onClose}
            className="grid size-9 place-items-center rounded-lg hover:bg-muted"
            aria-label={t("Close")}
          >
            <X className="size-4" aria-hidden />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

/** Icon tiles inside a sheet: three across, big enough to tap. */
function SheetTiles({
  items,
  onPick,
}: {
  items: { href: string; label: string; icon: string; active?: boolean }[];
  onPick: () => void;
}) {
  return (
    <ul className="grid grid-cols-3 gap-2 px-1 pb-1">
      {items.map((c) => (
        <li key={c.href}>
          <Link
            href={c.href}
            onClick={onPick}
            className={cn(
              "flex h-full min-h-[92px] flex-col items-center justify-center gap-2 rounded-2xl border bg-card p-2 text-center shadow-card active:bg-muted",
              c.active && "border-primary bg-secondary",
            )}
          >
            <TileIcon name={c.icon} />
            <span className="text-xs leading-tight font-medium">{c.label}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

function CreateList({
  items,
  onPick,
}: {
  items: CreateItem[];
  onPick: () => void;
}) {
  const t = useT();
  if (!items.length)
    return (
      <p className="px-3 py-2 text-sm text-muted-foreground">
        {t("Nothing you can create here.")}
      </p>
    );
  return (
    <SheetTiles
      items={items.map((c) => ({ href: c.href, label: c.label, icon: c.icon }))}
      onPick={onPick}
    />
  );
}

function ThemeChoice() {
  const t = useT();
  const { theme, setTheme } = useTheme();
  const opts = [
    ["system", "Auto", Monitor],
    ["light", "Day", Sun],
    ["dark", "Night", Moon],
  ] as const;
  return (
    <div
      className="mx-2 my-2 flex rounded-[10px] border bg-muted p-0.5"
      role="radiogroup"
      aria-label={t("Colours")}
    >
      {opts.map(([v, label, Icon]) => (
        <button
          key={v}
          type="button"
          role="radio"
          aria-checked={theme === v}
          onClick={() => setTheme(v)}
          className={cn(
            "flex h-9 flex-1 items-center justify-center gap-1.5 rounded-lg text-[13px] text-muted-foreground",
            theme === v && "bg-card font-semibold text-foreground shadow-card",
          )}
        >
          <Icon className="size-4" aria-hidden /> {t(label)}
        </button>
      ))}
    </div>
  );
}

/** My screen language (my profile only). */
function LanguageChoice() {
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
    <div
      className="mx-2 my-2 flex rounded-[10px] border bg-muted p-0.5"
      role="radiogroup"
      aria-label={t("Language")}
    >
      {LANGS.map((l) => (
        <button
          key={l.code}
          type="button"
          role="radio"
          aria-checked={lang === l.code}
          disabled={pending}
          onClick={() => pick(l.code)}
          className={cn(
            "flex h-9 flex-1 items-center justify-center gap-1.5 rounded-lg text-[13px] text-muted-foreground",
            lang === l.code &&
              "bg-card font-semibold text-foreground shadow-card",
          )}
        >
          <span aria-hidden>{l.code === "en" ? "🇺🇸" : "🇧🇷"}</span> {l.label}
        </button>
      ))}
    </div>
  );
}

function ChangePassword() {
  const t = useT();
  return (
    <Link
      href="/auth/update-password"
      className="flex min-h-12 w-full items-center gap-3 rounded-xl px-3 text-left hover:bg-muted"
    >
      <KeyRound className="size-5 text-muted-foreground" aria-hidden />{" "}
      {t("Change password")}
    </Link>
  );
}

function SignOut() {
  const t = useT();
  return (
    <form action="/auth/signout" method="post">
      <button
        type="submit"
        className="flex min-h-12 w-full items-center gap-3 rounded-xl px-3 text-left hover:bg-muted"
      >
        <LogOut className="size-5 text-muted-foreground" aria-hidden />{" "}
        {t("Sign out")}
      </button>
    </form>
  );
}

/** Left sidebar, shown from the md breakpoint up. The open module lists its pages underneath. */
export function Sidebar({
  items,
  create,
  me,
  showAdmin,
  extras,
}: {
  items: NavItem[];
  create: CreateItem[];
  me: Me;
  showAdmin: boolean;
  extras: Extras;
}) {
  const t = useT();
  const pathname = usePathname();
  const [creating, setCreating] = useState(false);
  const [menu, setMenu] = useState(false);
  const bySlug = new Map(items.map((i) => [i.slug, i]));
  const link = (
    href: string,
    title: string,
    icon: React.ReactNode,
    tabs?: { href: string; title: string }[],
  ) => {
    const active = isActive(pathname, href);
    return (
      <li key={href}>
        <Link
          href={href}
          className={cn(
            "flex h-10 items-center gap-[11px] rounded-[10px] px-2.5 text-sm text-sidebar-foreground hover:bg-white/5 hover:text-white",
            active &&
              "bg-sidebar-accent font-semibold text-white [&_svg]:text-brand",
          )}
        >
          {icon}
          {title}
        </Link>
        {active && tabs && tabs.length > 1 && (
          <ul className="mt-1 mb-2 ml-[22px] flex flex-col border-l border-white/10 pl-3">
            {tabs.map((tb) => (
              <li key={tb.href}>
                <Link
                  href={tb.href}
                  className={cn(
                    "flex h-9 items-center rounded-md px-2 text-[13px] text-[#8fa3bd] hover:text-white",
                    isActive(pathname, tb.href) && "font-medium text-white",
                  )}
                >
                  {tb.title}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </li>
    );
  };

  return (
    <nav
      aria-label={t("Main")}
      className="sticky top-0 hidden h-dvh w-[252px] shrink-0 flex-col overflow-y-auto bg-sidebar px-3 py-4 text-sidebar-foreground md:flex"
    >
      <Link href="/" className="flex items-center gap-2.5 px-2 pb-4">
        <Logo />
        <span>
          <span className="block text-[15px] leading-tight font-semibold text-white">
            Tech Squad
          </span>
          <span className="block text-[11px] text-[#8fa3bd]">
            Managing System
          </span>
        </span>
      </Link>
      {create.length > 0 && (
        <button
          type="button"
          onClick={() => setCreating(true)}
          className="mb-2 flex h-[42px] items-center justify-center gap-2 rounded-xl bg-brand text-sm font-semibold text-[#04263a] hover:brightness-105"
        >
          <Plus className="size-4" aria-hidden /> {t("Create")}
        </button>
      )}
      {GROUPS.map((g) => {
        const list = g.slugs
          .map((s) => bySlug.get(s))
          .filter((x): x is NavItem => Boolean(x));
        if (!g.title)
          return (
            <ul key="main" className="flex flex-col gap-0.5">
              {link(
                "/",
                t("Today"),
                <ModuleIcon name="dashboard" className="size-[18px]" />,
              )}
              {list.map((i) =>
                link(
                  i.href,
                  i.title,
                  <ModuleIcon name={i.icon} className="size-[18px]" />,
                  i.tabs,
                ),
              )}
              {extras.pipeline &&
                link(
                  "/pipeline",
                  t("Pipeline"),
                  <Columns3 className="size-[18px]" aria-hidden />,
                )}
              {extras.tasks &&
                link(
                  "/tasks",
                  t("Tasks"),
                  <SquareKanban className="size-[18px]" aria-hidden />,
                )}
            </ul>
          );
        if (!list.length) return null;
        return (
          <div key={g.title}>
            <p className="mx-2.5 mt-[18px] mb-1.5 text-[11px] tracking-[0.08em] text-[#7c8da6] uppercase">
              {t(g.title)}
            </p>
            <ul className="flex flex-col gap-0.5">
              {list.map((i) =>
                link(
                  i.href,
                  i.title,
                  <ModuleIcon name={i.icon} className="size-[18px]" />,
                  i.tabs,
                ),
              )}
            </ul>
          </div>
        );
      })}
      {(extras.insights || extras.data || extras.timeClock) && (
        <>
          <p className="mx-2.5 mt-[18px] mb-1.5 text-[11px] tracking-[0.08em] text-[#7c8da6] uppercase">
            {t("Management")}
          </p>
          <ul className="flex flex-col gap-0.5">
            {extras.timeClock &&
              link(
                "/time-clock",
                t("Time clock"),
                <Clock className="size-[18px]" aria-hidden />,
              )}
            {extras.insights &&
              link(
                "/insights",
                t("Insights"),
                <ChartColumn className="size-[18px]" aria-hidden />,
              )}
            {extras.data &&
              link(
                "/data",
                t("Data"),
                <Database className="size-[18px]" aria-hidden />,
              )}
          </ul>
        </>
      )}
      <p className="mx-2.5 mt-[18px] mb-1.5 text-[11px] tracking-[0.08em] text-[#7c8da6] uppercase">
        {t("More")}
      </p>
      <ul className="flex flex-col gap-0.5">
        {link(
          "/lists",
          t("Lists"),
          <List className="size-[18px]" aria-hidden />,
        )}
        {showAdmin &&
          link(
            "/admin",
            t("Admin"),
            <Settings className="size-[18px]" aria-hidden />,
          )}
      </ul>
      <button
        type="button"
        onClick={() => setMenu(true)}
        className="mt-auto flex w-full items-center gap-2.5 rounded-xl bg-white/5 p-2.5 text-left hover:bg-white/10"
      >
        <Avatar me={me} />
        <span className="min-w-0 flex-1">
          <b className="block truncate text-[13px] font-semibold text-white">
            {me.name}
          </b>
          <small className="block truncate text-[11px] text-[#8fa3bd]">
            {me.email}
          </small>
        </span>
        <ChevronRight className="size-4 text-[#8fa3bd]" aria-hidden />
      </button>
      <Sheet
        open={creating}
        onClose={() => setCreating(false)}
        title={t("Create")}
      >
        <CreateList items={create} onPick={() => setCreating(false)} />
      </Sheet>
      <Sheet open={menu} onClose={() => setMenu(false)} title={me.name}>
        <ThemeChoice />
        <LanguageChoice />
        <ChangePassword />
        <SignOut />
      </Sheet>
    </nav>
  );
}

/** Top bar: on phones the logo, search, alerts and account; on computers a strip with the search box, alerts bell and account menu. */
export function TopBar({ me }: { me: Me }) {
  const t = useT();
  const [menu, setMenu] = useState(false);
  // The sheet lives outside the header: the header's backdrop blur would make it the containing block of the
  // sheet's fixed overlay, clipping it to the 56 px bar (Fred 2026-10-05: "the top menu disappears").
  return (
    <>
      <header className="sticky top-0 z-30 flex h-14 items-center gap-1.5 md:gap-3 border-b bg-card/90 px-4 pt-[env(safe-area-inset-top)] backdrop-blur md:px-7">
        <Link
          href="/"
          className="flex items-center gap-2 md:hidden"
          aria-label={t("Today")}
        >
          <Logo className="size-8" />
          <span className="font-semibold">Tech Squad</span>
        </Link>
        <span className="grow" />
        <GlobalSearch />
        <AlertsBell />
        <button
          type="button"
          onClick={() => setMenu(true)}
          aria-label={t("Account, colours and language")}
          className="rounded-full"
        >
          <Avatar me={me} />
        </button>
      </header>
      <Sheet open={menu} onClose={() => setMenu(false)} title={me.name}>
        <p className="px-3 pb-1 text-sm text-muted-foreground">{me.email}</p>
        <ThemeChoice />
        <LanguageChoice />
        <ChangePassword />
        <SignOut />
      </Sheet>
    </>
  );
}

/** Phones: the open module's pages as a scrollable strip under the header, so switching needs no "back". */
export function ModuleTabsBar({ items }: { items: NavItem[] }) {
  const t = useT();
  const pathname = usePathname();
  const mod = items.find((i) => isActive(pathname, i.href));
  if (!mod?.tabs || mod.tabs.length < 2) return null;
  return (
    <nav
      aria-label={t("{module} pages", { module: mod.title })}
      className="sticky top-14 z-20 border-b bg-card md:hidden"
    >
      <ul className="flex gap-2 overflow-x-auto px-4 py-2 [scrollbar-width:none]">
        {mod.tabs.map((tb) => (
          <li key={tb.href} className="shrink-0">
            <Link
              href={tb.href}
              aria-current={isActive(pathname, tb.href) ? "page" : undefined}
              className={cn(
                "inline-flex h-9 items-center rounded-full border px-3.5 text-[13px] whitespace-nowrap",
                isActive(pathname, tb.href)
                  ? "border-primary bg-primary font-semibold text-primary-foreground"
                  : "bg-card text-text-2 active:bg-muted",
              )}
            >
              {tb.title}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/** Bottom bar for phones: Home, Schedule, +, Projects, More. */
export function BottomNav({
  items,
  create,
  showAdmin,
  extras,
}: {
  items: NavItem[];
  create: CreateItem[];
  showAdmin: boolean;
  extras: Extras;
}) {
  const t = useT();
  const pathname = usePathname();
  const [sheet, setSheet] = useState<"create" | "more" | null>(null);
  const close = () => setSheet(null);
  const pinned = ["schedule", "projects"]
    .map((s) => items.find((i) => i.slug === s))
    .filter((x): x is NavItem => Boolean(x));
  const rest = items.filter((i) => !pinned.includes(i));
  const tab = (
    href: string,
    label: string,
    icon: React.ReactNode,
    active: boolean,
  ) => (
    <Link
      href={href}
      className={cn(
        "flex flex-1 flex-col items-center gap-[3px] pt-2.5 pb-2 text-[11px] text-muted-foreground",
        active && "font-semibold text-primary",
      )}
    >
      {icon}
      {label}
    </Link>
  );
  const extraPages = [
    ...(extras.pipeline
      ? [
          {
            href: "/pipeline",
            title: t("Pipeline"),
            icon: <Columns3 className="size-5" aria-hidden />,
          },
        ]
      : []),
    ...(extras.tasks
      ? [
          {
            href: "/tasks",
            title: t("Tasks"),
            icon: <SquareKanban className="size-5" aria-hidden />,
          },
        ]
      : []),
    ...(extras.timeClock
      ? [
          {
            href: "/time-clock",
            title: t("Time clock"),
            icon: <Clock className="size-5" aria-hidden />,
          },
        ]
      : []),
    ...(extras.insights
      ? [
          {
            href: "/insights",
            title: t("Insights"),
            icon: <ChartColumn className="size-5" aria-hidden />,
          },
        ]
      : []),
    ...(extras.data
      ? [
          {
            href: "/data",
            title: t("Data"),
            icon: <Database className="size-5" aria-hidden />,
          },
        ]
      : []),
  ];
  const moreActive =
    rest.some((i) => isActive(pathname, i.href)) ||
    [...extraPages.map((p) => p.href), "/admin", "/lists"].some((h) =>
      isActive(pathname, h),
    );
  // Forms (new / edit) and settings screens with a Save bar get the whole screen; the bar sits where this one would be.
  if (
    /\/(new|edit)$/.test(pathname) ||
    /^\/admin\/(field-day|messages)$/.test(pathname)
  )
    return null;

  return (
    <>
      <nav
        aria-label={t("Main")}
        className="fixed inset-x-0 bottom-0 z-40 flex border-t bg-card pb-[env(safe-area-inset-bottom)] shadow-[0_-4px_16px_rgb(16_24_40/0.06)] md:hidden"
      >
        {tab(
          "/",
          t("Today"),
          <ModuleIcon name="dashboard" className="size-[22px]" />,
          pathname === "/",
        )}
        {pinned[0] &&
          tab(
            pinned[0].href,
            pinned[0].shortTitle,
            <ModuleIcon name={pinned[0].icon} className="size-[22px]" />,
            isActive(pathname, pinned[0].href),
          )}
        {create.length > 0 && (
          <button
            type="button"
            onClick={() => setSheet("create")}
            className="flex flex-1 flex-col items-center"
            aria-label={t("Create")}
          >
            <span className="-mt-[22px] grid size-[50px] place-items-center rounded-full bg-primary text-primary-foreground shadow-float">
              <Plus className="size-6" aria-hidden />
            </span>
          </button>
        )}
        {pinned[1] &&
          tab(
            pinned[1].href,
            pinned[1].shortTitle,
            <ModuleIcon name={pinned[1].icon} className="size-[22px]" />,
            isActive(pathname, pinned[1].href),
          )}
        <button
          type="button"
          onClick={() => setSheet("more")}
          className={cn(
            "flex flex-1 flex-col items-center gap-[3px] pt-2.5 pb-2 text-[11px] text-muted-foreground",
            moreActive && "font-semibold text-primary",
          )}
        >
          <Menu className="size-[22px]" aria-hidden />
          {t("More")}
        </button>
      </nav>
      <Sheet open={sheet === "create"} onClose={close} title={t("Create")}>
        <CreateList items={create} onPick={close} />
      </Sheet>
      <Sheet open={sheet === "more"} onClose={close} title={t("More")}>
        <SheetTiles
          onPick={close}
          items={[
            ...extraPages.map((p) => ({
              href: p.href,
              label: p.title,
              icon: p.href.slice(1),
              active: isActive(pathname, p.href),
            })),
            ...rest.map((i) => ({
              href: i.href,
              label: i.title,
              icon: i.slug,
              active: isActive(pathname, i.href),
            })),
            {
              href: "/lists",
              label: t("Lists"),
              icon: "lists",
              active: isActive(pathname, "/lists"),
            },
            ...(showAdmin
              ? [
                  {
                    href: "/admin",
                    label: t("Admin"),
                    icon: "admin",
                    active: isActive(pathname, "/admin"),
                  },
                ]
              : []),
          ]}
        />
        <ThemeChoice />
        <LanguageChoice />
      </Sheet>
    </>
  );
}
