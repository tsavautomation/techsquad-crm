"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button, buttonVariants } from "@/components/ui/button";
import { saveRecordAction } from "@/lib/records/actions";
import { evaluateRules, type Values } from "@/lib/rules/evaluate";
import { isEditable } from "@/lib/records/values";
import { cn } from "@/lib/utils";
import type { TableDef } from "@/registry/types";
import { FieldInput, type FieldContext } from "./field-input";

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
};

export function RecordForm({ table, recordId, initialValues, baseHref, cancelHref, labels: initialLabels = {}, lockedMessage }: Props) {
  const router = useRouter();
  const [values, setValues] = useState<Values>(initialValues);
  const [labels, setLabels] = useState(initialLabels);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, startTransition] = useTransition();

  // Rules decide what's visible and required as the user types (SPEC §4).
  const rules = useMemo(() => evaluateRules(table, values), [table, values]);

  function update(name: string, v: unknown) {
    setValues((prev) => ({ ...prev, [name]: v }));
    if (errors[name])
      setErrors((prev) => {
        const next = { ...prev };
        delete next[name];
        return next;
      });
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const result = await saveRecordAction(table.name, recordId, rules.values);
      if (result.ok) {
        toast.success(recordId ? "Saved" : "Created");
        router.push(`${baseHref}/${result.id}`);
        router.refresh();
        return;
      }
      setErrors(result.errors);
      const count = Object.keys(result.errors).length;
      toast.error(result.message ?? `Please fix ${count} field${count === 1 ? "" : "s"}`);
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

  const fields = table.fields.filter((f) => rules.visible.has(f.name) && !(table.parent && f.name === table.parent.field));

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-5 pb-24 md:pb-0">
      {lockedMessage && <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">{lockedMessage}</p>}
      {fields.map((f) => {
        const err = errors[f.name];
        const editable = isEditable(f);
        return (
          <div key={f.name} className="flex flex-col gap-1.5">
            {f.heading && <h2 className="mt-4 border-b pb-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase first:mt-0">{f.heading}</h2>}
            <label id={`f-${f.name}-label`} htmlFor={`f-${f.name}`} className="text-sm font-medium">
              {f.label}
              {rules.required.has(f.name) && <span className="text-destructive"> *</span>}
            </label>
            <FieldInput ctx={ctx} field={f} value={rules.values[f.name]} onChange={(v) => update(f.name, v)} invalid={Boolean(err)} disabled={!editable || pending} />
            {err && (
              <p role="alert" className="text-sm text-destructive">
                {err}
              </p>
            )}
          </div>
        );
      })}

      {/* Sticky action bar on phones so Save is always reachable. */}
      <div
        className={cn(
          "fixed inset-x-0 bottom-14 z-30 flex gap-3 border-t bg-background p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]",
          "md:static md:border-0 md:p-0 md:pt-2",
        )}
      >
        <Button type="submit" className="h-11 flex-1 md:flex-none md:px-8" disabled={pending}>
          {pending ? "Saving…" : recordId ? "Save" : `Create ${table.newRecordLabel.replace(/^New /, "").toLowerCase()}`}
        </Button>
        <Link href={cancelHref} className={cn(buttonVariants({ variant: "outline" }), "h-11 flex-1 md:flex-none md:px-6")}>
          Cancel
        </Link>
      </div>
    </form>
  );
}
