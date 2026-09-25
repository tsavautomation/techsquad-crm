import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, Lock, Pencil } from "lucide-react";
import { requireUser } from "@/lib/auth/session";
import { formatDateTime } from "@/lib/dates";
import { getRecord, lookupTitles, rowValues, userNames } from "@/lib/records/data";
import { evaluateRules } from "@/lib/rules/evaluate";
import { getTable } from "@/registry";
import { canDo, canLockAction, canOpen } from "@/registry/permissions";
import { recordHref, tableFromRoute, tableHref } from "@/registry/routes";
import { FieldValue } from "@/components/records/field-value";
import { SensitiveValue } from "@/components/records/sensitive-value";
import { MASK } from "@/lib/crypto";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export async function generateMetadata(props: PageProps<"/[module]/[tab]/[id]">) {
  const { module, tab, id } = await props.params;
  const t = tableFromRoute(module, tab);
  const row = t && Number.isInteger(Number(id)) ? await getRecord(t, Number(id)) : null;
  return { title: row?.title ?? (t ? `${t.itemLabel} #${id}` : "Not found") };
}

export default async function RecordPage(props: PageProps<"/[module]/[tab]/[id]">) {
  const { module, tab, id } = await props.params;
  const t = tableFromRoute(module, tab);
  const recordId = Number(id);
  if (!t || !Number.isInteger(recordId)) notFound();
  const user = await requireUser();
  if (!canOpen(user.permissions, t, getTable)) notFound();

  const row = await getRecord(t, recordId);
  if (!row) notFound();

  const values = rowValues(t, row, user.permissions);
  const { visible } = evaluateRules(t, values);
  const [titles, names] = await Promise.all([
    lookupTitles(t, [row]),
    userNames([row], ["created_by", "updated_by", ...t.fields.filter((f) => f.type === "user").map((f) => f.name)]),
  ]);

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
        {fields.map((f) => {
          const v = values[f.name];
          const display = f.type === "lookup" ? titles[f.name]?.get(v as number) : f.type === "user" ? names.get(v as string) : undefined;
          const target = f.type === "lookup" && f.lookup ? getTable(f.lookup.table) : undefined;
          const href = target && display && (target.tab || target.module === "utility") ? recordHref(target, v as number) : undefined;
          return (
            <div key={f.name}>
              {f.heading && <h2 className="bg-muted/40 px-4 py-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">{f.heading}</h2>}
              <div className="grid gap-1 px-4 py-3 sm:grid-cols-3 sm:gap-4">
                <dt className="text-sm text-muted-foreground">{f.label}</dt>
                <dd className="text-sm sm:col-span-2">
                  {["file", "image", "signature", "computed"].includes(f.type) ? (
                    <span className="text-muted-foreground">Shown from the next update (M6)</span>
                  ) : f.sensitive && typeof v === "string" && v && v !== MASK ? (
                    <SensitiveValue value={v} />
                  ) : (
                    <FieldValue field={f} value={v} display={display} href={href} />
                  )}
                </dd>
              </div>
            </div>
          );
        })}
      </dl>

      <p className="mt-4 text-xs text-muted-foreground">
        Created {formatDateTime(String(row.created_at))}
        {row.created_by ? ` by ${names.get(row.created_by as string) ?? "someone"}` : ""} · Modified {formatDateTime(String(row.updated_at))}
        {row.updated_by ? ` by ${names.get(row.updated_by as string) ?? "someone"}` : ""}
      </p>
    </div>
  );
}
