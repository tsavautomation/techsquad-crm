import { notFound } from "next/navigation";
import { Tiles } from "@/components/shell/tiles";
import { MODULES } from "@/config/modules";
import { requireUser } from "@/lib/auth/session";
import { recordsDb } from "@/lib/records/data";
import { REGISTRY } from "@/registry";
import { getT } from "@/i18n/server";

export async function generateMetadata() {
  return { title: (await getT())("Form settings") };
}

const MODULE_TITLES: Record<string, string> = { ...Object.fromEntries(MODULES.map((m) => [m.slug, m.title])), utility: "Lists" };

export default async function FormsPage() {
  const tr = await getT();
  const user = await requireUser();
  if (!user.permissions.has("projects.module.design_design")) notFound();
  const db = await recordsDb();
  const { data } = await db.from("field_settings").select("table_name");
  const changed = new Map<string, number>();
  for (const r of (data ?? []) as { table_name: string }[]) changed.set(r.table_name, (changed.get(r.table_name) ?? 0) + 1);

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-2xl font-semibold">{tr("Form settings")}</h1>
      <p className="mt-1 mb-4 text-sm text-muted-foreground">{tr("Change labels, dropdown options, required fields, order and help text. Pick a form.")}</p>
      {Object.entries(Object.groupBy(REGISTRY, (t) => t.module)).map(([mod, tables]) => (
        <section key={mod} className="mb-6">
          <h2 className="mb-2 text-lg font-semibold">{tr(MODULE_TITLES[mod] ?? mod)}</h2>
          <Tiles
            columns={4}
            items={tables!.map((t) => ({
              href: `/admin/forms/${t.name}`,
              title: t.label,
              subtitle:
                [
                  t.parent ? tr("Inside {name}", { name: tr(REGISTRY.find((p) => p.name === t.parent!.table)?.itemLabel ?? "") }) : null,
                  changed.has(t.name) ? tr("{n} changed", { n: changed.get(t.name) }) : null,
                ]
                  .filter(Boolean)
                  .join(" · ") || undefined,
              icon: t.tab ?? t.name,
            }))}
          />
        </section>
      ))}
    </div>
  );
}
