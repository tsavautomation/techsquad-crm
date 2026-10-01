import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { requireUser } from "@/lib/auth/session";
import { lookupTitles } from "@/lib/records/data";
import { isEditable, newRecordValues } from "@/lib/records/values";
import { getTable } from "@/registry";
import { canDo } from "@/registry/permissions";
import type { FieldDef } from "@/registry/types";
import { tableFromRoute, tableHref } from "@/registry/routes";
import { RecordForm } from "@/components/records/record-form";
import { getLang, getT } from "@/i18n/server";
import { localized } from "@/i18n/registry";

export async function generateMetadata(props: PageProps<"/[module]/[tab]/new">) {
  const { module, tab } = await props.params;
  return { title: (await getT())(tableFromRoute(module, tab)?.newRecordLabel ?? "Not found") };
}

export default async function NewRecordPage(props: PageProps<"/[module]/[tab]/new">) {
  const { module, tab } = await props.params;
  const t = localized(tableFromRoute(module, tab), await getLang());
  if (!t) notFound();
  const user = await requireUser();
  if (!canDo(user.permissions, t, "create", getTable)) notFound();
  const base = tableHref(t);

  // Starting values from the link, e.g. the calendar's "?starts_at=…&technician_id=3".
  const params = (await props.searchParams) as Record<string, string | undefined>;
  const initial = newRecordValues(t);
  const prefilled: FieldDef[] = [];
  for (const f of t.fields) {
    const raw = params[f.name];
    if (typeof raw !== "string" || !raw || !isEditable(f)) continue;
    if (f.type === "lookup" && !f.multiple && /^d+$/.test(raw)) initial[f.name] = Number(raw);
    else if (f.type === "datetime" && !Number.isNaN(Date.parse(raw))) initial[f.name] = new Date(raw).toISOString();
    else if (f.type === "date" && /^d{4}-d{2}-d{2}$/.test(raw)) initial[f.name] = raw;
    else if ((f.type === "select" || f.type === "radio") && f.options?.some((o) => o.value === raw)) initial[f.name] = raw;
    else continue;
    prefilled.push(f);
  }
  const titles = await lookupTitles(t, [initial], prefilled.filter((f) => f.type === "lookup"));
  const labels = Object.fromEntries(Object.entries(titles).map(([k, m]) => [k, Object.fromEntries([...m].map(([id, title]) => [String(id), title]))]));

  return (
    <div className="mx-auto max-w-2xl">
      <Link href={base} className="mb-2 inline-flex h-11 items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ChevronLeft className="size-4" aria-hidden /> {t.label}
      </Link>
      <h1 className="mb-6 text-2xl font-semibold">{t.newRecordLabel}</h1>
      <RecordForm table={t} recordId={null} initialValues={initial} labels={labels} baseHref={base} cancelHref={params.back?.startsWith("/") ? params.back : base} />
    </div>
  );
}
