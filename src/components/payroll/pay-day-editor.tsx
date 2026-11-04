"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CalendarClock } from "lucide-react";
import { toast } from "sonner";
import { setPayDayAction } from "@/lib/payroll/actions";
import { formatDate } from "@/lib/dates";
import { useT } from "@/i18n/client";

/** PS-a: move one period's pay day (a holiday) without touching the cycle, or put it back. */
export function PayDayEditor({ scheduleId, startsOn, payDay, moved, cycleDay }: { scheduleId: number; startsOn: string; payDay: string; moved: boolean; cycleDay: string }) {
  const t = useT();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);
  const [day, setDay] = useState(payDay);
  const [note, setNote] = useState("");

  const run = (value: string | null) =>
    start(async () => {
      const r = await setPayDayAction(scheduleId, startsOn, value, note);
      if (!r.ok) return void toast.error(t(r.message));
      toast.success(t("Saved"));
      setOpen(false);
      router.refresh();
    });

  if (!open)
    return (
      <span className="inline-flex flex-wrap items-center gap-x-2 text-[13px] text-text-2">
        <span>
          {t("Pay day {date}", { date: formatDate(payDay) })}
          {moved && <span className="ml-1 rounded bg-warn-bg px-1.5 py-0.5 text-xs text-warn-fg">{t("moved from {date}", { date: formatDate(cycleDay) })}</span>}
        </span>
        <button type="button" onClick={() => setOpen(true)} className="inline-flex min-h-9 items-center gap-1 rounded-lg px-2 text-primary hover:underline">
          <CalendarClock className="size-4" aria-hidden /> {t("Change")}
        </button>
      </span>
    );

  return (
    <form
      className="flex flex-wrap items-end gap-2 text-[13px]"
      onSubmit={(e) => {
        e.preventDefault();
        run(day);
      }}
    >
      <label className="block">
        <span className="mb-1 block text-xs text-text-2">{t("Pay day for this period only")}</span>
        <input type="date" value={day} onChange={(e) => setDay(e.target.value)} className="h-11 rounded-lg border bg-card px-3 text-base" required />
      </label>
      <label className="block">
        <span className="mb-1 block text-xs text-text-2">{t("Note (optional)")}</span>
        <input value={note} onChange={(e) => setNote(e.target.value)} placeholder={t("e.g. Thanksgiving")} className="h-11 rounded-lg border bg-card px-3 text-base" maxLength={200} />
      </label>
      <button type="submit" disabled={pending} className="h-11 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-60">
        {t("Save")}
      </button>
      {moved && (
        <button type="button" disabled={pending} onClick={() => run(null)} className="h-11 rounded-lg border px-3 text-sm hover:bg-muted">
          {t("Back to the cycle ({date})", { date: formatDate(cycleDay) })}
        </button>
      )}
      <button type="button" onClick={() => setOpen(false)} className="h-11 rounded-lg border px-3 text-sm hover:bg-muted">
        {t("Cancel")}
      </button>
    </form>
  );
}
