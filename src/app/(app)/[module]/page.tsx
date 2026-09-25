import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { DashboardWidgets } from "@/components/dashboard/widgets";
import { visibleModules } from "@/config/modules";
import { requireUser } from "@/lib/auth/session";
import { REGISTRY } from "@/registry";
import { LISTS_MODULE, tableHref } from "@/registry/routes";

export default async function ModulePage(props: PageProps<"/[module]">) {
  const { module: slug } = await props.params;
  const user = await requireUser();

  // Utility lists (Brands, Suppliers, KB Categories) — readable by everyone (SPEC §2).
  if (slug === LISTS_MODULE) {
    const lists = REGISTRY.filter((t) => t.module === "utility");
    return <TabList title="Lists" items={lists.map((t) => ({ href: tableHref(t), title: t.label }))} />;
  }

  // A module the user can't see is treated as not found, so it doesn't reveal what exists.
  const mod = visibleModules(user.permissions).find((m) => m.slug === slug);
  if (!mod) notFound();
  return (
    <TabList title={mod.title} items={mod.tabs.map((t) => ({ href: `/${mod.slug}/${t.slug}`, title: t.title }))}>
      <div className="mt-6">
        <DashboardWidgets user={user} module={mod.slug} />
      </div>
    </TabList>
  );
}

function TabList({ title, items, children }: { title: string; items: { href: string; title: string }[]; children?: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="mb-4 text-2xl font-semibold">{title}</h1>
      <ul className="divide-y rounded-xl border">
        {items.map((i) => (
          <li key={i.href}>
            <Link href={i.href} className="flex min-h-14 items-center justify-between px-4 text-base hover:bg-muted/50 active:bg-muted">
              {i.title}
              <ChevronRight className="size-4 text-muted-foreground" aria-hidden />
            </Link>
          </li>
        ))}
      </ul>
      {children}
    </div>
  );
}
