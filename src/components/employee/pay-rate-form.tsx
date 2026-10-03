"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { deletePayRateAction, setPayRateAction } from "@/lib/costing/actions";
import { formatDate } from "@/lib/dates";
import { useT } from "@/i18n/client";

const INPUT = "h-11 w-full rounded-lg border border-input bg-card px-3 text-base outline-none focus-visible:ring-3 focus-visible:ring-ring/50";
const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

type Rate = { id: number; rate: number; from: string; note: string | null };

/** Set a new rate from a date, and the history with a remove button (F13-a). */
export function PayRateForm({ employeeId, today, rates }: { employeeId: number; today: string; rates: Rate[] }) {
  const t = useT();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [rate, setRate] = useState("");
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
      <form
        className="grid grid-cols-2 gap-2 sm:grid-cols-[8rem_11rem_1fr_auto]"
        onSubmit={(e) => {
          e.preventDefault();
          run(
            () => setPayRateAction(employeeId, { rate, from, note }),
            () => {
              setRate("");
              setNote("");
            },
          );
        }}
      >
        <label className="block">
          <span className="mb-1 block text-[12.5px] text-text-2">{t("Rate per hour")}</span>
          <input className={INPUT} type="number" inputMode="decimal" step="0.01" min="0" required placeholder="0.00" value={rate} onChange={(e) => setRate(e.target.value)} />
        </label>
        <label className="block">
          <span className="mb-1 block text-[12.5px] text-text-2">{t("From")}</span>
          <input className={INPUT} type="date" required value={from} onChange={(e) => setFrom(e.target.value)} />
        </label>
        <label className="col-span-2 block sm:col-span-1">
          <span className="mb-1 block text-[12.5px] text-text-2">{t("Note (optional)")}</span>
          <input className={INPUT} maxLength={200} placeholder={t("e.g. raise after review")} value={note} onChange={(e) => setNote(e.target.value)} />
        </label>
        <button type="submit" disabled={pending || !rate} className="col-span-2 inline-flex h-11 items-center justify-center rounded-[10px] bg-primary px-4 text-sm font-semibold text-primary-foreground hover:brightness-95 disabled:opacity-50 sm:col-span-1 sm:self-end">
          {t("Set rate")}
        </button>
      </form>
      {rates.length > 0 && (
        <details className="group rounded-xl border">
          <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between px-3 text-[13.5px] font-medium [&::-webkit-details-marker]:hidden">
            {t("History ({n})", { n: rates.length })}
            <ChevronDown className="size-4 text-muted-foreground transition-transform group-open:rotate-180" aria-hidden />
          </summary>
          <ul className="divide-y border-t">
            {rates.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-2 px-3 py-2 text-[13px]">
                <span className="min-w-0">
                  <b className="tabular-nums">{money.format(r.rate)}</b> <span className="text-text-2">{t("from {date}", { date: formatDate(r.from) })}</span>
                  {r.note && <span className="block truncate text-[12px] text-muted-foreground">{r.note}</span>}
                </span>
                <button
                  type="button"
                  disabled={pending}
                  aria-label={t("Remove this rate")}
                  className="inline-flex size-9 shrink-0 items-center justify-center rounded-lg hover:bg-muted"
                  onClick={() => {
                    if (!confirm(t("Remove this rate? Visits from that date on will use the previous one."))) return;
                    run(() => deletePayRateAction(employeeId, r.id));
                  }}
                >
                  <Trash2 className="size-4" aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
