"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { ProjectPicker } from "@/components/time-clock/person/project-picker";
import { deleteWorkTripAction, saveWorkTripAction } from "@/lib/payroll/overtime-actions";
import { formatDate } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { useT } from "@/i18n/client";

// OT Work trips on an Employee page: the list, a form to add one (for this person and, optionally, several others
// at once) and the pencil to change or remove one. Days inside earn the premium % on every hour.

const INPUT = "h-11 w-full rounded-lg border border-input bg-card px-3 text-base outline-none focus-visible:ring-3 focus-visible:ring-ring/50";
const BTN = "inline-flex h-9 items-center gap-1 rounded-md border px-2 text-xs hover:bg-muted disabled:opacity-50";

export type TripView = { id: number; starts_on: string; ends_on: string; premium_pct: number; project_id: number | null; project: string | null; destination: string | null; note: string | null };
type Draft = { id: number | null; starts_on: string; ends_on: string; premium_pct: string; project_id: number | null; project: string | null; destination: string; note: string; others: number[] };

export function WorkTripsForm({ employeeId, today, trips, canEdit, people }: { employeeId: number; today: string; trips: TripView[]; canEdit: boolean; people: { id: number; name: string }[] }) {
  const t = useT();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [draft, setDraft] = useState<Draft | null>(null);
  const blank = (): Draft => ({ id: null, starts_on: today, ends_on: today, premium_pct: "20", project_id: null, project: null, destination: "", note: "", others: [] });
  const edit = (tr: TripView): Draft => ({ id: tr.id, starts_on: tr.starts_on, ends_on: tr.ends_on, premium_pct: String(tr.premium_pct), project_id: tr.project_id, project: tr.project, destination: tr.destination ?? "", note: tr.note ?? "", others: [] });

  const save = (d: Draft) =>
    start(async () => {
      const r = await saveWorkTripAction({ id: d.id, employeeIds: [employeeId, ...d.others], starts_on: d.starts_on, ends_on: d.ends_on, premium_pct: d.premium_pct, project_id: d.project_id, destination: d.destination, note: d.note });
      if (!r.ok) return void toast.error(t(r.message));
      toast.success(r.adjusted ? t("Saved. {n} approved periods get an adjustment in the next one.", { n: r.adjusted }) : t("Saved"));
      setDraft(null);
      router.refresh();
    });
  const remove = (tr: TripView) => {
    if (!confirm(t("Remove this trip? Its days lose the premium."))) return;
    start(async () => {
      const r = await deleteWorkTripAction(tr.id);
      if (!r.ok) return void toast.error(t(r.message));
      toast.success(r.adjusted ? t("Removed. {n} approved periods get an adjustment in the next one.", { n: r.adjusted }) : t("Removed"));
      setDraft(null);
      router.refresh();
    });
  };

  return (
    <div className="mt-3 flex flex-col gap-3">
      {trips.length === 0 && !draft && <p className="text-sm text-text-2">{t("No trips.")}</p>}
      {trips.length > 0 && (
        <ul className="divide-y rounded-xl border">
          {trips.map((tr) => (
            <li key={tr.id} className="flex items-center justify-between gap-2 px-3 py-2 text-[13px]">
              <span className="min-w-0">
                <b className="tabular-nums">
                  {formatDate(tr.starts_on)} – {formatDate(tr.ends_on)}
                </b>{" "}
                <span className="rounded bg-info-bg px-1.5 text-[11px] font-medium text-info-fg">+{tr.premium_pct}%</span>
                {tr.ends_on < today ? "" : tr.starts_on <= today ? <span className="ml-1 text-xs text-ok-fg">{t("now")}</span> : <span className="ml-1 text-xs text-text-2">{t("upcoming")}</span>}
                <span className="block truncate text-xs text-muted-foreground">{[tr.destination, tr.project, tr.note].filter(Boolean).join(" · ")}</span>
              </span>
              {canEdit && (
                <button type="button" disabled={pending} className={cn(BTN, "shrink-0")} onClick={() => setDraft(edit(tr))} aria-label={t("Edit this trip")}>
                  <Pencil className="size-3.5" aria-hidden />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {canEdit && !draft && (
        <button type="button" onClick={() => setDraft(blank())} className="inline-flex h-11 w-fit items-center gap-1 rounded-[10px] border px-3 text-sm hover:bg-muted">
          <Plus className="size-4" aria-hidden /> {t("New trip")}
        </button>
      )}
      {draft && (
        <form
          className="grid grid-cols-2 gap-2 rounded-xl border bg-muted/40 p-3 sm:grid-cols-3"
          onSubmit={(e) => {
            e.preventDefault();
            save(draft);
          }}
        >
          <label className="block">
            <span className="mb-1 block text-xs text-text-2">{t("First day")}</span>
            <input className={INPUT} type="date" required value={draft.starts_on} onChange={(e) => setDraft({ ...draft, starts_on: e.target.value, ends_on: draft.ends_on < e.target.value ? e.target.value : draft.ends_on })} />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-text-2">{t("Last day")}</span>
            <input className={INPUT} type="date" required min={draft.starts_on} value={draft.ends_on} onChange={(e) => setDraft({ ...draft, ends_on: e.target.value })} />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-text-2">{t("Premium %")}</span>
            <input className={INPUT} type="number" inputMode="decimal" step="0.5" min="0" max="200" required value={draft.premium_pct} onChange={(e) => setDraft({ ...draft, premium_pct: e.target.value })} />
          </label>
          <div className="col-span-2 sm:col-span-3">
            <span className="mb-1 block text-xs text-text-2">{t("Project (optional)")}</span>
            <ProjectPicker value={draft.project_id} label={draft.project} onChange={(id, label) => setDraft({ ...draft, project_id: id, project: label })} />
          </div>
          <label className="col-span-2 block sm:col-span-1">
            <span className="mb-1 block text-xs text-text-2">{t("Destination (optional)")}</span>
            <input className={INPUT} maxLength={200} value={draft.destination} onChange={(e) => setDraft({ ...draft, destination: e.target.value })} />
          </label>
          <label className="col-span-2 block">
            <span className="mb-1 block text-xs text-text-2">{t("Note (optional)")}</span>
            <input className={INPUT} maxLength={500} value={draft.note} onChange={(e) => setDraft({ ...draft, note: e.target.value })} />
          </label>
          {draft.id === null && people.length > 0 && (
            <fieldset className="col-span-2 sm:col-span-3">
              <legend className="mb-1 text-xs text-text-2">{t("Also for (the same trip for each person)")}</legend>
              <div className="flex flex-wrap gap-1.5">
                {people.map((p) => {
                  const on = draft.others.includes(p.id);
                  return (
                    <label key={p.id} className={cn("inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-lg border px-2 text-[13px]", on && "border-primary bg-primary/10")}>
                      <input type="checkbox" className="size-4" checked={on} onChange={(e) => setDraft({ ...draft, others: e.target.checked ? [...draft.others, p.id] : draft.others.filter((x) => x !== p.id) })} />
                      {p.name}
                    </label>
                  );
                })}
              </div>
            </fieldset>
          )}
          <div className="col-span-2 flex flex-wrap items-center gap-1.5 sm:col-span-3">
            <button type="submit" disabled={pending} className="inline-flex h-11 items-center justify-center rounded-[10px] bg-primary px-4 text-sm font-semibold text-primary-foreground hover:brightness-95 disabled:opacity-50">
              {draft.id === null ? (draft.others.length ? t("Add for {n} people", { n: draft.others.length + 1 }) : t("Add trip")) : t("Save")}
            </button>
            <button type="button" onClick={() => setDraft(null)} className="h-11 rounded-[10px] border px-3 text-sm hover:bg-muted">
              {t("Cancel")}
            </button>
            {draft.id !== null && (
              <button type="button" disabled={pending} onClick={() => remove(trips.find((x) => x.id === draft.id)!)} className="ml-auto inline-flex h-11 items-center gap-1 rounded-[10px] border px-3 text-sm text-destructive hover:bg-muted">
                <Trash2 className="size-4" aria-hidden /> {t("Remove")}
              </button>
            )}
          </div>
        </form>
      )}
    </div>
  );
}
