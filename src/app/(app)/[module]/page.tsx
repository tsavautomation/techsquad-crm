import { notFound } from "next/navigation";
import { DashboardWidgets } from "@/components/dashboard/widgets";
import { TILE_TEXT } from "@/components/shell/tile-icons";
import { Tiles, type Tile } from "@/components/shell/tiles";
import { visibleModules } from "@/config/modules";
import { requireUser } from "@/lib/auth/session";
import { recordsDb } from "@/lib/records/data";
import { REGISTRY } from "@/registry";
import { LISTS_MODULE, tableFromRoute, tableHref } from "@/registry/routes";
import { getT } from "@/i18n/server";

/** Number of live records in a table the person can see (row-level security decides). */
async function counts(tables: (string | null)[]) {
  const db = await recordsDb();
  return Promise.all(
    tables.map(async (name) => {
      if (!name) return null;
      const { count } = await db.from(name).select("id", { count: "exact", head: true }).is("deleted_at", null).is("archived_at", null);
      return count ?? 0;
    }),
  );
}

export default async function ModulePage(props: PageProps<"/[module]">) {
  const tr = await getT();
  const { module: slug } = await props.params;
  const user = await requireUser();

  // Utility lists (Brands, Suppliers) — readable by everyone (SPEC §2).
  if (slug === LISTS_MODULE) {
    const lists = REGISTRY.filter((t) => t.module === "utility");
    const n = await counts(lists.map((t) => t.name));
    return (
      <Page title={tr("Lists")} subtitle={tr("Shared lists used across the forms")}>
        <Tiles items={lists.map((t, i) => ({ href: tableHref(t), title: t.label, subtitle: TILE_TEXT[t.name], icon: t.name, badge: String(n[i] ?? "") }))} />
      </Page>
    );
  }

  // A module the user can't see is treated as not found, so it doesn't reveal what exists.
  const mod = visibleModules(user.permissions).find((m) => m.slug === slug);
  if (!mod) notFound();
  const tables = mod.tabs.map((t) => tableFromRoute(mod.slug, t.slug)?.name ?? null);
  const n = await counts(tables);
  const tiles: Tile[] = mod.tabs.map((t, i) => ({ href: `/${mod.slug}/${t.slug}`, title: t.title, subtitle: TILE_TEXT[t.slug], icon: t.slug, badge: n[i] === null ? undefined : String(n[i]) }));

  return (
    <Page title={tr(mod.title)}>
      <Tiles items={tiles} />
      <div className="mt-6">
        <DashboardWidgets user={user} module={mod.slug} />
      </div>
    </Page>
  );
}

function Page({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-[1200px]">
      <h1 className="text-[21px] font-semibold tracking-tight md:text-2xl">{title}</h1>
      {subtitle ? <p className="mb-4 text-xs text-muted-foreground">{subtitle}</p> : <div className="mb-4" />}
      {children}
    </div>
  );
}
