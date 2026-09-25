import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { requireUser } from "@/lib/auth/session";
import { getRecord } from "@/lib/records/data";
import { newRecordValues } from "@/lib/records/values";
import { REGISTRY, getTable } from "@/registry";
import { canDo } from "@/registry/permissions";
import { recordHref, tableFromRoute } from "@/registry/routes";
import { RecordForm } from "@/components/records/record-form";

/** Add a sub-list row to a record, e.g. an Interaction on a Contact. */
export default async function NewSubRecordPage(props: PageProps<"/[module]/[tab]/[id]/sub/[child]/new">) {
  const { module, tab, id, child } = await props.params;
  const parent = tableFromRoute(module, tab);
  const t = REGISTRY.find((c) => c.name === child && c.parent?.table === parent?.name);
  const parentId = Number(id);
  if (!parent || !t || !Number.isInteger(parentId)) notFound();
  const user = await requireUser();
  if (!canDo(user.permissions, t, "create", getTable)) notFound();
  const parentRow = await getRecord(parent, parentId);
  if (!parentRow) notFound();

  const back = recordHref(parent, parentId);
  return (
    <div className="mx-auto max-w-2xl">
      <Link href={back} className="mb-2 inline-flex h-11 items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ChevronLeft className="size-4" aria-hidden /> {parentRow.title ?? `#${parentId}`}
      </Link>
      <h1 className="mb-6 text-2xl font-semibold">{t.newRecordLabel === "New Record" ? `New ${t.label.replace(/s$/, "")}` : t.newRecordLabel}</h1>
      <RecordForm
        table={t}
        recordId={null}
        initialValues={{ ...newRecordValues(t), [t.parent!.field]: parentId }}
        baseHref={back}
        cancelHref={back}
        redirectTo={back}
      />
    </div>
  );
}
