import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, FileText, Lock, Pencil } from "lucide-react";
import { requireUser } from "@/lib/auth/session";
import { MASK } from "@/lib/crypto";
import { formatDateTime } from "@/lib/dates";
import { getRecord, recordsDb, userNames } from "@/lib/records/data";
import { loadRecord } from "@/lib/records/load";
import type { FileItem } from "@/lib/records/values";
import { evaluateRules, type Values } from "@/lib/rules/evaluate";
import { getTable } from "@/registry";
import { canDo, canLockAction, canOpen } from "@/registry/permissions";
import { recordHref, tableFromRoute, tableHref } from "@/registry/routes";
import type { FieldDef, TableDef } from "@/registry/types";
import { FieldValue } from "@/components/records/field-value";
import { SensitiveValue } from "@/components/records/sensitive-value";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export async function generateMetadata(props: PageProps<"/[module]/[tab]/[id]">) {
  const { module, tab, id } = await props.params;
  const t = tableFromRoute(module, tab);
  const row = t && Number.isInteger(Number(id)) ? await getRecord(t, Number(id)) : null;
  return { title: row?.title ?? (t ? `${t.itemLabel} #${id}` : "Not found") };
}

const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

export default async function RecordPage(props: PageProps<"/[module]/[tab]/[id]">) {
  const { module, tab, id } = await props.params;
  const t = tableFromRoute(module, tab);
  const recordId = Number(id);
  if (!t || !Number.isInteger(recordId)) notFound();
  const user = await requireUser();
  if (!canOpen(user.permissions, t, getTable)) notFound();

  const rec = await loadRecord(t, recordId, user.permissions);
  if (!rec) notFound();
  const { row, values, labels } = rec;
  const { visible } = evaluateRules(t, values);
  const [names, computed] = await Promise.all([userNames([row], ["created_by", "updated_by"]), computedValues(t, recordId)]);

  const locked = row.locked === true;
  const canEdit = canDo(user.permissions, t, "modify", getTable) && (!locked || canLockAction(user.permissions, t, "modify_locked", getTable));
  const fields = t.fields.filter((f) => visible.has(f.name) && !(t.parent && f.name === t.parent.field));

  return (
    <div className="mx-auto max-w-3xl">
      <Link href={tableHref(t)} className="mb-2 inline-flex h-11 items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ChevronLeft className="size-4" aria-hidden /> {t.label}
      </Link>
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold break-words">{row.title ?? `${t.itemLabel} #${row.id}`}</h1>
          <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span>#{row.id}</span>
            {locked && (
              <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5">
                <Lock className="size-3" aria-hidden /> Submitted
              </span>
            )}
            {row.archived_at ? <span className="rounded-full bg-muted px-2 py-0.5">Archived</span> : null}
          </p>
        </div>
        {canEdit && (
          <Link href={`${recordHref(t, row.id)}/edit`} className={cn(buttonVariants(), "h-11 shrink-0 gap-1.5 px-4")}>
            <Pencil className="size-4" aria-hidden /> Edit
          </Link>
        )}
      </div>

      <dl className="divide-y rounded-xl border">
        {fields.map((f) => (
          <div key={f.name}>
            {f.heading && <h2 className="bg-muted/40 px-4 py-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">{f.heading}</h2>}
            <div className="grid gap-1 px-4 py-3 sm:grid-cols-3 sm:gap-4">
              <dt className="text-sm text-muted-foreground">{f.label}</dt>
              <dd className="min-w-0 text-sm sm:col-span-2">
                <DetailValue field={f} value={f.type === "computed" ? computed[f.name] : values[f.name]} labels={labels[f.name] ?? {}} />
              </dd>
            </div>
          </div>
        ))}
      </dl>

      <p className="mt-4 text-xs text-muted-foreground">
        Created {formatDateTime(String(row.created_at))}
        {row.created_by ? ` by ${names.get(row.created_by as string) ?? "someone"}` : ""} · Modified {formatDateTime(String(row.updated_at))}
        {row.updated_by ? ` by ${names.get(row.updated_by as string) ?? "someone"}` : ""}
      </p>
    </div>
  );
}

/** Computed fields: Projects › Approved / Invoiced / Paid (SPEC §2.3). */
async function computedValues(t: TableDef, id: number): Promise<Values> {
  if (!t.fields.some((f) => f.type === "computed")) return {};
  const db = await recordsDb();
  const { data } = await db.rpc("project_financials", { p_project_ids: [id] });
  return ((data as Values[] | null) ?? [])[0] ?? {};
}

function DetailValue({ field: f, value, labels }: { field: FieldDef; value: unknown; labels: Record<string, string> }) {
  const none = <span className="text-muted-foreground">—</span>;

  if (f.type === "computed") return <>{money.format(Number(value ?? 0))}</>;

  if (f.type === "file" || f.type === "image" || f.type === "signature") {
    const files = (value as FileItem[] | undefined) ?? [];
    if (!files.length) return none;
    return (
      <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4">
        {files.map((x) => {
          const img = (x.mime ?? "").startsWith("image/");
          return (
            <li key={x.path}>
              <a href={x.url} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-lg border hover:opacity-90">
                {img && x.url ? (
                  // eslint-disable-next-line @next/next/no-img-element -- signed storage URL
                  <img src={x.url} alt={x.name} className={cn("aspect-square w-full", f.type === "signature" ? "bg-white object-contain p-1" : "object-cover")} />
                ) : (
                  <span className="flex aspect-square flex-col items-center justify-center gap-1 p-2 text-center">
                    <FileText className="size-6 text-muted-foreground" aria-hidden />
                    <span className="line-clamp-2 text-xs break-all">{x.name}</span>
                  </span>
                )}
              </a>
            </li>
          );
        })}
      </ul>
    );
  }

  if ((f.type === "lookup" || f.type === "group") && f.multiple) {
    const ids = (value as number[] | undefined) ?? [];
    if (!ids.length) return none;
    const target = f.type === "lookup" && f.lookup ? getTable(f.lookup.table) : undefined;
    return (
      <ul className="flex flex-wrap gap-1.5">
        {ids.map((x) => (
          <li key={x} className="rounded-full border px-2.5 py-0.5 text-xs">
            {target?.tab ? (
              <Link href={recordHref(target, x)} className="hover:underline">
                {labels[String(x)] ?? `#${x}`}
              </Link>
            ) : (
              (labels[String(x)] ?? `#${x}`)
            )}
          </li>
        ))}
      </ul>
    );
  }

  if (f.type === "lookup" || f.type === "user") {
    if (value === null || value === undefined) return none;
    const target = f.type === "lookup" && f.lookup ? getTable(f.lookup.table) : undefined;
    const href = target && (target.tab || target.module === "utility") ? recordHref(target, value as number) : undefined;
    return <FieldValue field={f} value={value} display={labels[String(value)]} href={href} />;
  }

  if (f.type === "richtext") {
    if (!value) return none;
    // Sanitised on save (lib/records/save.ts), so it is safe to render as HTML.
    return <div className="prose prose-sm max-w-none [&_ol]:list-decimal [&_ol]:pl-5 [&_ul]:list-disc [&_ul]:pl-5" dangerouslySetInnerHTML={{ __html: String(value) }} />;
  }

  if (f.type === "ssn" || f.type === "ein") {
    if (!value) return none;
    const d = String(value).replace(/\D/g, "");
    const formatted = f.type === "ssn" ? `${d.slice(0, 3)}-${d.slice(3, 5)}-${d.slice(5)}` : `${d.slice(0, 2)}-${d.slice(2)}`;
    if (f.sensitive) return value === MASK ? <span className="tracking-widest">{MASK}</span> : <SensitiveValue value={formatted} />;
    return <>{formatted}</>;
  }

  if (f.sensitive && typeof value === "string" && value && value !== MASK) return <SensitiveValue value={value} />;
  return <FieldValue field={f} value={value} />;
}
