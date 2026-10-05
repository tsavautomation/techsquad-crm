import { BackLink } from "@/components/shell/back-link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/session";
import { formatDateTime } from "@/lib/dates";
import { listDeleted, userNames } from "@/lib/records/data";
import { canModule } from "@/lib/records/extras";
import { getTable } from "@/registry";
import { canDo } from "@/registry/permissions";
import { tableFromRoute, tableHref } from "@/registry/routes";
import { RestoreButton } from "@/components/records/restore-button";
import { getLang, getT } from "@/i18n/server";
import { localized } from "@/i18n/registry";


export async function generateMetadata(props: PageProps<"/[module]/[tab]/deleted">) {
  const { module, tab } = await props.params;
  return { title: (await getT())("Deleted {name}", { name: (await getT())(tableFromRoute(module, tab)?.label ?? "") }) };
}

/** WebAuthor "Deleted Items": deleted records can be restored by people allowed to delete them. */
export default async function DeletedItemsPage(props: PageProps<"/[module]/[tab]/deleted">) {
  const tr = await getT();
  const { module, tab } = await props.params;
  const t = localized(tableFromRoute(module, tab), await getLang());
  if (!t) notFound();
  const user = await requireUser();
  if (!(await canModule(user.permissions, t, "deleted_items"))) notFound();

  const rows = await listDeleted(t);
  const names = await userNames(rows, ["updated_by"]);
  const canRestore = canDo(user.permissions, t, "delete", getTable);

  return (
    <div className="mx-auto max-w-[1600px]">
      <BackLink fallback={tableHref(t)} label={t.label} />
      <h1 className="mb-4 text-2xl font-semibold">{tr("Deleted")} {t.label}</h1>
      {rows.length === 0 ? (
        <p className="rounded-lg border border-dashed p-8 text-center text-muted-foreground">{tr("Nothing has been deleted.")}</p>
      ) : (
        <ul className="divide-y rounded-2xl border bg-card shadow-card">
          {rows.map((r) => (
            <li key={r.id} className="flex items-center justify-between gap-3 p-3">
              <div className="min-w-0">
                <p className="font-medium">{r.title ?? `#${r.id}`}</p>
                <p className="text-xs text-muted-foreground">
                  {tr("Deleted")} {formatDateTime(r.deleted_at)}
                  {r.updated_by ? ` by ${names.get(r.updated_by) ?? "someone"}` : ""}
                </p>
              </div>
              {canRestore && <RestoreButton table={t.name} id={r.id} />}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
