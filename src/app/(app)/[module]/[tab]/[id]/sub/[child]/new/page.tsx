import { BackLink } from "@/components/shell/back-link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/session";
import { getRecord } from "@/lib/records/data";
import { newRecordValues } from "@/lib/records/values";
import { REGISTRY, getTable } from "@/registry";
import { canDo, fieldsFor } from "@/registry/permissions";
import { recordHref, tableFromRoute } from "@/registry/routes";
import { getLang } from "@/i18n/server";
import { localized } from "@/i18n/registry";

import { RecordForm } from "@/components/records/record-form";

/** Add a sub-list row to a record, e.g. an Interaction on a Contact. */
export default async function NewSubRecordPage(props: PageProps<"/[module]/[tab]/[id]/sub/[child]/new">) {
  const { module, tab, id, child } = await props.params;
  const parent = tableFromRoute(module, tab);
  const t = localized(REGISTRY.find((c) => c.name === child && c.parent?.table === parent?.name), await getLang());
  const parentId = Number(id);
  if (!parent || !t || !Number.isInteger(parentId)) notFound();
  const user = await requireUser();
  if (!canDo(user.permissions, t, "create", getTable)) notFound();
  const parentRow = await getRecord(parent, parentId);
  if (!parentRow) notFound();

  const back = recordHref(parent, parentId);
  return (
    <div className="mx-auto max-w-5xl">
      <BackLink fallback={back} label={parentRow.title ?? `#${parentId}`} />
      <h1 className="mb-6 text-2xl font-semibold">{t.newRecordLabel}</h1>
      <RecordForm
        table={fieldsFor(t, user.permissions, user.isSysadmin)}
        recordId={null}
        initialValues={{ ...newRecordValues(t), [t.parent!.field]: parentId }}
        baseHref={back}
        cancelHref={back}
        redirectTo={back}
      />
    </div>
  );
}
