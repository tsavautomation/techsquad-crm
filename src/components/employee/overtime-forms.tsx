"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { deleteOvertimeRateAction, deletePersonHoursAction, setOvertimeRateAction, setPersonHoursAction, type HoursInput } from "@/lib/payroll/overtime-actions";
import { formatDate } from "@/lib/dates";
import { useT } from "@/i18n/client";

// OT Overtime: on the Employee's Pay rate card, the overtime rate ($/h, from a date, history) and the person's own
// regular hours per day / week when they differ from the group's. Both look like the Pay rate form.

const INPUT = "h-11 w-full rounded-lg border border-input bg-card px-3 text-base outline-none focus-visible:ring-3 focus-visible:ring-ring/50";
const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
type Result = { ok: true } | { ok: false; message: string };

function useRun() {
  const t = useT();
  const router = useRouter();
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<Result>, done?: () => void) =>
    start(async () => {
      const r = await fn();
      if (!r.ok) return void toast.error(t(r.message));
      toast.success(t("Saved"));
      done?.();
      router.refresh();
    });
  return { pending, run };
}

function History<T extends { id: number }>({ rows, render, onRemove, pending, confirmText }: { rows: T[]; render: (r: T) => React.ReactNode; onRemove: (r: T) => void; pending: boolean; confirmText: string }) {
  const t = useT();
  if (!rows.length) return null;
  return (
    <details className="group rounded-xl border">
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between px-3 text-[13px] font-medium [&::-webkit-details-marker]:hidden">
        {t("History ({n})", { n: rows.length })}
        <ChevronDown className="size-4 text-muted-foreground transition-transform group-open:rotate-180" aria-hidden />
      </summary>
      <ul className="divide-y border-t">
        {rows.map((r) => (
          <li key={r.id} className="flex items-center justify-between gap-2 px-3 py-2 text-[13px]">
            <span className="min-w-0">{render(r)}</span>
            <button
              type="button"
              disabled={pending}
              aria-label={t("Remove")}
              className="inline-flex size-9 shrink-0 items-center justify-center rounded-lg hover:bg-muted"
              onClick={() => {
                if (!confirm(confirmText)) return;
                onRemove(r);
              }}
            >
              <Trash2 className="size-4" aria-hidden />
            </button>
          </li>
        ))}
      </ul>
    </details>
  );
}

type Rate = { id: number; rate: number; from: string; note: string | null };

export function OvertimeRateForm({ employeeId, today, rates }: { employeeId: number; today: string; rates: Rate[] }) {
  const t = useT();
  const { pending, run } = useRun();
  const [rate, setRate] = useState("");
  const [from, setFrom] = useState(today);
  const [note, setNote] = useState("");
  return (
    <div className="mt-3 flex flex-col gap-3">
      <form
        className="grid grid-cols-2 gap-2 sm:grid-cols-[8rem_11rem_1fr_auto]"
        onSubmit={(e) => {
          e.preventDefault();
          run(
            () => setOvertimeRateAction(employeeId, { rate, from, note }),
            () => {
              setRate("");
              setNote("");
            },
          );
        }}
      >
        <label className="block">
          <span className="mb-1 block text-xs text-text-2">{t("Overtime rate per hour")}</span>
          <input className={INPUT} type="number" inputMode="decimal" step="0.01" min="0" required placeholder="0.00" value={rate} onChange={(e) => setRate(e.target.value)} />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs text-text-2">{t("From")}</span>
          <input className={INPUT} type="date" required value={from} onChange={(e) => setFrom(e.target.value)} />
        </label>
        <label className="col-span-2 block sm:col-span-1">
          <span className="mb-1 block text-xs text-text-2">{t("Note (optional)")}</span>
          <input className={INPUT} maxLength={200} value={note} onChange={(e) => setNote(e.target.value)} />
        </label>
        <button type="submit" disabled={pending || !rate} className="col-span-2 inline-flex h-11 items-center justify-center rounded-[10px] bg-primary px-4 text-sm font-semibold text-primary-foreground hover:brightness-95 disabled:opacity-50 sm:col-span-1 sm:self-end">
          {t("Set overtime rate")}
        </button>
      </form>
      <History
        rows={rates}
        pending={pending}
        confirmText={t("Remove this overtime rate? Days from that date on will use the previous one.")}
        onRemove={(r) => run(() => deleteOvertimeRateAction(employeeId, r.id))}
        render={(r) => (
          <>
            <b className="tabular-nums">{money.format(r.rate)}</b> <span className="text-text-2">{t("from {date}", { date: formatDate(r.from) })}</span>
            {r.note && <span className="block truncate text-xs text-muted-foreground">{r.note}</span>}
          </>
        )}
      />
    </div>
  );
}

export type HoursRowView = { id: number; daily: number; weekly: number | null; from: string; note: string | null };

/** The hours fields shared by the person's override and the group panel. */
export function HoursFields({ v, set, submitLabel, pending }: { v: HoursInput; set: (v: HoursInput) => void; submitLabel: string; pending: boolean }) {
  const t = useT();
  return (
    <>
      <label className="block">
        <span className="mb-1 block text-xs text-text-2">{t("Hours per day")}</span>
        <input className={INPUT} type="number" inputMode="decimal" step="0.25" min="1" max="24" required placeholder="9" value={String(v.daily ?? "")} onChange={(e) => set({ ...v, daily: e.target.value })} />
      </label>
      <label className="block">
        <span className="mb-1 block text-xs text-text-2">{t("Hours per week (optional)")}</span>
        <input className={INPUT} type="number" inputMode="decimal" step="0.25" min="1" max="168" placeholder={t("none")} value={String(v.weekly ?? "")} onChange={(e) => set({ ...v, weekly: e.target.value })} />
      </label>
      <label className="block">
        <span className="mb-1 block text-xs text-text-2">{t("From")}</span>
        <input className={INPUT} type="date" required value={v.from} onChange={(e) => set({ ...v, from: e.target.value })} />
      </label>
      <label className="col-span-2 block sm:col-span-1">
        <span className="mb-1 block text-xs text-text-2">{t("Note (optional)")}</span>
        <input className={INPUT} maxLength={200} value={v.note ?? ""} onChange={(e) => set({ ...v, note: e.target.value })} />
      </label>
      <button type="submit" disabled={pending || !v.daily} className="col-span-2 inline-flex h-11 items-center justify-center rounded-[10px] bg-primary px-4 text-sm font-semibold text-primary-foreground hover:brightness-95 disabled:opacity-50 sm:col-span-1 sm:self-end">
        {submitLabel}
      </button>
    </>
  );
}

export const hoursText = (daily: number, weekly: number | null, t: (s: string, v?: Record<string, string | number>) => string) => (weekly === null ? t("{h} h/day", { h: daily / 60 }) : t("{h} h/day · {w} h/week", { h: daily / 60, w: weekly / 60 }));

export function PersonHoursForm({ employeeId, today, rows }: { employeeId: number; today: string; rows: HoursRowView[] }) {
  const t = useT();
  const { pending, run } = useRun();
  const [v, setV] = useState<HoursInput>({ daily: "", weekly: "", from: today, note: "" });
  return (
    <div className="mt-3 flex flex-col gap-3">
      <form
        className="grid grid-cols-2 gap-2 sm:grid-cols-[7rem_9rem_11rem_1fr_auto]"
        onSubmit={(e) => {
          e.preventDefault();
          run(
            () => setPersonHoursAction(employeeId, v),
            () => setV({ daily: "", weekly: "", from: today, note: "" }),
          );
        }}
      >
        <HoursFields v={v} set={setV} submitLabel={t("Set hours")} pending={pending} />
      </form>
      <History
        rows={rows}
        pending={pending}
        confirmText={t("Remove these hours? Days from that date on will use the previous value, or the group's.")}
        onRemove={(r) => run(() => deletePersonHoursAction(employeeId, r.id))}
        render={(r) => (
          <>
            <b className="tabular-nums">{hoursText(r.daily, r.weekly, t)}</b> <span className="text-text-2">{t("from {date}", { date: formatDate(r.from) })}</span>
            {r.note && <span className="block truncate text-xs text-muted-foreground">{r.note}</span>}
          </>
        )}
      />
    </div>
  );
}
