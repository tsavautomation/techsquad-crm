import Link from "next/link";
import { notFound } from "next/navigation";
import { FormSettingsEditor, type FieldState } from "@/components/admin/form-settings-editor";
import { requireUser } from "@/lib/auth/session";
import { REGISTRY } from "@/registry";
import { baseFields } from "@/registry/overrides";

export const metadata = { title: "Form settings" };

export default async function FormSettingsPage(props: PageProps<"/admin/forms/[table]">) {
  const user = await requireUser(); // also loads the current settings into the registry
  if (!user.permissions.has("projects.module.design_design")) notFound();
  const { table } = await props.params;
  const t = REGISTRY.find((x) => x.name === table);
  if (!t) notFound();

  const base = new Map(baseFields(t).map((f) => [f.name, f]));
  const usedByRules = new Set([
    ...t.rules.flatMap((r) => [...r.when.map((c) => c.field), ...r.then.map((a) => a.field)]),
    ...[...(t.titleFormula ?? "").matchAll(/\{(\w+)\}/g)].map((m) => m[1]),
  ]);

  const initial: FieldState[] = t.fields
    .filter((f) => !f.hidden)
    .map((f) => ({
      name: f.name,
      type: f.type,
      label: f.label,
      baseLabel: base.get(f.name)?.label ?? f.label,
      required: Boolean(f.required),
      requiredLocked: f.name === t.parent?.field || f.type === "computed" || Boolean(f.readOnly),
      help: f.help ?? "",
      heading: f.heading,
      options: f.options && ["select", "radio", "checkboxes"].includes(f.type) ? f.options.map((o) => ({ value: o.value, label: o.label, color: o.color, retired: o.retired })) : undefined,
      inRules: usedByRules.has(f.name),
    }));

  return (
    <div className="mx-auto max-w-2xl">
      <p className="text-sm text-muted-foreground">
        <Link href="/admin/forms" className="underline underline-offset-4">
          Form settings
        </Link>
      </p>
      <h1 className="mb-1 text-2xl font-semibold">{t.label}</h1>
      <p className="mb-4 text-sm text-muted-foreground">Tap a field to change it. Use the arrows to change the order. Save when done.</p>
      <FormSettingsEditor key={JSON.stringify(initial)} table={t.name} initial={initial} canEdit />
    </div>
  );
}
