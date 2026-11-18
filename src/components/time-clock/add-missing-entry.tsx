"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus } from "lucide-react";
import { toast } from "sonner";
import type { EntryKind } from "@/lib/time-clock/clock";
import { addMissingEntryAction } from "@/lib/time-clock/manual";
import { useT } from "@/i18n/client";

// SS-a (Fred 2026-11-18): the office adds an entry the timeline is missing (Left the job, Clocked out, …) for one
// person and day. It is signed with the name of who added it, like the corrections.

const KINDS: { kind: EntryKind; label: string }[] = [
  { kind: "visit_out", label: "Left the job" },
  { kind: "visit_in", label: "Arrived at the job" },
  { kind: "on_way", label: "On my way" },
  { kind: "clock_out", label: "Clocked out" },
  { kind: "clock_in", label: "Clocked in" },
];
const BOX = "h-11 min-w-0 rounded-[10px] border bg-background px-3 text-base";

export function AddMissingEntry({ employeeId, day, visits }: { employeeId: number; day: string; visits: { id: number; label: string }[] }) {
  const t = useT();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [kind, setKind] = useState<EntryKind>("visit_out");
  const [visitId, setVisitId] = useState<number | "">(visits[0]?.id ?? "");
  const [time, setTime] = useState("");
  const [reason, setReason] = useState("");
  const forVisit = kind === "visit_out" || kind === "visit_in" || kind === "on_way";

  if (!open)
    return (
      <button type="button" onClick={() => setOpen(true)} className="mt-2 inline-flex h-9 items-center gap-1 rounded-md px-1.5 text-xs font-medium text-primary hover:bg-muted">
        <Plus className="size-3.5" aria-hidden /> {t("Add missing entry")}
      </button>
    );

  return (
    <form
      className="mt-2 rounded-xl border bg-muted/40 p-2.5"
      onSubmit={(e) => {
        e.preventDefault();
        if (forVisit && visitId === "") return void toast.error(t("Pick the job."));
        start(async () => {
          const r = await addMissingEntryAction({ employeeId, day, kind, time, visitId: forVisit ? (visitId as number) : null, reason });
          if (!r.ok) return void toast.error(t(r.message));
          toast.success(t("Entry added."));
          setOpen(false);
          setTime("");
          setReason("");
          router.refresh();
        });
      }}
    >
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <select value={kind} onChange={(e) => setKind(e.target.value as EntryKind)} aria-label={t("Type")} className={BOX}>
          {KINDS.map((k) => (
            <option key={k.kind} value={k.kind}>
              {t(k.label)}
            </option>
          ))}
        </select>
        {forVisit && (
          <select value={visitId} onChange={(e) => setVisitId(e.target.value ? Number(e.target.value) : "")} aria-label={t("Job")} className={BOX} required>
            {visits.length === 0 && <option value="">{t("No visit on this day")}</option>}
            {visits.map((v) => (
              <option key={v.id} value={v.id}>
                {v.label}
              </option>
            ))}
          </select>
        )}
        <input type="time" value={time} onChange={(e) => setTime(e.target.value)} aria-label={t("Time")} className={BOX} required />
        <input type="text" value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t("Note (optional)")} aria-label={t("Note (optional)")} className={BOX} maxLength={300} />
      </div>
      <div className="mt-2 flex items-center gap-1.5">
        <button type="submit" disabled={pending || (forVisit && visits.length === 0)} className="inline-flex h-9 items-center gap-1 rounded-md bg-primary px-3 text-xs font-semibold text-primary-foreground disabled:opacity-50">
          {pending ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : <Plus className="size-3.5" aria-hidden />} {t("Add")}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="inline-flex h-9 items-center rounded-md border px-2 text-xs hover:bg-muted">
          {t("Cancel")}
        </button>
      </div>
    </form>
  );
}
