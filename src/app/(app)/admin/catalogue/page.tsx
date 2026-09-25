import { notFound } from "next/navigation";
import { MODULES } from "@/config/modules";
import { requireUser } from "@/lib/auth/session";
import { REGISTRY } from "@/registry";
import { describeNotes, describeRule, describeType } from "@/registry/describe";

export const metadata = { title: "Field catalogue" };

const MODULE_TITLES: Record<string, string> = {
  ...Object.fromEntries(MODULES.map((m) => [m.slug, m.title])),
  utility: "Utility lists",
};

/** Read-only review page for the registry (M3). Visible to people who may design forms. */
export default async function CataloguePage() {
  const user = await requireUser();
  if (!user.permissions.has("projects.module.design_design")) notFound();

  const tables = new Map(REGISTRY.map((t) => [t.name, t]));
  const modules = [...new Set(REGISTRY.map((t) => t.module))];

  return (
    <div className="mx-auto max-w-5xl">
      <h1 className="text-2xl font-semibold">Field catalogue</h1>
      <p className="mt-1 mb-6 text-sm text-muted-foreground">
        Every table, field, option and rule carried over from WebAuthor ({REGISTRY.length} tables,{" "}
        {REGISTRY.reduce((n, t) => n + t.fields.length, 0)} fields, {REGISTRY.reduce((n, t) => n + t.rules.length, 0)}{" "}
        rules). Read-only.
      </p>

      <nav aria-label="Tables" className="mb-8 flex flex-wrap gap-2 text-sm">
        {REGISTRY.map((t) => (
          <a key={t.name} href={`#${t.name}`} className="rounded-full border px-3 py-1 hover:bg-muted">
            {t.label}
          </a>
        ))}
      </nav>

      {modules.map((mod) => (
        <section key={mod} className="mb-10">
          <h2 className="mb-4 border-b pb-2 text-lg font-semibold">{MODULE_TITLES[mod] ?? mod}</h2>
          {REGISTRY.filter((t) => t.module === mod).map((t) => (
            <article key={t.name} id={t.name} className="mb-8 scroll-mt-20">
              <h3 className="text-base font-semibold">{t.label}</h3>
              <p className="mb-3 text-xs text-muted-foreground">
                <code>{t.name}</code>
                {t.parent && <> · belongs to one {tables.get(t.parent.table)?.label} record</>}
                {t.submit?.workflow && <> · submit starts the “{t.submit.workflow.replace(/_/g, " ")}” workflow</>}
                {t.titleFormula && <> · title: {t.titleFormula}</>}
              </p>

              <ol className="divide-y rounded-lg border text-sm">
                {t.fields.map((f) => {
                  const notes = describeNotes(f, t, tables);
                  return (
                    <li key={f.name} className="p-3">
                      {f.heading && <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{f.heading}</p>}
                      <div className="flex flex-wrap items-baseline gap-x-2">
                        <span className="font-medium">{f.label}</span>
                        {f.required && <span className="text-xs text-destructive">required</span>}
                        <span className="text-xs text-muted-foreground">{describeType(f, tables)}</span>
                      </div>
                      {f.options && (
                        <div className="mt-1 flex flex-wrap gap-1">
                          {f.options.map((o) => (
                            <span key={o.value} className="inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-xs">
                              {o.color && <span className="size-2 rounded-full" style={{ background: o.color }} aria-hidden />}
                              {o.label}
                              {o.label !== o.value && <span className="text-muted-foreground">({o.value})</span>}
                            </span>
                          ))}
                        </div>
                      )}
                      {notes.length > 0 && <p className="mt-1 text-xs text-muted-foreground">{notes.join(" · ")}</p>}
                    </li>
                  );
                })}
              </ol>

              {t.rules.length > 0 && (
                <div className="mt-3">
                  <h4 className="mb-1 text-sm font-medium">Rules</h4>
                  <ul className="space-y-1 text-sm">
                    {t.rules.map((r) => {
                      const d = describeRule(r, t);
                      return (
                        <li key={r.id} className="rounded bg-muted/50 px-3 py-2">
                          <span className="text-muted-foreground">#{r.id} </span>
                          When {d.when} → {d.then}
                          {r.dropped && <span className="block text-xs text-amber-700">⚠ ignored from WebAuthor: {r.dropped.join("; ")}</span>}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}
            </article>
          ))}
        </section>
      ))}
    </div>
  );
}
