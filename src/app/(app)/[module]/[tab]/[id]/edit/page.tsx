import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { requireUser } from "@/lib/auth/session";
import { getRecord, rowValues } from "@/lib/records/data";
import { getTable } from "@/registry";
import { canDo, canLockAction } from "@/registry/permissions";
import { recordHref, tableFromRoute, tableHref } from "@/registry/routes";
import { RecordForm } from "@/components/records/record-form";

export default async function EditRecordPage(props: PageProps<"/[module]/[tab]/[id]/edit">) {
  const { module, tab, id } = await props.params;
  const t = tableFromRoute(module, tab);
  const recordId = Number(id);
  if (!t || !Number.isInteger(recordId)) notFound();
  const user = await requireUser();
  if (!canDo(user.permissions, t, "modify", getTable)) notFound();

  const row = await getRecord(t, recordId);
  if (!row) notFound();
  const locked = row.locked === true;
  if (locked && !canLockAction(user.permissions, t, "modify_locked", getTable)) notFound();
  const href = recordHref(t, recordId);

  return (
    <div className="mx-auto max-w-2xl">
      <Link href={href} className="mb-2 inline-flex h-11 items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ChevronLeft className="size-4" aria-hidden /> {row.title ?? `#${recordId}`}
      </Link>
      <h1 className="mb-6 text-2xl font-semibold">Edit {t.itemLabel.toLowerCase()}</h1>
      <RecordForm
        table={t}
        recordId={recordId}
        initialValues={rowValues(t, row, user.permissions)}
        baseHref={tableHref(t)}
        cancelHref={href}
        lockedMessage={locked ? "This record has been submitted. You can edit it because your group may change submitted records." : undefined}
      />
    </div>
  );
}
