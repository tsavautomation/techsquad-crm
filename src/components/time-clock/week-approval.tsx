"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, CheckCheck, Loader2, Lock, LockOpen } from "lucide-react";
import { toast } from "sonner";
import { approveAllAction, approveWeekAction, reopenWeekAction } from "@/lib/time-clock/week-actions";
import { BLOCKER_TEXT, type Blocker, type WeekStatus } from "@/lib/time-clock/week-approval";
import { cn } from "@/lib/utils";
import { useT } from "@/i18n/client";

// TC-h: the status of one person's week and its buttons (Approve / Reopen), plus "Approve all" for the week.

const STATUS_TEXT: Record<WeekStatus, string> = { Open: "Open", Approved: "Approved", Reopened: "Reopened" };
const BTN = "inline-flex h-9 items-center gap-1 rounded-md border px-2 text-xs hover:bg-muted disabled:opacity-50";

export function WeekStatusBadge({ status, approver, compact }: { status: WeekStatus; approver?: string | null; compact?: boolean }) {
  const t = useT();
  return (
    <span
      className={cn(
        "inline-flex h-7 items-center gap-1 rounded-md px-2 text-[12px] font-medium",
        status === "Approved" ? "bg-ok-bg text-ok-fg" : status === "Reopened" ? "bg-warn-bg text-warn-fg" : "bg-muted text-text-2",
      )}
      title={status === "Approved" && approver ? t("Approved by {name}", { name: approver }) : undefined}
    >
      {status === "Approved" ? <Lock className="size-3.5" aria-hidden /> : status === "Reopened" ? <LockOpen className="size-3.5" aria-hidden /> : null}
      {t(STATUS_TEXT[status])}
      {!compact && status === "Approved" && approver && <span className="font-normal opacity-80">· {approver}</span>}
    </span>
  );
}

export function WeekApproval({ employeeId, monday, status, blockers, canApprove, approver }: { employeeId: number; monday: string; status: WeekStatus; blockers: Blocker[]; canApprove: boolean; approver: string | null }) {
  const t = useT();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [reopening, setReopening] = useState(false);
  const [reason, setReason] = useState("");

  if (!canApprove) return <WeekStatusBadge status={status} approver={approver} compact />;

  if (status === "Approved") {
    if (!reopening)
      return (
        <span className="flex flex-wrap items-center justify-end gap-1">
          <WeekStatusBadge status={status} approver={approver} compact />
          <button type="button" className={BTN} onClick={() => setReopening(true)}>
            <LockOpen className="size-3.5" aria-hidden /> {t("Reopen")}
          </button>
        </span>
      );
    return (
      <form
        className="flex flex-wrap items-center justify-end gap-1"
        onSubmit={(e) => {
          e.preventDefault();
          start(async () => {
            const r = await reopenWeekAction(employeeId, monday, reason);
            if (!r.ok) return void toast.error(t(r.message));
            toast.success(t("Week reopened"));
            setReopening(false);
            setReason("");
            router.refresh();
          });
        }}
      >
        <input type="text" value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t("Why reopen? (required)")} className="h-9 w-full rounded-md border bg-card px-2 text-base sm:w-56" aria-label={t("Reason")} maxLength={300} autoFocus />
        <button type="submit" className={BTN} disabled={pending}>
          {pending ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : <LockOpen className="size-3.5" aria-hidden />} {t("Reopen week")}
        </button>
        <button type="button" className={BTN} onClick={() => setReopening(false)}>
          {t("Cancel")}
        </button>
      </form>
    );
  }

  const blocked = blockers.length > 0;
  return (
    <span className="flex flex-wrap items-center justify-end gap-1">
      <WeekStatusBadge status={status} compact />
      <button
        type="button"
        className={cn(BTN, !blocked && "border-primary bg-primary text-primary-foreground hover:opacity-90")}
        disabled={pending || blocked}
        title={blocked ? blockers.map((b) => t(BLOCKER_TEXT[b])).join(" · ") : undefined}
        onClick={() =>
          start(async () => {
            const r = await approveWeekAction(employeeId, monday);
            if (!r.ok) return void toast.error(t(r.message));
            toast.success(t("Week approved and locked"));
            router.refresh();
          })
        }
      >
        {pending ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : <Check className="size-3.5" aria-hidden />} {t("Approve")}
      </button>
      {blocked && <span className="basis-full text-right text-[11px] text-warn-fg">{blockers.map((b) => t(BLOCKER_TEXT[b])).join(" · ")}</span>}
    </span>
  );
}

/** Approves every person of the week whose week can be approved; says who was skipped and why. */
export function ApproveAll({ monday, employeeIds }: { monday: string; employeeIds: number[] }) {
  const t = useT();
  const router = useRouter();
  const [pending, start] = useTransition();
  if (!employeeIds.length) return null;
  return (
    <button
      type="button"
      disabled={pending}
      className="inline-flex h-11 items-center gap-1.5 rounded-[10px] bg-primary px-3 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-60"
      onClick={() => {
        if (!confirm(t("Approve and lock the week for {n} people?", { n: employeeIds.length }))) return;
        start(async () => {
          const r = await approveAllAction(monday, employeeIds);
          if (!r.ok) return void toast.error(t(r.message));
          if (r.approved) toast.success(t("{n} weeks approved", { n: r.approved }));
          for (const s of r.skipped) toast.warning(`${s.name}: ${s.blockers?.length ? s.blockers.map((b) => t(BLOCKER_TEXT[b])).join(" · ") : t(s.why)}`);
          router.refresh();
        });
      }}
    >
      {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <CheckCheck className="size-4" aria-hidden />}
      {t("Approve all ({n})", { n: employeeIds.length })}
    </button>
  );
}
