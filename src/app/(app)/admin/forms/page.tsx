import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronRight } from "lucide-react";
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
          <ul className="divide-y rounded-xl border">
            {tables!.map((t) => (
              <li key={t.name}>
                <Link href={`/admin/forms/${t.name}`} className="flex min-h-12 items-center justify-between gap-3 px-4 hover:bg-muted/50 active:bg-muted">
                  <span>
                    {t.label}
                    {t.parent && <span className="ml-1 text-xs text-muted-foreground">(inside {REGISTRY.find((p) => p.name === t.parent!.table)?.itemLabel})</span>}
                    {changed.has(t.name) && <span className="ml-2 rounded bg-muted px-1.5 text-xs">{changed.get(t.name)} changed</span>}
                  </span>
                  <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
