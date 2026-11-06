"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { HoursFields, hoursText } from "@/components/employee/overtime-forms";
import { deleteGroupHoursAction, setGroupHoursAction, type HoursInput } from "@/lib/payroll/overtime-actions";
import { formatDate } from "@/lib/dates";
import { CLOCK_GROUPS } from "@/lib/time-clock/clock";
import { useT } from "@/i18n/client";

// OT: the regular hours per day (and per week) of each time-clock group, with history, on the Pay periods page
// (next to Pay schedules). Office 10 h and Field 9 h to start; a person may have their own value on their Employee page.

export type GroupHoursView = { id: number; group: string; daily: number; weekly: number | null; from: string; note: string | null };

export function GroupHoursPanel({ rows, today }: { rows: GroupHoursView[]; today: string }) {
  const t = useT();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);
  const [group, setGroup] = useState<string>(CLOCK_GROUPS[0]);
  const [v, setV] = useState<HoursInput>({ daily: "", weekly: "", from: today, note: "" });

  if (!open)
    return (
      <button type="button" onClick={() => setOpen(true)} className="h-11 rounded-lg border px-3 text-sm hover:bg-muted">
        {t("Regular hours")}
      </button>
    );

  const run = (fn: () => Promise<{ ok: true } | { ok: false; message: string }>, done?: () => void) =>
    start(async () => {
      const r = await fn();
      if (!r.ok) return void toast.error(t(r.message));
      toast.success(t("Saved"));
      done?.();
      router.refresh();
    });
  const current = (g: string) => rows.filter((r) => r.group === g && r.from <= today).sort((a, b) => (a.from < b.from ? 1 : -1))[0] ?? null;

  return (
    <section className="basis-full rounded-2xl border bg-card px-[18px] py-4 shadow-card">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-[15px] font-semibold tracking-tight">{t("Regular hours per group")}</h2>
        <button type="button" onClick={() => setOpen(false)} className="h-10 rounded-lg border px-3 text-sm hover:bg-muted">
          {t("Close")}
        </button>
      </div>
      <p className="mb-3 text-xs text-text-2">{t("Hours of a day past the group's limit are overtime (several shifts of a day add up first). The value in force on the day worked counts; a person can have their own on the Employee page.")}</p>
      <dl className="mb-3 grid grid-cols-2 gap-2">
        {CLOCK_GROUPS.map((g) => {
          const c = current(g);
          return (
            <div key={g} className="rounded-xl border px-3 py-2">
              <dt className="text-[11px] text-text-2">{t(g)}</dt>
              <dd className="text-sm font-semibold tabular-nums">{c ? hoursText(c.daily, c.weekly, t) : t("not set (9 h/day)")}</dd>
              {c && <dd className="text-xs text-text-2">{t("since {date}", { date: formatDate(c.from) })}</dd>}
            </div>
          );
        })}
      </dl>
      <form
        className="grid grid-cols-2 gap-2 sm:grid-cols-[8rem_7rem_9rem_11rem_1fr_auto]"
        onSubmit={(e) => {
          e.preventDefault();
          run(
            () => setGroupHoursAction(group, v),
            () => setV({ daily: "", weekly: "", from: today, note: "" }),
          );
        }}
      >
        <label className="block">
          <span className="mb-1 block text-xs text-text-2">{t("Group")}</span>
          <select className="h-11 w-full rounded-lg border border-input bg-card px-3 text-base" value={group} onChange={(e) => setGroup(e.target.value)}>
            {CLOCK_GROUPS.map((g) => (
              <option key={g} value={g}>
                {t(g)}
              </option>
            ))}
          </select>
        </label>
        <HoursFields v={v} set={setV} submitLabel={t("Set hours")} pending={pending} />
      </form>
      {rows.length > 0 && (
        <ul className="mt-3 divide-y rounded-xl border text-[13px]">
          {rows.map((r) => (
            <li key={r.id} className="flex items-center justify-between gap-2 px-3 py-2">
              <span className="min-w-0">
                <span className="mr-1 rounded bg-muted px-1.5 text-[11px]">{t(r.group)}</span>
                <b className="tabular-nums">{hoursText(r.daily, r.weekly, t)}</b> <span className="text-text-2">{t("from {date}", { date: formatDate(r.from) })}</span>
                {r.note && <span className="block truncate text-xs text-muted-foreground">{r.note}</span>}
              </span>
              <button
                type="button"
                disabled={pending}
                aria-label={t("Remove")}
                className="inline-flex size-9 shrink-0 items-center justify-center rounded-lg hover:bg-muted"
                onClick={() => {
                  if (!confirm(t("Remove this value? Days from that date on will use the previous one."))) return;
                  run(() => deleteGroupHoursAction(r.id));
                }}
              >
                <Trash2 className="size-4" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
