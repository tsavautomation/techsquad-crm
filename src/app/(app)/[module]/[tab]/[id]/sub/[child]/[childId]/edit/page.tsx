import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { requireUser } from "@/lib/auth/session";
import { getRecord } from "@/lib/records/data";
import { loadRecord } from "@/lib/records/load";
import { REGISTRY, getTable } from "@/registry";
import { canDo } from "@/registry/permissions";
import { recordHref, tableFromRoute } from "@/registry/routes";
import { RecordForm } from "@/components/records/record-form";
import { RecordToolbar } from "@/components/records/record-toolbar";

/** Edit (or delete) a sub-list row, e.g. a Contact's Interaction. */
export default async function EditSubRecordPage(props: PageProps<"/[module]/[tab]/[id]/sub/[child]/[childId]/edit">) {
  const { module, tab, id, child, childId } = await props.params;
  const parent = tableFromRoute(module, tab);
  const t = REGISTRY.find((c) => c.name === child && c.parent?.table === parent?.name);
  const parentId = Number(id);
  const rowId = Number(childId);
  if (!parent || !t || !Number.isInteger(parentId) || !Number.isInteger(rowId)) notFound();
  const user = await requireUser();
  if (!canDo(user.permissions, t, "modify", getTable)) notFound();

  const [parentRow, rec] = await Promise.all([getRecord(parent, parentId), loadRecord(t, rowId, user.permissions)]);
  if (!parentRow || !rec || rec.row[t.parent!.field] !== parentId) notFound();

  const back = recordHref(parent, parentId);
  return (
    <div className="mx-auto max-w-2xl">
      <Link href={back} className="mb-2 inline-flex h-11 items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ChevronLeft className="size-4" aria-hidden /> {parentRow.title ?? `#${parentId}`}
      </Link>
      <h1 className="mb-4 text-2xl font-semibold">Edit {rec.row.title ?? t.label.toLowerCase()}</h1>
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
