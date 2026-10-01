"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Car, Loader2, LogIn, LogOut } from "lucide-react";
import { visitStepAction } from "@/lib/field-day/actions";
import { cn } from "@/lib/utils";
import { useT } from "@/i18n/client";

// "On my way" / Check in / Check out (F2). Check-out opens the visit's Job Report, filled in.

const BTN = "inline-flex h-11 flex-1 items-center justify-center gap-1.5 rounded-[10px] px-4 text-[14px] font-semibold disabled:opacity-60 sm:flex-none";

export function StepButtons({ id, status }: { id: number; status: string }) {
  const t = useT();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  if (status === "Done" || status === "Cancelled") return null;

  const run = (step: "on_way" | "check_in" | "check_out") => {
    setBusy(step);
    setError(null);
    start(async () => {
      const r = await visitStepAction(id, step);
      if (!r.ok) setError(t(r.message));
      else if (r.next) router.push(r.next);
      else router.refresh();
      setBusy(null);
    });
  };
  const icon = (step: string, Icon: typeof Car) => (busy === step && pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Icon className="size-4" aria-hidden />);

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap gap-2">
        {status === "Scheduled" && (
          <button type="button" className={cn(BTN, "border bg-card hover:bg-muted")} disabled={pending} onClick={() => run("on_way")}>
            {icon("on_way", Car)} {t("On my way")}
          </button>
        )}
        {(status === "Scheduled" || status === "On the way") && (
          <button type="button" className={cn(BTN, "bg-primary text-primary-foreground hover:brightness-95")} disabled={pending} onClick={() => run("check_in")}>
            {icon("check_in", LogIn)} {t("Check in")}
          </button>
        )}
        {status === "On site" && (
          <button type="button" className={cn(BTN, "bg-ok-bg text-ok-fg hover:brightness-95")} disabled={pending} onClick={() => run("check_out")}>
            {icon("check_out", LogOut)} {t("Check out and write the report")}
          </button>
        )}
      </div>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
