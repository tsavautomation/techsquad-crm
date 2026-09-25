import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowDown, ArrowUp, Lock, Plus } from "lucide-react";
import { requireUser } from "@/lib/auth/session";
import { filterFields, listFields, listRecords, lookupTitles, userNames } from "@/lib/records/data";
import { getTable } from "@/registry";
import { canDo, canOpen } from "@/registry/permissions";
import { recordHref, tableFromRoute, tableHref } from "@/registry/routes";
import { FieldValue } from "@/components/records/field-value";
import { ListControls } from "@/components/records/list-controls";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatDate } from "@/lib/dates";

export async function generateMetadata(props: PageProps<"/[module]/[tab]">) {
  const { module, tab } = await props.params;
  return { title: tableFromRoute(module, tab)?.label ?? "Not found" };
}

export default async function ListPage(props: PageProps<"/[module]/[tab]">) {
  const { module, tab } = await props.params;
  const sp = await props.searchParams;
  const t = tableFromRoute(module, tab);
  if (!t) notFound();
  const user = await requireUser();
  if (!canOpen(user.permissions, t, getTable)) notFound();

  const one = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : undefined);
  const filter = Object.fromEntries(
    Object.entries(sp)
      .filter(([k, v]) => k.startsWith("f.") && typeof v === "string")
      .map(([k, v]) => [k.slice(2), v as string]),
  );
  const { rows, count, page, pages, sort } = await listRecords(t, {
    q: one("q"),
    sort: one("sort"),
    dir: one("dir") === "asc" ? "asc" : one("dir") === "desc" ? "desc" : undefined,
    page: Number(one("page") ?? 1) || 1,
    archived: one("archived") === "1",
    filter,
  });

  const cols = listFields(t);
  const [titles, names] = await Promise.all([lookupTitles(t, rows, cols), userNames(rows, cols.filter((c) => c.type === "user").map((c) => c.name))]);
  const base = tableHref(t);
  const dir = one("dir") ?? (sort === "title" ? "asc" : "desc");

  const sortLink = (name: string) => {
    const next = new URLSearchParams(Object.entries(sp).filter(([, v]) => typeof v === "string") as [string, string][]);
    next.set("sort", name);
    next.set("dir", sort === name && dir === "asc" ? "desc" : "asc");
    next.delete("page");
    return `${base}?${next}`;
  };
  const pageLink = (p: number) => {
    const next = new URLSearchParams(Object.entries(sp).filter(([, v]) => typeof v === "string") as [string, string][]);
    next.set("page", String(p));
    return `${base}?${next}`;
  };
  const sortIcon = (name: string) =>
    sort === name ? dir === "asc" ? <ArrowUp className="size-3" aria-label="ascending" /> : <ArrowDown className="size-3" aria-label="descending" /> : null;

  const cell = (row: (typeof rows)[number], name: string) => {
    const f = cols.find((c) => c.name === name)!;
    const v = row[name];
    const display = f.type === "lookup" ? titles[name]?.get(v as number) : f.type === "user" ? names.get(v as string) : undefined;
    return <FieldValue field={f} value={v} display={display} compact />;
  };

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{t.label}</h1>
          <p className="text-sm text-muted-foreground">
            {count} {count === 1 ? "record" : "records"}
          </p>
        </div>
        {canDo(user.permissions, t, "create", getTable) && (
          <Link href={`${base}/new`} className={cn(buttonVariants(), "h-11 gap-1.5 px-4")}>
            <Plus className="size-4" aria-hidden />
            {t.newRecordLabel}
          </Link>
        )}
      </div>

      <ListControls filters={filterFields(t).map((f) => ({ name: f.name, label: f.label, options: f.options ?? [] }))} />

      {rows.length === 0 ? (
        <p className="rounded-lg border border-dashed p-8 text-center text-muted-foreground">No records found.</p>
      ) : (
        <>
          {/* Phones: cards */}
          <ul className="flex flex-col gap-2 md:hidden">
            {rows.map((r) => (
              <li key={r.id}>
                <Link href={recordHref(t, r.id)} className="block rounded-xl border p-3 active:bg-muted">
                  <div className="flex items-center gap-2 font-medium">
                    {r.locked === true && <Lock className="size-3.5 text-muted-foreground" aria-label="Submitted" />}
                    {r.title ?? `#${r.id}`}
                  </div>
                  <dl className="mt-1 grid grid-cols-2 gap-x-3 gap-y-1 text-sm">
                    {cols.map((c) => (
                      <div key={c.name} className="min-w-0">
                        <dt className="text-xs text-muted-foreground">{c.label}</dt>
                        <dd className="truncate">{cell(r, c.name)}</dd>
                      </div>
                    ))}
                  </dl>
                </Link>
              </li>
            ))}
          </ul>

          {/* Desktop: table */}
          <div className="hidden overflow-x-auto rounded-xl border md:block">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left">
                <tr>
                  <th className="px-3 py-2 font-medium">
                    <Link href={sortLink("title")} className="inline-flex items-center gap-1">
                      Name {sortIcon("title")}
                    </Link>
                  </th>
                  {cols.map((c) => (
                    <th key={c.name} className="px-3 py-2 font-medium">
                      <Link href={sortLink(c.name)} className="inline-flex items-center gap-1">
                        {c.label} {sortIcon(c.name)}
                      </Link>
                    </th>
                  ))}
                  <th className="px-3 py-2 font-medium">
                    <Link href={sortLink("updated_at")} className="inline-flex items-center gap-1">
                      Modified {sortIcon("updated_at")}
                    </Link>
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-t hover:bg-muted/30">
                    <td className="px-3 py-2">
                      <Link href={recordHref(t, r.id)} className="inline-flex items-center gap-1.5 font-medium underline-offset-4 hover:underline">
                        {r.locked === true && <Lock className="size-3.5 text-muted-foreground" aria-label="Submitted" />}
                        {r.title ?? `#${r.id}`}
                      </Link>
                    </td>
                    {cols.map((c) => (
                      <td key={c.name} className="max-w-64 truncate px-3 py-2">
                        {cell(r, c.name)}
                      </td>
                    ))}
                    <td className="px-3 py-2 whitespace-nowrap text-muted-foreground">{formatDate(String(r.updated_at))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {pages > 1 && (
            <nav aria-label="Pages" className="mt-4 flex items-center justify-center gap-3 text-sm">
              {page > 1 && (
                <Link href={pageLink(page - 1)} className={cn(buttonVariants({ variant: "outline" }), "h-11 px-4")}>
                  Previous
                </Link>
              )}
              <span>
                Page {page} of {pages}
              </span>
              {page < pages && (
                <Link href={pageLink(page + 1)} className={cn(buttonVariants({ variant: "outline" }), "h-11 px-4")}>
                  Next
                </Link>
              )}
            </nav>
          )}
        </>
      )}
    </div>
  );
}
