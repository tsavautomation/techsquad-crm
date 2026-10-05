import { BackLink } from "@/components/shell/back-link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/session";
import { getRecord } from "@/lib/records/data";
import { loadRecord } from "@/lib/records/load";
import { REGISTRY, getTable } from "@/registry";
import { canDo } from "@/registry/permissions";
import { recordHref, tableFromRoute } from "@/registry/routes";
import { RecordForm } from "@/components/records/record-form";
import { RecordToolbar } from "@/components/records/record-toolbar";
import { getLang, getT } from "@/i18n/server";
import { localized } from "@/i18n/registry";


/** Edit (or delete) a sub-list row, e.g. a Contact's Interaction. */
export default async function EditSubRecordPage(props: PageProps<"/[module]/[tab]/[id]/sub/[child]/[childId]/edit">) {
  const tr = await getT();
  const { module, tab, id, child, childId } = await props.params;
  const parent = tableFromRoute(module, tab);
  const t = localized(REGISTRY.find((c) => c.name === child && c.parent?.table === parent?.name), await getLang());
  const parentId = Number(id);
  const rowId = Number(childId);
  if (!parent || !t || !Number.isInteger(parentId) || !Number.isInteger(rowId)) notFound();
  const user = await requireUser();
  if (!canDo(user.permissions, t, "modify", getTable)) notFound();

  const [parentRow, rec] = await Promise.all([getRecord(parent, parentId), loadRecord(t, rowId, user.permissions)]);
  if (!parentRow || !rec || rec.row[t.parent!.field] !== parentId) notFound();

  const back = recordHref(parent, parentId);
  return (
    <div className="mx-auto max-w-5xl">
      <BackLink fallback={back} label={parentRow.title ?? `#${parentId}`} />
      <h1 className="mb-4 text-2xl font-semibold">{tr("Edit")} {rec.row.title ?? t.label.toLowerCase()}</h1>
      <RecordToolbar
        table={t.name}
        id={rowId}
        listHref={back}
        locked={false}
        archived={false}
        can={{ submit: false, lock: false, archive: false, delete: canDo(user.permissions, t, "delete", getTable) }}
      />
      <RecordForm table={t} recordId={rowId} initialValues={rec.values} labels={rec.labels} baseHref={back} cancelHref={back} redirectTo={back} />
    </div>
  );
}
