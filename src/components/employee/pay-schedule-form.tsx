"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { deletePayScheduleLinkAction, setPayScheduleAction } from "@/lib/payroll/assign-actions";
import { formatDate } from "@/lib/dates";
import { useT } from "@/i18n/client";

const INPUT = "h-11 w-full rounded-lg border border-input bg-card px-3 text-base outline-none focus-visible:ring-3 focus-visible:ring-ring/50";

type Link = { id: number; name: string; from: string; note: string | null };

/** PS-a: put the person on a pay schedule from a date, and the history with a remove button. */
export function PayScheduleForm({ employeeId, today, canEdit, schedules, links }: { employeeId: number; today: string; canEdit: boolean; schedules: { id: number; name: string }[]; links: Link[] }) {
  const t = useT();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [scheduleId, setScheduleId] = useState<string>(schedules[0] ? String(schedules[0].id) : "none");
  const [from, setFrom] = useState(today);
  const [note, setNote] = useState("");

  const run = (fn: () => Promise<{ ok: true } | { ok: false; message: string }>, done?: () => void) =>
    start(async () => {
      const r = await fn();
      if (!r.ok) return void toast.error(t(r.message));
      toast.success(t("Saved"));
      done?.();
      router.refresh();
    });

  return (
    <div className="mt-3 flex flex-col gap-3">
      {canEdit && (
        <form
          className="grid grid-cols-2 gap-2 sm:grid-cols-[14rem_11rem_1fr_auto]"
          onSubmit={(e) => {
            e.preventDefault();
            run(
              () => setPayScheduleAction(employeeId, { scheduleId: scheduleId === "none" ? null : Number(scheduleId), from, note }),
              () => setNote(""),
            );
          }}
        >
          <label className="block">
            <span className="mb-1 block text-xs text-text-2">{t("Pay schedule")}</span>
            <select className={INPUT} value={scheduleId} onChange={(e) => setScheduleId(e.target.value)}>
              {schedules.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
              <option value="none">{t("Not paid through pay periods")}</option>
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-text-2">{t("From")}</span>
            <input className={INPUT} type="date" required value={from} onChange={(e) => setFrom(e.target.value)} />
          </label>
          <label className="col-span-2 block sm:col-span-1">
            <span className="mb-1 block text-xs text-text-2">{t("Note (optional)")}</span>
            <input className={INPUT} maxLength={200} value={note} onChange={(e) => setNote(e.target.value)} />
          </label>
          <button type="submit" disabled={pending} className="col-span-2 inline-flex h-11 items-center justify-center rounded-[10px] bg-primary px-4 text-sm font-semibold text-primary-foreground hover:brightness-95 disabled:opacity-50 sm:col-span-1 sm:self-end">
            {t("Set schedule")}
          </button>
        </form>
      )}
      {links.length > 0 && (
        <details className="group rounded-xl border">
          <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between px-3 text-[13px] font-medium [&::-webkit-details-marker]:hidden">
            {t("History ({n})", { n: links.length })}
            <ChevronDown className="size-4 text-muted-foreground transition-transform group-open:rotate-180" aria-hidden />
          </summary>
          <ul className="divide-y border-t">
            {links.map((l) => (
              <li key={l.id} className="flex items-center justify-between gap-2 px-3 py-2 text-[13px]">
                <span className="min-w-0">
                  <b>{l.name}</b> <span className="text-text-2">{t("from {date}", { date: formatDate(l.from) })}</span>
                  {l.note && <span className="block truncate text-xs text-muted-foreground">{l.note}</span>}
                </span>
                {canEdit && (
                  <button
                    type="button"
                    disabled={pending}
                    aria-label={t("Remove this link")}
                    className="inline-flex size-9 shrink-0 items-center justify-center rounded-lg hover:bg-muted"
                    onClick={() => {
                      if (!confirm(t("Remove this link? From that date on the earlier choice applies again."))) return;
                      run(() => deletePayScheduleLinkAction(employeeId, l.id));
                    }}
                  >
                    <Trash2 className="size-4" aria-hidden />
                  </button>
                )}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
