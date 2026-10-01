import { notFound } from "next/navigation";
import { Tiles } from "@/components/shell/tiles";
import { MODULES } from "@/config/modules";
import { requireUser } from "@/lib/auth/session";
import { recordsDb } from "@/lib/records/data";
import { REGISTRY } from "@/registry";

export const metadata = { title: "Form settings" };

const MODULE_TITLES: Record<string, string> = { ...Object.fromEntries(MODULES.map((m) => [m.slug, m.title])), utility: "Lists" };

export default async function FormsPage() {
  const user = await requireUser();
  if (!user.permissions.has("projects.module.design_design")) notFound();
  const db = await recordsDb();
  const { data } = await db.from("field_settings").select("table_name");
  const changed = new Map<string, number>();
  for (const r of (data ?? []) as { table_name: string }[]) changed.set(r.table_name, (changed.get(r.table_name) ?? 0) + 1);

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-2xl font-semibold">Form settings</h1>
      <p className="mt-1 mb-4 text-sm text-muted-foreground">Change labels, dropdown options, required fields, order and help text. Pick a form.</p>
      {Object.entries(Object.groupBy(REGISTRY, (t) => t.module)).map(([mod, tables]) => (
        <section key={mod} className="mb-6">
          <h2 className="mb-2 text-lg font-semibold">{MODULE_TITLES[mod] ?? mod}</h2>
          <Tiles
            columns={4}
            items={tables!.map((t) => ({
              href: `/admin/forms/${t.name}`,
              title: t.label,
              subtitle: [t.parent ? `Inside ${REGISTRY.find((p) => p.name === t.parent!.table)?.itemLabel}` : null, changed.has(t.name) ? `${changed.get(t.name)} changed` : null].filter(Boolean).join(" · ") || undefined,
              icon: t.tab ?? t.name,
            }))}
          />
        </section>
      ))}
    </div>
  );
}
