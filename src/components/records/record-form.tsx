"use client";

import { useEffect, useMemo, useState, useSyncExternalStore, useTransition, Fragment } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button, buttonVariants } from "@/components/ui/button";
import { onUploadsChange, uploadsInProgress } from "@/lib/files/resumable";
import { saveRecordAction } from "@/lib/records/actions";
import { extractFromUploadAction } from "@/lib/records/field-actions";
import { undoChangeAction } from "@/lib/records/record-actions";
import { formatDate } from "@/lib/dates";
import { evaluateRules, type Values } from "@/lib/rules/evaluate";
import { isEditable, type FileItem } from "@/lib/records/values";
import type { FieldDef } from "@/registry/types";
import { cn } from "@/lib/utils";
import type { TableDef } from "@/registry/types";
import { FieldInput, type FieldContext } from "./field-input";
import { VisitAddon } from "./form-addons";
import { useT } from "@/i18n/client";

type Props = {
  table: TableDef;
  recordId: number | null;
  initialValues: Values;
  /** List URL of the table; the saved record opens at `${baseHref}/${id}`. */
  baseHref: string;
  cancelHref: string;
  /** Labels for ids already in the form (linked records, users, groups), by field. */
  labels?: Record<string, Record<string, string>>;
  lockedMessage?: string;
  /** Where to go after saving; default is the saved record's page. */
  redirectTo?: string;
};

/** Field types that take the whole row when the form sits in two columns (wide screens). */
const WIDE_TYPES = new Set<FieldDef["type"]>(["textarea", "richtext", "file", "image", "signature", "address"]);

export function RecordForm({ table, recordId, initialValues, baseHref, cancelHref, labels: initialLabels = {}, lockedMessage, redirectTo }: Props) {
  const t = useT();
  const router = useRouter();
  const [values, setValues] = useState<Values>(initialValues);
  const [labels, setLabels] = useState(initialLabels);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, startTransition] = useTransition();
  // Files still on their way (to OneDrive or CRM storage): saving waits, leaving asks first.
  const uploading = useSyncExternalStore(onUploadsChange, uploadsInProgress, () => 0);
  useEffect(() => {
    if (!uploading) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [uploading]);

  // Rules decide what's visible and required as the user types (SPEC §4).
  const rules = useMemo(() => evaluateRules(table, values), [table, values]);

  function update(name: string, v: unknown) {
    // A pick filtered by this field (e.g. Organization "same Type as this contact") no longer fits: clear it.
    const dependents = table.fields.filter((f) =>
      Object.values(f.lookup?.filter ?? {}).some((rule) => typeof rule === "object" && !Array.isArray(rule) && rule.sameAs === name),
    );
    setValues((prev) => ({ ...prev, [name]: v, ...Object.fromEntries(dependents.map((d) => [d.name, d.multiple ? [] : null])) }));
    if (errors[name])
      setErrors((prev) => {
        const next = { ...prev };
        delete next[name];
        return next;
      });
    readFromUpload(name, v);
  }

  // Upload fields with `extract` (e.g. licence photo → expiry date): read the newly added file with AI.
  function readFromUpload(name: string, v: unknown) {
    const f = table.fields.find((x) => x.name === name);
    if (!f?.extract || !Array.isArray(v)) return;
    const before = new Set(((values[name] as FileItem[] | undefined) ?? []).map((x) => x.path));
    const added = (v as FileItem[]).find((x) => !before.has(x.path) && !x.id);
    if (!added) return;
    const target = table.fields.find((x) => x.name === f.extract!.to);
    const reading = toast.loading(`Reading ${target?.label ?? "the date"} from the photo…`);
    void extractFromUploadAction(table.name, name, added.path).then((r) => {
      toast.dismiss(reading);
      if (!r.ok) return void toast.error(t(r.message));
      if (!r.value) return void toast.warning(`Couldn't read ${target?.label ?? "it"} from the photo. Please type it in.`);
      setValues((prev) => ({ ...prev, [r.field]: r.value }));
      toast.success(`${target?.label ?? "Date"} filled in from the photo: ${formatDate(r.value)}. Please check it.`);
    });
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const result = await saveRecordAction(table.name, recordId, rules.values);
      if (result.ok) {
        const undoId = result.undoId;
        toast.success(t(recordId ? "Saved" : "Created"), {
          duration: undoId ? 8000 : undefined,
          action: undoId
            ? {
                label: t("Undo"),
                onClick: () =>
                  void undoChangeAction(table.name, result.id, undoId).then((r) => {
                    if (!r.ok) return void toast.error(t(r.message));
                    toast.success(t("Change undone"));
                    router.refresh();
                  }),
              }
            : undefined,
        });
        router.push(redirectTo ?? `${baseHref}/${result.id}`);
        router.refresh();
        return;
      }
      setErrors(result.errors);
      const count = Object.keys(result.errors).length;
      toast.error(result.message ? t(result.message) : t(count === 1 ? "Please fix {n} field" : "Please fix {n} fields", { n: count }));
      const first = Object.keys(result.errors)[0];
      if (first) document.getElementById(`f-${first}`)?.focus();
    });
  }

  const ctx: FieldContext = {
    table: table.name,
    recordId,
    form: rules.values,
    labels,
    setMany: (v, l) => {
      setValues((prev) => ({ ...prev, ...v }));
      if (l) setLabels((prev) => ({ ...prev, ...Object.fromEntries(Object.entries(l).map(([k, m]) => [k, { ...prev[k], ...m }])) }));
    },
  };

  const fields = table.fields.filter(
    (f) =>
      rules.visible.has(f.name) &&
      !(table.parent && f.name === table.parent.field) &&
      !(recordId && f.createOnly) &&
      !f.formHidden &&
      // A dropdown whose options haven't been set up yet (Form settings) isn't shown.
      !((f.type === "select" || f.type === "radio" || f.type === "checkboxes") && !f.options?.length),
  );

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-5 pb-24 md:pb-0 lg:grid lg:grid-cols-2 lg:gap-x-8">
      {lockedMessage && <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900 lg:col-span-2">{lockedMessage}</p>}
      {fields.map((f) => {
        const err = errors[f.name];
        const editable = isEditable(f);
        return (
          <Fragment key={f.name}>
          {f.heading && <h2 className="mt-4 border-b pb-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase first:mt-0 lg:col-span-2">{f.heading}</h2>}
          <div className={cn("flex flex-col gap-1.5", WIDE_TYPES.has(f.type) && "lg:col-span-2")}>
            <label id={`f-${f.name}-label`} htmlFor={`f-${f.name}`} className="text-sm font-medium">
              {f.label}
              {rules.required.has(f.name) && <span className="text-destructive"> *</span>}
            </label>
            <FieldInput ctx={ctx} field={f} value={rules.values[f.name]} onChange={(v) => update(f.name, v)} invalid={Boolean(err)} disabled={!editable || pending} />
            {f.help && <p className="text-sm text-muted-foreground">{f.help}</p>}
            {err && (
              <p role="alert" className="text-sm text-destructive">
                {t(err)}
              </p>
            )}
          </div>
          </Fragment>
        );
      })}

      {table.formAddon === "visit" && (
        <div className="lg:col-span-2">
          <VisitAddon form={rules.values} recordId={recordId} setMany={ctx.setMany} />
        </div>
      )}

      {/* Sticky action bar on phones so Save is always reachable. */}
      <div
        className={cn(
          "fixed inset-x-0 bottom-0 z-30 flex gap-3 border-t bg-card p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-[0_-4px_16px_rgb(16_24_40/0.06)]",
          "md:static md:border-0 md:p-0 md:pt-2 lg:col-span-2",
        )}
      >
        <Button type="submit" className="h-11 flex-1 md:flex-none md:px-8" disabled={pending || uploading > 0}>
          {uploading > 0 ? t(uploading > 1 ? "Uploading {n} files…" : "Uploading {n} file…", { n: uploading }) : pending ? t("Saving…") : recordId ? t("Save") : t("Create")}
        </Button>
        <Link href={cancelHref} className={cn(buttonVariants({ variant: "outline" }), "h-11 flex-1 md:flex-none md:px-6")}>
          {t("Cancel")}
        </Link>
      </div>
    </form>
  );
}
