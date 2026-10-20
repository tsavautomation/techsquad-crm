"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Car, Loader2, LogIn, LogOut, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { visitStepAction, visitUndoStepAction } from "@/lib/field-day/actions";
import { clockAction } from "@/lib/time-clock/actions";
import { currentPosition } from "@/lib/time-clock/geo-client";
import { cn } from "@/lib/utils";
import { useT } from "@/i18n/client";

// "On my way" / Check in / Check out (F2). Check-out opens the visit's Job Report, filled in.
// P2: the phone's position goes with each step (time clock), asked only when the button is pressed.
// F20-d: when the check-out was the last visit of the day and the person is still clocked in, a prompt asks
// "Done for the day?" with Clock out / Stay clocked in, because "Left the job" was being mistaken for a clock-out.

const BTN = "inline-flex h-11 flex-1 items-center justify-center gap-1.5 rounded-[10px] px-4 text-sm font-semibold disabled:opacity-60 sm:flex-none";

export function StepButtons({ id, status }: { id: number; status: string }) {
  const t = useT();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [doneForDay, setDoneForDay] = useState<{ next: string } | null>(null);
  if (status === "Done" || status === "Cancelled") return doneForDay ? <DoneForDay next={doneForDay.next} /> : null;

  const run = (step: "on_way" | "check_in" | "check_out") => {
    setBusy(step);
    setError(null);
    start(async () => {
      const geo = await currentPosition();
      const r = await visitStepAction(id, step, geo);
      if (!r.ok) setError(t(r.message));
      else if (r.next && r.askClockOut) {
        setDoneForDay({ next: r.next });
        router.refresh();
      } else if (r.next) router.push(r.next);
      else router.refresh();
      setBusy(null);
    });
  };
  const undo = () => {
    setBusy("undo");
    setError(null);
    start(async () => {
      const r = await visitUndoStepAction(id);
      if (!r.ok) setError(t(r.message));
      else toast.success(t(status === "On the way" ? "On my way undone." : "Check-in undone."));
      router.refresh();
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
      {/* J-n (Jessica 2026-10-20): pressed the wrong visit? Take the last step back; its time and position go with it. */}
      {(status === "On the way" || status === "On site") && (
        <button type="button" className="inline-flex h-11 items-center gap-1.5 self-start text-sm text-muted-foreground underline-offset-2 hover:underline disabled:opacity-60" disabled={pending} onClick={undo}>
          {busy === "undo" && pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Undo2 className="size-4" aria-hidden />} {t(status === "On the way" ? "Undo On my way" : "Undo check-in")}
        </button>
      )}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {doneForDay && <DoneForDay next={doneForDay.next} />}
    </div>
  );
}

function DoneForDay({ next }: { next: string }) {
  const t = useT();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [choice, setChoice] = useState<"out" | "stay" | null>(null);
  const stay = () => {
    setChoice("stay");
    router.push(next);
  };
  const clockOut = () => {
    setChoice("out");
    start(async () => {
      const geo = await currentPosition();
      const r = await clockAction("clock_out", geo);
      if (!r.ok) toast.error(t(r.message));
      else toast.success(t("Clocked out. Now the report."));
      router.push(next);
    });
  };
  return (
    <div className="fixed inset-0 z-[120] flex items-end justify-center bg-black/50 p-4 md:items-center" role="dialog" aria-modal="true">
      <div className="w-full max-w-sm rounded-2xl bg-card p-5 shadow-xl">
        <h2 className="text-[19px] font-semibold tracking-tight">{t("Done for the day?")}</h2>
        <p className="mt-1 text-sm text-text-2">{t("That was your last visit today and you are still clocked in. Leaving the job does not clock you out.")}</p>
        <div className="mt-4 flex flex-col gap-2">
          <button type="button" onClick={clockOut} disabled={choice !== null} className={cn(BTN, "bg-primary text-primary-foreground hover:brightness-95")}>
            {choice === "out" && pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <LogOut className="size-4" aria-hidden />} {t("Clock out")}
          </button>
          <button type="button" onClick={stay} disabled={choice !== null} className={cn(BTN, "border bg-card hover:bg-muted")}>
            {t("Stay clocked in")}
          </button>
        </div>
      </div>
    </div>
  );
}
