"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { saveAutomationAction } from "@/lib/admin/automation-actions";
import type { AutomationInput } from "@/lib/engine/automation-schema";
import type { Action } from "@/lib/engine/automations";
import type { ConditionRule } from "@/lib/engine/conditions";

export type FieldMeta = { name: string; label: string; type: string; options?: { label: string; value: string }[]; lookup?: boolean };

const INPUT = "h-11 w-full min-w-0 rounded-lg border bg-background px-3 text-base";
const SELECT = INPUT;
const BTN = "inline-flex h-11 items-center justify-center gap-1.5 rounded-lg border px-3 text-sm hover:bg-muted disabled:opacity-50";
const ICON_BTN = "inline-flex size-11 shrink-0 items-center justify-center rounded-lg border hover:bg-muted";

const OPS: { value: ConditionRule["op"]; label: string }[] = [
  { value: "=", label: "is" },
  { value: "!=", label: "is not" },
  { value: "<", label: "less than" },
  { value: "<=", label: "at most" },
  { value: ">", label: "more than" },
  { value: ">=", label: "at least" },
  { value: "empty", label: "is empty" },
  { value: "not_empty", label: "is not empty" },
];

const isDate = (f?: FieldMeta) => f?.type === "date" || f?.type === "datetime";
const csv = (list?: string[]) => (list ?? []).join(", ");
const fromCsv = (s: string) => s.split(/[,;\s]+/).map((x) => x.trim()).filter(Boolean);

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border p-3">
      <h2 className="text-base font-semibold">{title}</h2>
      {hint && <p className="mb-2 text-sm text-muted-foreground">{hint}</p>}
      <div className="space-y-3">{children}</div>
    </section>
  );
}

/** A value input that offers the field's options when it has them. */
function ValueInput({ field, value, onChange }: { field?: FieldMeta; value: unknown; onChange: (v: string | boolean | null) => void }) {
  if (field?.type === "boolean")
    return (
      <select className={SELECT} value={String(Boolean(value))} onChange={(e) => onChange(e.target.value === "true")}>
        <option value="true">Yes</option>
        <option value="false">No</option>
      </select>
    );
  if (field?.options?.length)
    return (
      <select className={SELECT} value={value === null || value === undefined ? "" : String(value)} onChange={(e) => onChange(e.target.value || null)}>
        <option value="">(empty)</option>
        {field.options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    );
  return <input className={INPUT} value={value === null || value === undefined ? "" : String(value)} placeholder="(empty)" onChange={(e) => onChange(e.target.value === "" ? null : e.target.value)} />;
}

function FieldSelect({ fields, value, onChange, filter }: { fields: FieldMeta[]; value: string; onChange: (v: string) => void; filter?: (f: FieldMeta) => boolean }) {
  return (
    <select className={SELECT} value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">Choose a field…</option>
      {fields.filter(filter ?? (() => true)).map((f) => (
        <option key={f.name} value={f.name}>
          {f.label}
        </option>
      ))}
    </select>
  );
}

function RuleRow({ rule, fields, onChange, onRemove }: { rule: ConditionRule; fields: FieldMeta[]; onChange: (r: ConditionRule) => void; onRemove: () => void }) {
  const f = fields.find((x) => x.name === rule.field);
  const mode = rule.days ? "days" : rule.field2 !== undefined ? "field" : "value";
  const noValue = rule.op === "empty" || rule.op === "not_empty";
  return (
    <div className="space-y-2 rounded-lg bg-muted/40 p-2">
      <div className="flex gap-2">
        <FieldSelect fields={fields} value={rule.field} onChange={(field) => onChange({ field, op: "=", value: null })} />
        <button type="button" className={ICON_BTN} aria-label="Remove condition" onClick={onRemove}>
          <Trash2 className="size-4" aria-hidden />
        </button>
      </div>
      {rule.field && (
        <div className="grid gap-2 sm:grid-cols-3">
          <select
            className={SELECT}
            value={mode}
            onChange={(e) => {
              const m = e.target.value;
              if (m === "days") onChange({ field: rule.field, op: ">=", value: 0, days: true });
              else if (m === "field") onChange({ field: rule.field, op: "<=", field2: "" });
              else onChange({ field: rule.field, op: "=", value: null });
            }}
          >
            <option value="value">its value</option>
            {isDate(f) && <option value="days">days since it (past = positive)</option>}
            <option value="field">compared with another field</option>
          </select>
          <select className={SELECT} value={rule.op} onChange={(e) => onChange({ ...rule, op: e.target.value as ConditionRule["op"] })}>
            {OPS.filter((o) => mode === "value" || (o.value !== "empty" && o.value !== "not_empty")).map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          {!noValue &&
            (mode === "days" ? (
              <input className={INPUT} type="number" inputMode="numeric" value={String(rule.value ?? 0)} onChange={(e) => onChange({ ...rule, value: Number(e.target.value) })} />
            ) : mode === "field" ? (
              <FieldSelect fields={fields} value={rule.field2 ?? ""} onChange={(field2) => onChange({ ...rule, field2 })} />
            ) : (
              <ValueInput field={f} value={rule.value} onChange={(value) => onChange({ ...rule, value })} />
            ))}
        </div>
      )}
    </div>
  );
}

function ActionEditor({ action, fields, onChange, onRemove }: { action: Action; fields: FieldMeta[]; onChange: (a: Action) => void; onRemove: () => void }) {
  const TITLES = { update: "Set fields", archive: "Archive the record", checklist: "Add a checklist item", email: "Send an email" };
  return (
    <div className="space-y-2 rounded-lg bg-muted/40 p-2">
      <div className="flex items-center justify-between gap-2">
        <span className="font-medium">{TITLES[action.type]}</span>
        <button type="button" className={ICON_BTN} aria-label="Remove action" onClick={onRemove}>
          <Trash2 className="size-4" aria-hidden />
        </button>
      </div>
      {action.type === "update" && (
        <>
          {Object.entries(action.set).map(([k, v]) => (
            <div key={k} className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
              <FieldSelect
                fields={fields}
                value={k}
                filter={(f) => f.type !== "computed" && !["file", "image", "signature"].includes(f.type)}
                onChange={(nk) => {
                  const set = { ...action.set };
                  delete set[k];
                  onChange({ ...action, set: { ...set, [nk]: null } });
                }}
              />
              <ValueInput field={fields.find((f) => f.name === k)} value={v} onChange={(nv) => onChange({ ...action, set: { ...action.set, [k]: nv } })} />
              <button
                type="button"
                className={ICON_BTN}
                aria-label="Remove field"
                onClick={() => {
                  const set = { ...action.set };
                  delete set[k];
                  onChange({ ...action, set });
                }}
              >
                <Trash2 className="size-4" aria-hidden />
              </button>
            </div>
          ))}
          <button type="button" className={BTN} onClick={() => onChange({ ...action, set: { ...action.set, "": null } })} disabled={"" in action.set}>
            <Plus className="size-4" aria-hidden /> Field to set
          </button>
        </>
      )}
      {action.type === "checklist" && (
        <>
          <label className="block text-sm">
            Add it to
            <select className={SELECT} value={action.target ?? ""} onChange={(e) => onChange({ ...action, target: e.target.value || undefined })}>
              <option value="">this record</option>
              {fields
                .filter((f) => f.lookup)
                .map((f) => (
                  <option key={f.name} value={f.name}>
                    the linked {f.label}
                  </option>
                ))}
            </select>
          </label>
          <label className="block text-sm">
            Item text (use {"{field}"} to insert a value)
            <input className={INPUT} value={action.item} onChange={(e) => onChange({ ...action, item: e.target.value })} />
          </label>
        </>
      )}
      {action.type === "email" && (
        <>
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="block text-sm">
              From (a name, or a tsav.net address)
              <input className={INPUT} value={action.from} onChange={(e) => onChange({ ...action, from: e.target.value })} />
            </label>
            <label className="block text-sm">
              To (commas between; {"{email}"} = the record&apos;s email)
              <input className={INPUT} value={csv(action.to)} onChange={(e) => onChange({ ...action, to: fromCsv(e.target.value) })} />
            </label>
            <label className="block text-sm">
              Bcc
              <input className={INPUT} value={csv(action.bcc)} onChange={(e) => onChange({ ...action, bcc: fromCsv(e.target.value) })} />
            </label>
            <label className="block text-sm">
              Subject (use {"{field}"} to insert a value)
              <input className={INPUT} value={action.subject} onChange={(e) => onChange({ ...action, subject: e.target.value })} />
            </label>
          </div>
          <div className="flex flex-wrap gap-x-4">
            {(
              [
                ["card", "Record details"],
                ["link", "Link to the record"],
                ["pdf", "Record as PDF"],
              ] as const
            ).map(([k, l]) => (
              <label key={k} className="flex min-h-11 items-center gap-2 text-sm">
                <input type="checkbox" className="size-5" checked={Boolean(action[k])} onChange={(e) => onChange({ ...action, [k]: e.target.checked })} />
                {l}
              </label>
            ))}
          </div>
          {fields.some((f) => ["file", "image", "signature"].includes(f.type)) && (
            <div className="text-sm">
              Attach files from:
              <div className="flex flex-wrap gap-x-4">
                {fields
                  .filter((f) => ["file", "image", "signature"].includes(f.type))
                  .map((f) => (
                    <label key={f.name} className="flex min-h-11 items-center gap-2">
                      <input
                        type="checkbox"
                        className="size-5"
                        checked={(action.files ?? []).includes(f.name)}
                        onChange={(e) => onChange({ ...action, files: e.target.checked ? [...(action.files ?? []), f.name] : (action.files ?? []).filter((x) => x !== f.name) })}
                      />
                      {f.label}
                    </label>
                  ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

type Props = { id: number | null; table: string; tableLabel: string; fields: FieldMeta[]; initial: AutomationInput; editable: boolean };

export function AutomationEditor({ id, table, tableLabel, fields, initial, editable }: Props) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [a, setA] = useState<AutomationInput>(initial);
  const [problems, setProblems] = useState<string[]>([]);
  const fieldEvents = a.events.filter((e) => e.startsWith("field:")).map((e) => e.slice(6));
  const setEvent = (e: string, on: boolean) => setA({ ...a, events: on ? [...a.events.filter((x) => x !== e), e] : a.events.filter((x) => x !== e) });

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const clean = { ...a, actions: a.actions.map((x) => (x.type === "update" ? { ...x, set: Object.fromEntries(Object.entries(x.set).filter(([k]) => k)) } : x)) };
          const r = await saveAutomationAction(id, table, clean);
          setProblems(r.ok ? [] : (r.problems ?? [r.message]));
          if (!r.ok) return void toast.error(r.message);
          toast.success("Saved");
          if (!id && r.id) router.push(`/admin/automations/${r.id}`);
          else router.refresh();
        });
      }}
    >
      <fieldset disabled={!editable || pending} className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
          <label className="block text-sm font-medium">
            Title
            <input className={INPUT} value={a.title} onChange={(e) => setA({ ...a, title: e.target.value })} />
          </label>
          <label className="flex min-h-11 items-center gap-2 self-end text-base">
            <input type="checkbox" className="size-5" checked={a.active} onChange={(e) => setA({ ...a, active: e.target.checked })} /> Active
          </label>
        </div>

        <Section title="When" hint={`Which ${tableLabel} events start it.`}>
          <div className="flex flex-wrap gap-x-4">
            {(
              [
                ["added", "A record is added"],
                ["modified", "A record is changed"],
                ["daily", "Every day after midnight"],
                ["hourly", "Every hour"],
              ] as const
            ).map(([e, l]) => (
              <label key={e} className="flex min-h-11 items-center gap-2 text-sm">
                <input type="checkbox" className="size-5" checked={a.events.includes(e)} onChange={(ev) => setEvent(e, ev.target.checked)} />
                {l}
              </label>
            ))}
          </div>
          <div className="text-sm">
            A specific field changes:
            <div className="mt-1 flex flex-wrap gap-2">
              {fieldEvents.map((f) => (
                <button key={f} type="button" className="rounded-full border px-3 py-1.5 text-sm hover:bg-muted" onClick={() => setEvent(`field:${f}`, false)}>
                  {fields.find((x) => x.name === f)?.label ?? f} ✕
                </button>
              ))}
              <select className="h-9 rounded-lg border bg-background px-2 text-sm" value="" onChange={(e) => e.target.value && setEvent(`field:${e.target.value}`, true)}>
                <option value="">+ add field…</option>
                {fields
                  .filter((f) => !fieldEvents.includes(f.name))
                  .map((f) => (
                    <option key={f.name} value={f.name}>
                      {f.label}
                    </option>
                  ))}
              </select>
            </div>
          </div>
        </Section>

        <Section title="If" hint="Leave empty to always run.">
          {a.conditions.rules.length > 1 && (
            <select className={SELECT} value={a.conditions.match} onChange={(e) => setA({ ...a, conditions: { ...a.conditions, match: e.target.value as "all" | "any" } })}>
              <option value="all">All of these are true</option>
              <option value="any">Any of these is true</option>
            </select>
          )}
          {a.conditions.rules.map((r, i) => (
            <RuleRow
              key={i}
              rule={r}
              fields={fields}
              onChange={(nr) => setA({ ...a, conditions: { ...a.conditions, rules: a.conditions.rules.map((x, j) => (j === i ? nr : x)) } })}
              onRemove={() => setA({ ...a, conditions: { ...a.conditions, rules: a.conditions.rules.filter((_, j) => j !== i) } })}
            />
          ))}
          <button type="button" className={BTN} onClick={() => setA({ ...a, conditions: { ...a.conditions, rules: [...a.conditions.rules, { field: "", op: "=", value: null }] } })}>
            <Plus className="size-4" aria-hidden /> Condition
          </button>
        </Section>

        <Section title="Then">
          {a.actions.map((x, i) => (
            <ActionEditor
              key={i}
              action={x as Action}
              fields={fields}
              onChange={(nx) => setA({ ...a, actions: a.actions.map((y, j) => (j === i ? (nx as AutomationInput["actions"][number]) : y)) })}
              onRemove={() => setA({ ...a, actions: a.actions.filter((_, j) => j !== i) })}
            />
          ))}
          <select
            className={SELECT}
            value=""
            onChange={(e) => {
              const type = e.target.value;
              const blank: Record<string, AutomationInput["actions"][number]> = {
                update: { type: "update", set: { "": null } },
                email: { type: "email", from: "TS CRM", to: [], subject: "", card: true, link: true },
                checklist: { type: "checklist", item: "" },
                archive: { type: "archive" },
              };
              if (blank[type]) setA({ ...a, actions: [...a.actions, blank[type]] });
            }}
          >
            <option value="">+ Add an action…</option>
            <option value="update">Set fields</option>
            <option value="email">Send an email</option>
            <option value="checklist">Add a checklist item</option>
            <option value="archive">Archive the record</option>
          </select>
        </Section>

        <label className="block text-sm font-medium">
          Notes
          <textarea className="min-h-20 w-full rounded-lg border bg-background p-3 text-base" value={a.notes ?? ""} onChange={(e) => setA({ ...a, notes: e.target.value })} />
        </label>

        {problems.length > 0 && (
          <ul className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
            {problems.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        )}
        {editable && (
          <button type="submit" className="h-11 rounded-lg border border-foreground bg-foreground px-5 text-sm font-medium text-background disabled:opacity-50">
            {id ? "Save" : "Create automation"}
          </button>
        )}
      </fieldset>
    </form>
  );
}
