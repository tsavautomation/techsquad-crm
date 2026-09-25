"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, ChevronDown, Plus, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { resetFormSettingsAction, saveFormSettingsAction } from "@/lib/admin/form-settings-actions";

export type OptionState = { value: string; label: string; color?: string; retired?: boolean; isNew?: boolean };
export type FieldState = {
  name: string;
  type: string;
  label: string;
  baseLabel: string;
  required: boolean;
  /** Parent links and calculated fields can't be made optional / required. */
  requiredLocked: boolean;
  help: string;
  heading?: string;
  options?: OptionState[];
  /** Used in record titles, rules or automations (shown as a caution when renaming options). */
  inRules: boolean;
};

const INPUT = "h-11 w-full min-w-0 rounded-lg border bg-background px-3 text-base";
const ICON_BTN = "inline-flex size-11 shrink-0 items-center justify-center rounded-lg border hover:bg-muted disabled:opacity-30";
const TYPES: Record<string, string> = { select: "Dropdown", radio: "Choice buttons", checkboxes: "Tick boxes", boolean: "Yes / No", lookup: "Link", date: "Date", datetime: "Date & time", money: "Money", textarea: "Long text", richtext: "Formatted text", file: "Files", image: "Photos", signature: "Signature" };

function OptionsEditor({ field, onChange }: { field: FieldState; onChange: (o: OptionState[]) => void }) {
  const opts = field.options ?? [];
  const [draft, setDraft] = useState("");
  const move = (i: number, d: number) => {
    const next = [...opts];
    [next[i], next[i + d]] = [next[i + d], next[i]];
    onChange(next);
  };
  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">Options</p>
      {opts.map((o, i) => (
        <div key={o.value} className={`flex items-center gap-2 ${o.retired ? "opacity-60" : ""}`}>
          <input
            type="color"
            aria-label={`Colour of ${o.label}`}
            className="h-11 w-11 shrink-0 cursor-pointer rounded-lg border bg-background p-1"
            value={o.color ?? "#9e9e9e"}
            onChange={(e) => onChange(opts.map((x, j) => (j === i ? { ...x, color: e.target.value } : x)))}
          />
          <input className={INPUT} aria-label="Option label" value={o.label} onChange={(e) => onChange(opts.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} />
          <button type="button" className={ICON_BTN} aria-label="Move up" disabled={i === 0} onClick={() => move(i, -1)}>
            <ArrowUp className="size-4" aria-hidden />
          </button>
          <button type="button" className={ICON_BTN} aria-label="Move down" disabled={i === opts.length - 1} onClick={() => move(i, 1)}>
            <ArrowDown className="size-4" aria-hidden />
          </button>
          {o.isNew ? (
            <button type="button" className="h-11 shrink-0 rounded-lg border px-2 text-xs hover:bg-muted" onClick={() => onChange(opts.filter((_, j) => j !== i))}>
              Remove
            </button>
          ) : (
            <button type="button" className="h-11 w-20 shrink-0 rounded-lg border px-2 text-xs hover:bg-muted" onClick={() => onChange(opts.map((x, j) => (j === i ? { ...x, retired: !x.retired } : x)))}>
              {o.retired ? "Bring back" : "Retire"}
            </button>
          )}
        </div>
      ))}
      <div className="flex gap-2">
        <input className={INPUT} placeholder="New option" value={draft} onChange={(e) => setDraft(e.target.value)} />
        <button
          type="button"
          className="inline-flex h-11 shrink-0 items-center gap-1 rounded-lg border px-3 text-sm hover:bg-muted"
          onClick={() => {
            const label = draft.trim();
            if (!label) return;
            if (opts.some((o) => o.value.toLowerCase() === label.toLowerCase() || o.label.toLowerCase() === label.toLowerCase())) return void toast.error("That option already exists.");
            onChange([...opts, { value: label, label, isNew: true }]);
            setDraft("");
          }}
        >
          <Plus className="size-4" aria-hidden /> Add
        </button>
      </div>
      <p className="text-xs text-muted-foreground">
        Renaming changes what people see; records keep their stored value. Retired options disappear from new choices but old records still show them.
        {field.inRules && " Rules or automations use this field: they keep working after a rename because they match the stored value."}
      </p>
    </div>
  );
}

export function FormSettingsEditor({ table, initial, canEdit }: { table: string; initial: FieldState[]; canEdit: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [fields, setFields] = useState(initial);
  const [open, setOpen] = useState<string | null>(null);
  const dirty = JSON.stringify(fields) !== JSON.stringify(initial);
  const set = (i: number, patch: Partial<FieldState>) => setFields(fields.map((f, j) => (j === i ? { ...f, ...patch } : f)));
  const move = (i: number, d: number) => {
    const next = [...fields];
    [next[i], next[i + d]] = [next[i + d], next[i]];
    setFields(next);
  };

  const save = () =>
    start(async () => {
      const r = await saveFormSettingsAction(
        table,
        fields.map((f) => ({ name: f.name, label: f.label, required: f.required, help: f.help, options: f.options?.map(({ value, label, color, retired }) => ({ value, label, color, retired })) })),
      );
      if (!r.ok) return void toast.error(r.message);
      toast.success("Form saved. Everyone sees the change within a minute.");
      router.refresh();
    });

  return (
    <div className="pb-24">
      <fieldset disabled={!canEdit || pending}>
        <ul className="divide-y rounded-xl border">
          {fields.map((f, i) => (
            <li key={f.name}>
              {f.heading && <p className="bg-muted/40 px-3 pt-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">{f.heading}</p>}
              <div className="flex items-center gap-2 px-3 py-2">
                <button type="button" className="flex min-h-11 min-w-0 flex-1 items-center justify-between gap-2 text-left" onClick={() => setOpen(open === f.name ? null : f.name)} aria-expanded={open === f.name}>
                  <span className="min-w-0">
                    <span className="block truncate text-base">
                      {f.label}
                      {f.required && <span className="text-destructive"> *</span>}
                    </span>
                    <span className="block text-xs text-muted-foreground">
                      {TYPES[f.type] ?? "Text"}
                      {f.label !== f.baseLabel && ` · was “${f.baseLabel}”`}
                    </span>
                  </span>
                  <ChevronDown className={`size-4 shrink-0 transition-transform ${open === f.name ? "rotate-180" : ""}`} aria-hidden />
                </button>
                <button type="button" className={ICON_BTN} aria-label={`Move ${f.label} up`} disabled={i === 0} onClick={() => move(i, -1)}>
                  <ArrowUp className="size-4" aria-hidden />
                </button>
                <button type="button" className={ICON_BTN} aria-label={`Move ${f.label} down`} disabled={i === fields.length - 1} onClick={() => move(i, 1)}>
                  <ArrowDown className="size-4" aria-hidden />
                </button>
              </div>
              {open === f.name && (
                <div className="space-y-3 border-t bg-muted/20 p-3">
                  <label className="block text-sm font-medium">
                    Label
                    <input className={INPUT} value={f.label} onChange={(e) => set(i, { label: e.target.value })} />
                  </label>
                  {!f.requiredLocked && (
                    <label className="flex min-h-11 items-center gap-3 text-base">
                      <input type="checkbox" className="size-5" checked={f.required} onChange={(e) => set(i, { required: e.target.checked })} /> Required
                    </label>
                  )}
                  <label className="block text-sm font-medium">
                    Help text (shown under the field)
                    <input className={INPUT} value={f.help} maxLength={300} onChange={(e) => set(i, { help: e.target.value })} />
                  </label>
                  {f.options && <OptionsEditor field={f} onChange={(options) => set(i, { options })} />}
                </div>
              )}
            </li>
          ))}
        </ul>
      </fieldset>

      {canEdit && (
        <div className="mt-4">
          <button
            type="button"
            className="inline-flex h-11 items-center gap-1.5 rounded-lg border px-3 text-sm hover:bg-muted"
            disabled={pending}
            onClick={() => {
              if (!confirm("Put this whole form back as it came from WebAuthor? Labels, options, order and help text changes are removed.")) return;
              start(async () => {
                const r = await resetFormSettingsAction(table);
                if (!r.ok) return void toast.error(r.message);
                toast.success("Form reset");
                router.refresh();
              });
            }}
          >
            <RotateCcw className="size-4" aria-hidden /> Reset form to original
          </button>
        </div>
      )}

      {dirty && canEdit && (
        <div className="sticky bottom-16 z-20 mt-4 flex items-center justify-between gap-3 rounded-xl border bg-background p-3 shadow-lg md:bottom-4">
          <span className="text-sm">Unsaved changes</span>
          <span className="flex gap-2">
            <button type="button" className="h-11 rounded-lg border px-4 text-sm hover:bg-muted" disabled={pending} onClick={() => setFields(initial)}>
              Undo
            </button>
            <button type="button" className="h-11 rounded-lg border border-foreground bg-foreground px-4 text-sm font-medium text-background disabled:opacity-50" disabled={pending} onClick={save}>
              Save form
            </button>
          </span>
        </div>
      )}
    </div>
  );
}
