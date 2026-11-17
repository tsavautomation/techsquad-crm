"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, Plus, X } from "lucide-react";
import { toast } from "sonner";
import { adjustBankAction, cancelTimeOffAction, decideTimeOffAction, enterTimeOffAction, requestTimeOffAction, type RequestInput } from "@/lib/time-clock/time-off";
import { bankHours, hourChoices, POLICIES, requestDays, type Policy } from "@/lib/time-clock/time-off-rules";
import { cn } from "@/lib/utils";
import { useT } from "@/i18n/client";

// TO-a: the forms of the time off. The request (the person's own, or entered by an approver for someone), the
// decision, the cancellation and the bank adjustment.

const INPUT = "h-11 w-full min-w-0 rounded-[10px] border bg-background px-3 text-base";
const BTN = "inline-flex h-9 items-center gap-1 rounded-md border px-2.5 text-xs font-medium hover:bg-muted disabled:opacity-50";
type Result = { ok: true } | { ok: false; message: string };

function useRun() {
  const t = useT();
  const router = useRouter();
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<Result>, ok: string, done?: () => void) =>
    start(async () => {
      const r = await fn();
      if (!r.ok) return void toast.error(t(r.message));
      toast.success(ok);
      done?.();
      router.refresh();
    });
  return { pending, run };
}

/**
 * Ask for time off: the policy, the day or the range, the hours per day (1 h up to the full day) and the reason. Shows
 * the bank now and after. With `people`, an approver enters it for someone (approved at once).
 */
export function TimeOffRequestForm({ today, fullDayMinutes, bankMinutes, holidays, people }: { today: string; fullDayMinutes: number; bankMinutes: number | null; holidays: string[]; people?: { id: number; name: string; fullDayMinutes: number; bankMinutes: number | null }[] }) {
  const t = useT();
  const { pending, run } = useRun();
  const [employeeId, setEmployeeId] = useState<number | "">("");
  const [policy, setPolicy] = useState<Policy>("Paid absence");
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const [hours, setHours] = useState(0);
  const [reason, setReason] = useState("");
  const person = people?.find((p) => p.id === employeeId);
  const full = person?.fullDayMinutes ?? fullDayMinutes;
  const bank = people ? (person?.bankMinutes ?? null) : bankMinutes;
  const days = from && to && to >= from ? requestDays(from, to, holidays).length : 0;
  const taking = days * (hours === 0 ? full : Math.min(hours * 60, full));
  const input: RequestInput = { policy, starts_on: from, ends_on: to, hours, reason };

  return (
    <form
      className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (people && employeeId === "") return void toast.error(t("Pick the person."));
        run(
          () => (people ? enterTimeOffAction(employeeId as number, input) : requestTimeOffAction(input)),
          people ? t("Time off added.") : t("Request sent. You will get the answer here."),
          () => setReason(""),
        );
      }}
    >
      {people && (
        <label className="block sm:col-span-2 lg:col-span-4">
          <span className="mb-1 block text-xs text-text-2">{t("Person")}</span>
          <select className={INPUT} value={employeeId} onChange={(e) => setEmployeeId(e.target.value ? Number(e.target.value) : "")} required>
            <option value="">{t("Person")}</option>
            {people.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
      )}
      <label className="block">
        <span className="mb-1 block text-xs text-text-2">{t("Policy")}</span>
        <select className={INPUT} value={policy} onChange={(e) => setPolicy(e.target.value as Policy)}>
          {POLICIES.map((p) => (
            <option key={p} value={p}>
              {t(p)}
            </option>
          ))}
        </select>
      </label>
      <label className="block">
        <span className="mb-1 block text-xs text-text-2">{t("First day")}</span>
        <input className={INPUT} type="date" required value={from} onChange={(e) => (setFrom(e.target.value), to < e.target.value && setTo(e.target.value))} />
      </label>
      <label className="block">
        <span className="mb-1 block text-xs text-text-2">{t("Last day")}</span>
        <input className={INPUT} type="date" required min={from} value={to} onChange={(e) => setTo(e.target.value)} />
      </label>
      <label className="block">
        <span className="mb-1 block text-xs text-text-2">{t("Hours per day")}</span>
        <select className={INPUT} value={hours} onChange={(e) => setHours(Number(e.target.value))}>
          <option value={0}>{t("Full day ({h} h)", { h: full / 60 })}</option>
          {hourChoices(full)
            .slice(0, -1)
            .map((h) => (
              <option key={h} value={h}>
                {h} h
              </option>
            ))}
        </select>
      </label>
      <label className="block sm:col-span-2 lg:col-span-4">
        <span className="mb-1 block text-xs text-text-2">{t("Reason")}</span>
        <input className={INPUT} required minLength={3} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} />
      </label>
      <p className="text-[13px] sm:col-span-2 lg:col-span-3">
        {days === 0 ? (
          <span className="text-warn-fg">{t("Those dates have no working day (Monday to Friday).")}</span>
        ) : (
          <>
            {t("{n} working days · {h} h from the bank", { n: days, h: bankHours(taking) })}
            {" · "}
            {bank === null ? (
              <span className="text-text-2">{t("the bank has no opening balance yet")}</span>
            ) : (
              <>
                {t("bank now {h} h", { h: bankHours(bank) })} → <b className={cn(bank - taking < 0 && "text-bad-fg")}>{t("after {h} h", { h: bankHours(bank - taking) })}</b>
              </>
            )}
            {policy === "Unpaid absence" && <span className="text-text-2"> · {t("not paid")}</span>}
          </>
        )}
      </p>
      <button type="submit" disabled={pending || days === 0} className="inline-flex h-11 items-center justify-center gap-1.5 rounded-[10px] bg-primary px-4 text-sm font-semibold text-primary-foreground hover:brightness-95 disabled:opacity-50">
        {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Plus className="size-4" aria-hidden />}
        {people ? t("Add time off") : t("Send request")}
      </button>
    </form>
  );
}

/** Approve or refuse a pending request (a comment is required to refuse). */
export function RequestDecision({ id }: { id: number }) {
  const t = useT();
  const { pending, run } = useRun();
  const [comment, setComment] = useState("");
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <input type="text" value={comment} onChange={(e) => setComment(e.target.value)} placeholder={t("Comment (required to refuse)")} aria-label={t("Comment")} maxLength={500} className={cn(INPUT, "flex-1 sm:max-w-sm")} />
      <button type="button" disabled={pending} className={cn(BTN, "border-ok-fg/40 text-ok-fg")} onClick={() => run(() => decideTimeOffAction(id, true, comment), t("Request approved"))}>
        <Check className="size-3.5" aria-hidden /> {t("Approve")}
      </button>
      <button
        type="button"
        disabled={pending}
        className={cn(BTN, "border-bad-fg/40 text-bad-fg")}
        onClick={() => {
          if (!comment.trim()) return void toast.error(t("Say why you are refusing (the person reads it)."));
          run(() => decideTimeOffAction(id, false, comment), t("Request refused"));
        }}
      >
        <X className="size-3.5" aria-hidden /> {t("Refuse")}
      </button>
    </div>
  );
}

/** Cancel a request: the person their own pending one; an approver a pending or approved one (the hours go back). */
export function CancelRequest({ id, approved }: { id: number; approved: boolean }) {
  const t = useT();
  const { pending, run } = useRun();
  return (
    <button
      type="button"
      disabled={pending}
      className={BTN}
      onClick={() => {
        if (!confirm(approved ? t("Cancel this approved time off? Its hours go back to the bank.") : t("Cancel this request?"))) return;
        run(() => cancelTimeOffAction(id), t("Cancelled"));
      }}
    >
      <X className="size-3.5" aria-hidden /> {t("Cancel request")}
    </button>
  );
}

/** Jessica: the opening balance, or an adjustment (+/-), always with the reason. */
export function BankAdjust({ employeeId, today, hasOpening }: { employeeId: number; today: string; hasOpening: boolean }) {
  const t = useT();
  const { pending, run } = useRun();
  const [open, setOpen] = useState(false);
  const [hours, setHours] = useState("");
  const [day, setDay] = useState(today);
  const [reason, setReason] = useState("");
  if (!open)
    return (
      <button type="button" className={BTN} onClick={() => setOpen(true)}>
        {hasOpening ? t("Adjust") : t("Set opening balance")}
      </button>
    );
  return (
    <form
      className="mt-1 grid gap-2 rounded-xl border bg-muted/40 p-2.5 sm:grid-cols-[7rem_11rem_1fr_auto_auto]"
      onSubmit={(e) => {
        e.preventDefault();
        run(
          () => adjustBankAction({ employeeId, kind: hasOpening ? "adjustment" : "opening", hours, day, reason }),
          t("Saved"),
          () => (setOpen(false), setHours(""), setReason("")),
        );
      }}
    >
      <label className="block">
        <span className="mb-1 block text-xs text-text-2">{hasOpening ? t("Hours (+ or −)") : t("Hours")}</span>
        <input className={INPUT} type="number" inputMode="decimal" step="0.5" required placeholder={hasOpening ? "-4" : "40"} value={hours} onChange={(e) => setHours(e.target.value)} />
      </label>
      <label className="block">
        <span className="mb-1 block text-xs text-text-2">{t("Date")}</span>
        <input className={INPUT} type="date" required max={today} value={day} onChange={(e) => setDay(e.target.value)} />
      </label>
      <label className="block">
        <span className="mb-1 block text-xs text-text-2">{t("Reason")}</span>
        <input className={INPUT} required minLength={3} maxLength={300} value={reason} onChange={(e) => setReason(e.target.value)} />
      </label>
      <button type="submit" disabled={pending} className="inline-flex h-11 items-center justify-center rounded-[10px] bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-50 sm:self-end">
        {t("Save")}
      </button>
      <button type="button" onClick={() => setOpen(false)} className="h-11 rounded-[10px] border px-3 text-sm hover:bg-muted sm:self-end">
        {t("Cancel")}
      </button>
    </form>
  );
}
