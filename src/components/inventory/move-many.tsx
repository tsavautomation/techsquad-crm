"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import { toast } from "sonner";
import { moveManyAction } from "@/lib/inventory/actions";
import { MOVEMENTS, STATUS_TONE, movementOf, type MovementKey, type StockStatus } from "@/lib/inventory/engine";
import type { PickLists, StockUnit } from "@/lib/inventory/load";
import { canMove, validateMovement } from "@/lib/inventory/rules";
import { cn } from "@/lib/utils";
import { useT } from "@/i18n/client";

// INV-e "Move selected": one movement for several units (same project, responsible, location and note).
// Each unit is checked against the movement rules; the ones that cannot take it are listed and left out.

const BOX = "w-full rounded-lg border border-input bg-card px-3 text-base outline-none focus-visible:ring-3 focus-visible:ring-ring/50";
const BTN = "inline-flex h-11 items-center justify-center gap-1.5 rounded-[10px] bg-primary px-4 text-sm font-semibold text-primary-foreground hover:brightness-95 disabled:opacity-50";

function Badge({ status }: { status: StockStatus }) {
  const t = useT();
  return <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-xs font-medium", STATUS_TONE[status].badge)}>{t(status)}</span>;
}

export function MoveMany({ units, lists, onClose, onDone }: { units: StockUnit[]; lists: PickLists; onClose: () => void; onDone: () => void }) {
  const t = useT();
  const router = useRouter();
  const [movement, setMovement] = useState<MovementKey | "">("");
  const [projectId, setProjectId] = useState<number | null>(null);
  const [staffId, setStaffId] = useState<number | null>(null);
  const [locationId, setLocationId] = useState<number | null>(lists.locations.find((l) => l.kind === "Warehouse")?.id ?? null);
  const [note, setNote] = useState("");
  const [pending, start] = useTransition();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  const mv = movement ? movementOf(movement) : undefined;
  const locationName = lists.locations.find((l) => l.id === locationId)?.name ?? null;
  const problems = mv ? units.map((u) => ({ u, why: validateMovement(mv.key, u.status, { projectId, staffId, location: locationName, note, fromProjectId: u.projectId }) })).filter((x) => x.why) : [];
  const okCount = mv ? units.length - problems.length : 0;
  const stageProblem = problems.find((p) => !canMove(mv!.key, p.u.status));
  const needs = mv && !stageProblem ? validateMovement(mv.key, units.find((u) => canMove(mv.key, u.status))?.status ?? null, { projectId, staffId, location: locationName, note }) : null;

  const submit = () =>
    start(async () => {
      if (!mv) return;
      const r = await moveManyAction({ itemIds: units.filter((u) => canMove(mv.key, u.status)).map((u) => u.id), movement: mv.key, projectId, staffId, locationId, note });
      if (!r.ok) return void toast.error(t(r.message));
      toast.success(t("{n} units moved · {to}", { n: r.moved, to: t(mv.to) }));
      if (r.skipped.length) toast.warning(t("{n} left out: {list}", { n: r.skipped.length, list: r.skipped.map((s) => `${s.serial} (${t(s.why)})`).join(", ") }));
      router.refresh();
      onDone();
    });

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 md:items-center" onClick={onClose}>
      <form
        role="dialog"
        aria-modal="true"
        className="max-h-[92dvh] w-full max-w-lg overflow-y-auto rounded-t-2xl bg-card p-4 shadow-card md:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault();
          if (mv && okCount > 0 && !needs && !pending) submit();
        }}
      >
        <div className="mb-3 flex items-start justify-between gap-2">
          <h2 className="text-[15px] font-semibold">{t("Move {n} units", { n: units.length })}</h2>
          <button type="button" onClick={onClose} aria-label={t("Close")} className="inline-flex size-10 items-center justify-center rounded-full hover:bg-muted">
            <X className="size-5" aria-hidden />
          </button>
        </div>
        <ul className="mb-3 max-h-32 overflow-y-auto rounded-lg border text-sm">
          {units.map((u) => (
            <li key={u.id} className="flex items-center justify-between gap-2 px-3 py-1">
              <span className="truncate">
                <span className="font-mono font-semibold">{u.serial || t("No serial")}</span> · {u.product}
              </span>
              <Badge status={u.status} />
            </li>
          ))}
        </ul>
        <fieldset>
          <legend className="mb-1 text-sm font-medium">{t("Movement")}</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {MOVEMENTS.map((m) => {
              const possible = units.some((u) => canMove(m.key, u.status));
              return (
                <button key={m.key} type="button" disabled={!possible} onClick={() => setMovement(m.key)} aria-pressed={movement === m.key} className={cn("flex min-h-11 items-center justify-between gap-2 rounded-lg border px-3 py-2 text-left text-sm disabled:opacity-40", movement === m.key ? "border-primary bg-primary/10 font-semibold" : "hover:bg-muted")}>
                  <span>{t(m.label)}</span>
                  <Badge status={m.to} />
                </button>
              );
            })}
          </div>
        </fieldset>
        {mv && (
          <div className="mt-3 flex flex-col gap-3">
            <label className="block text-sm font-medium">
              {t("Client / site (project)")}
              <select value={projectId ?? ""} onChange={(e) => setProjectId(e.target.value ? Number(e.target.value) : null)} className={`${BOX} mt-1 h-11`}>
                <option value="">{mv.wantsProject ? t("Choose…") : t("None")}</option>
                {lists.projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.title}
                  </option>
                ))}
              </select>
            </label>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block text-sm font-medium">
                {t("Responsible")}
                <select value={staffId ?? ""} onChange={(e) => setStaffId(e.target.value ? Number(e.target.value) : null)} className={`${BOX} mt-1 h-11`}>
                  <option value="">{t("None")}</option>
                  {lists.employees.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.title}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-sm font-medium">
                {t("Location (when it comes back to stock)")}
                <select value={locationId ?? ""} onChange={(e) => setLocationId(e.target.value ? Number(e.target.value) : null)} className={`${BOX} mt-1 h-11`}>
                  <option value="">{t("Choose…")}</option>
                  {lists.locations.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <label className="block text-sm font-medium">
              {t("Note")}
              <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} maxLength={500} className={`${BOX} mt-1 py-2`} placeholder={mv.key === "rma_out" ? t("Reason (required)") : t("Optional")} />
            </label>
            {needs && <p className="text-sm text-warn-fg">{t(needs)}</p>}
            {problems.length > 0 && !needs && (
              <p className="text-xs text-text-2">
                {t("{n} of the selected units cannot take this movement and will be left out:", { n: problems.length })} {problems.map((p) => p.u.serial ?? `#${p.u.id}`).join(", ")}
              </p>
            )}
            <button type="submit" disabled={pending || okCount === 0 || Boolean(needs)} className={BTN}>
              {pending ? t("Saving…") : t("Move {n} units", { n: okCount })}
            </button>
          </div>
        )}
      </form>
    </div>
  );
}
