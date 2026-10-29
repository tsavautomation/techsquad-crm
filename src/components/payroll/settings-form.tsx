"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { savePayrollSettingsAction } from "@/lib/payroll/actions";
import { FREQUENCIES, type PayrollSettings } from "@/lib/payroll/periods";
import { useT } from "@/i18n/client";

/** TC-e: the biweekly anchor Monday and the pay day (days after the period ends) per frequency. */
export function PayrollSettingsForm({ initial }: { initial: PayrollSettings }) {
  const t = useT();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState(initial.biweekly_anchor);
  const [days, setDays] = useState(initial.days_after);
  const BOX = "h-11 w-full rounded-lg border bg-card px-3 text-base";

  if (!open)
    return (
      <button type="button" onClick={() => setOpen(true)} className="h-11 rounded-lg border px-3 text-sm hover:bg-muted">
        {t("Settings")}
      </button>
    );

  return (
    <form
      className="basis-full rounded-2xl border bg-card px-[18px] py-4 shadow-card"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = await savePayrollSettingsAction({ biweekly_anchor: anchor, days_after: days });
          if (!r.ok) return void toast.error(t(r.message));
          toast.success(t("Settings saved"));
          setOpen(false);
          router.refresh();
        });
      }}
    >
      <h2 className="text-[15px] font-semibold tracking-tight">{t("Pay period settings")}</h2>
      <p className="mb-3 text-xs text-muted-foreground">{t("The biweekly cycle counts 14 days from the anchor Monday. The pay day is the period's last day plus the days below.")}</p>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="block text-sm font-medium">
          {t("Biweekly anchor (a Monday)")}
          <input type="date" value={anchor} onChange={(e) => setAnchor(e.target.value)} className={`${BOX} mt-1`} required />
        </label>
        {FREQUENCIES.map((f) => (
          <label key={f} className="block text-sm font-medium">
            {t("{frequency}: pay day, days after the period", { frequency: t(f) })}
            <input type="number" inputMode="numeric" min={0} max={31} value={days[f]} onChange={(e) => setDays({ ...days, [f]: Math.max(0, Math.min(31, Number(e.target.value) || 0)) })} className={`${BOX} mt-1`} />
          </label>
        ))}
      </div>
      <div className="mt-3 flex gap-2">
        <button type="submit" disabled={pending} className="h-11 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-60">
          {t("Save")}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="h-11 rounded-lg border px-3 text-sm hover:bg-muted">
          {t("Cancel")}
        </button>
      </div>
    </form>
  );
}
