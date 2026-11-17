"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, CheckCheck, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { decideOvertimeAction } from "@/lib/time-clock/overtime-actions";
import { STATUS_TEXT, type OvertimeStatus } from "@/lib/time-clock/overtime-rules";
import { cn } from "@/lib/utils";
import { useT } from "@/i18n/client";

// OT-b "Overtime of the week": per person, each day with its job, times, excess and the technician's justification.
// The approver approves or refuses a day, a person's days, or everything listed; refusing needs a comment.

export type OvertimeRowView = {
  id: number;
  day: string;
  /** "Tue 11/17" */
  dayLabel: string;
  href: string;
  job: string;
  times: string;
  worked: string;
  excess: string;
  status: OvertimeStatus;
  justification: string | null;
  /** "due 11/19 5:40 PM" while waiting for the justification. */
  due: string | null;
  decision: string | null;
  comment: string | null;
};
export type OvertimePersonView = { employeeId: number; name: string; rows: OvertimeRowView[] };

const TONE: Record<OvertimeStatus, string> = { awaiting_justification: "bg-warn-bg text-warn-fg", pending: "bg-warn-bg text-warn-fg", approved: "bg-ok-bg text-ok-fg", refused: "bg-bad-bg text-bad-fg", void: "bg-muted text-text-2" };
const BTN = "inline-flex h-9 items-center gap-1 rounded-md border px-2.5 text-xs font-medium hover:bg-muted disabled:opacity-50";

export function OvertimeQueue({ people, canDecide, decided = false }: { people: OvertimePersonView[]; canDecide: boolean; decided?: boolean }) {
  const t = useT();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [comments, setComments] = useState<Record<number, string>>({});
  const all = people.flatMap((p) => p.rows);

  const decide = (ids: number[], approve: boolean, comment: string) =>
    start(async () => {
      const r = await decideOvertimeAction(ids, approve, comment);
      if (!r.ok) return void toast.error(t(r.message));
      toast.success(approve ? t("{n} days approved", { n: r.decided }) : t("{n} days refused", { n: r.decided }));
      if (r.skipped) toast.warning(t("{n} days kept their decision: the person's timesheet period is approved. Reopen it first.", { n: r.skipped }));
      router.refresh();
    });
  const approveMany = (rows: OvertimeRowView[], who: string) => {
    if (!confirm(t("Approve {n} overtime days of {who}?", { n: rows.length, who }))) return;
    decide(rows.map((r) => r.id), true, "");
  };

  if (!people.length) return <p className="rounded-2xl border border-dashed bg-card px-6 py-8 text-center text-sm text-text-2">{decided ? t("Nothing decided in this week.") : t("No overtime waiting. Days show here as soon as the technician clocks out past the limit.")}</p>;

  return (
    <div className="grid gap-3">
      {canDecide && !decided && all.length > 1 && (
        <div>
          <button type="button" disabled={pending} onClick={() => approveMany(all, t("everyone"))} className="inline-flex h-11 items-center gap-1.5 rounded-[10px] bg-primary px-3 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-60">
            {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <CheckCheck className="size-4" aria-hidden />}
            {t("Approve all ({n})", { n: all.length })}
          </button>
        </div>
      )}
      {people.map((p) => (
        <section key={p.employeeId} className="overflow-hidden rounded-2xl border bg-card shadow-card">
          <header className="flex flex-wrap items-center justify-between gap-2 border-b bg-muted/50 px-3 py-2 md:px-4">
            <h3 className="text-[15px] font-semibold tracking-tight">
              {p.name} <span className="text-xs font-normal text-text-2">{t("{n} days", { n: p.rows.length })}</span>
            </h3>
            {canDecide && !decided && p.rows.length > 1 && (
              <button type="button" disabled={pending} className={BTN} onClick={() => approveMany(p.rows, p.name)}>
                <CheckCheck className="size-3.5" aria-hidden /> {t("Approve all of this person")}
              </button>
            )}
          </header>
          <ul className="divide-y">
            {p.rows.map((r) => (
              <li key={r.id} className="grid gap-1.5 px-3 py-2.5 text-[13px] md:px-4">
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
                  <Link href={r.href} className="font-semibold tabular-nums hover:underline">
                    {r.dayLabel}
                  </Link>
                  <span className="tabular-nums text-text-2">{r.times}</span>
                  <span className="tabular-nums">
                    {r.worked} <b className={cn("ml-1 rounded px-1", TONE[r.status], r.status === "refused" && "line-through")}>+{r.excess}</b>
                  </span>
                  <span className={cn("rounded px-1.5 text-[11px] font-medium", TONE[r.status])}>{t(STATUS_TEXT[r.status])}</span>
                </div>
                {r.job && <p className="text-text-2">{r.job}</p>}
                <p>
                  <span className="text-text-2">{t("Justification")}:</span> {r.justification ? r.justification : <span className="text-warn-fg">{r.due ? t("not written yet ({due})", { due: r.due }) : t("not written yet")}</span>}
                </p>
                {r.decision && (
                  <p className="text-xs text-text-2">
                    {r.decision}
                    {r.comment ? `: ${r.comment}` : ""}
                  </p>
                )}
                {canDecide && (
                  <div className="flex flex-wrap items-center gap-1.5">
                    <input type="text" value={comments[r.id] ?? ""} onChange={(e) => setComments({ ...comments, [r.id]: e.target.value })} placeholder={t("Comment (required to refuse)")} aria-label={t("Comment")} maxLength={500} className="h-11 min-w-0 flex-1 rounded-[10px] border bg-background px-3 text-base sm:max-w-sm" />
                    {r.status !== "approved" && (
                      <button type="button" disabled={pending} className={cn(BTN, "border-ok-fg/40 text-ok-fg")} onClick={() => decide([r.id], true, comments[r.id] ?? "")}>
                        <Check className="size-3.5" aria-hidden /> {t("Approve")}
                      </button>
                    )}
                    {r.status !== "refused" && (
                      <button
                        type="button"
                        disabled={pending}
                        className={cn(BTN, "border-bad-fg/40 text-bad-fg")}
                        onClick={() => {
                          if (!(comments[r.id] ?? "").trim()) return void toast.error(t("Say why you are refusing (the technician reads it)."));
                          decide([r.id], false, comments[r.id]);
                        }}
                      >
                        <X className="size-3.5" aria-hidden /> {t("Refuse")}
                      </button>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
