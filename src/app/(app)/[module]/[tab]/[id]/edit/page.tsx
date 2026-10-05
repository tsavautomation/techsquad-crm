import { BackLink } from "@/components/shell/back-link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/session";
import { loadRecord } from "@/lib/records/load";
import { getTable } from "@/registry";
import { canDo, canLockAction, fieldsFor } from "@/registry/permissions";
import { recordHref, tableFromRoute, tableHref } from "@/registry/routes";
import { RecordForm } from "@/components/records/record-form";
import { getLang, getT } from "@/i18n/server";
import { localized } from "@/i18n/registry";


export default async function EditRecordPage(props: PageProps<"/[module]/[tab]/[id]/edit">) {
  const tr = await getT();
  const { module, tab, id } = await props.params;
  const t = localized(tableFromRoute(module, tab), await getLang());
  const recordId = Number(id);
  if (!t || !Number.isInteger(recordId)) notFound();
  const user = await requireUser();
  if (!canDo(user.permissions, t, "modify", getTable)) notFound();

  const rec = await loadRecord(t, recordId, user.permissions);
  if (!rec) notFound();
  const locked = rec.row.locked === true;
  if (locked && !canLockAction(user.permissions, t, "modify_locked", getTable)) notFound();
  const href = recordHref(t, recordId);

  return (
    <div className="mx-auto max-w-5xl">
      <BackLink fallback={href} label={rec.row.title ?? `#${recordId}`} />
      <h1 className="mb-6 text-2xl font-semibold">{tr("Edit")} {t.itemLabel.toLowerCase()}</h1>
      <RecordForm
        table={fieldsFor(t, user.permissions, user.isSysadmin)}
        recordId={recordId}
        initialValues={rec.values}
        labels={rec.labels}
        baseHref={tableHref(t)}
        cancelHref={href}
        lockedMessage={locked ? tr("This record has been submitted. You can edit it because your group may change submitted records.") : undefined}
      />
    </div>
  );
}
