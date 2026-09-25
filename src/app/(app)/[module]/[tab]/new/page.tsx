import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { requireUser } from "@/lib/auth/session";
import { newRecordValues } from "@/lib/records/values";
import { getTable } from "@/registry";
import { canDo } from "@/registry/permissions";
import { tableFromRoute, tableHref } from "@/registry/routes";
import { RecordForm } from "@/components/records/record-form";

export async function generateMetadata(props: PageProps<"/[module]/[tab]/new">) {
  const { module, tab } = await props.params;
  return { title: tableFromRoute(module, tab)?.newRecordLabel ?? "Not found" };
}

export default async function NewRecordPage(props: PageProps<"/[module]/[tab]/new">) {
  const { module, tab } = await props.params;
  const t = tableFromRoute(module, tab);
  if (!t) notFound();
  const user = await requireUser();
  if (!canDo(user.permissions, t, "create", getTable)) notFound();
  const base = tableHref(t);

  return (
    <div className="mx-auto max-w-2xl">
      <Link href={base} className="mb-2 inline-flex h-11 items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ChevronLeft className="size-4" aria-hidden /> {t.label}
      </Link>
      <h1 className="mb-6 text-2xl font-semibold">{t.newRecordLabel}</h1>
      <RecordForm table={t} recordId={null} initialValues={newRecordValues(t)} baseHref={base} cancelHref={base} />
    </div>
  );
}
