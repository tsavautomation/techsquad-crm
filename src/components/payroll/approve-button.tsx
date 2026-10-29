"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Lock } from "lucide-react";
import { toast } from "sonner";
import { approvePeriodAction } from "@/lib/payroll/actions";
import { useT } from "@/i18n/client";

/** TC-f: Approve & lock a period that has ended and has nothing left to review. */
export function ApproveButton({ frequency, startsOn, disabledReason }: { frequency: string; startsOn: string; disabledReason: string | null }) {
  const t = useT();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");

  if (disabledReason)
    return (
      <span className="inline-flex h-11 items-center gap-2 rounded-lg border bg-muted px-3 text-sm text-muted-foreground">
        <Lock className="size-4" aria-hidden />
        {disabledReason}
      </span>
    );

  if (!open)
    return (
      <button type="button" onClick={() => setOpen(true)} className="inline-flex h-11 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground hover:opacity-90">
        <Lock className="size-4" aria-hidden />
        {t("Approve & lock period")}
      </button>
    );

  return (
    <form
      className="flex flex-wrap items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = await approvePeriodAction(frequency, startsOn, note);
          if (!r.ok) return void toast.error(t(r.message));
          toast.success(t("Period approved and locked"));
          setOpen(false);
          router.refresh();
        });
      }}
    >
      <input type="text" value={note} onChange={(e) => setNote(e.target.value)} placeholder={t("Note (optional)")} className="h-11 w-full rounded-lg border bg-card px-3 text-base sm:w-64" maxLength={200} />
      <button type="submit" disabled={pending} className="inline-flex h-11 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-60">
        <Lock className="size-4" aria-hidden />
        {t("Confirm: lock this period")}
      </button>
      <button type="button" onClick={() => setOpen(false)} className="h-11 rounded-lg border px-3 text-sm hover:bg-muted">
        {t("Cancel")}
      </button>
      <p className="basis-full text-xs text-muted-foreground">{t("Once locked, the period's clock entries can only be changed by an administrator with a reason; the difference is paid in the next period.")}</p>
    </form>
  );
}
