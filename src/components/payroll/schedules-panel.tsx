"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Plus } from "lucide-react";
import { toast } from "sonner";
import { savePayScheduleAction, type ScheduleInput } from "@/lib/payroll/actions";
import { CYCLE_DAYS, describeRule, FREQUENCIES, WEEKDAYS, weekdayOf, type Frequency, type PayDayRule, type Schedule } from "@/lib/payroll/periods";
import { formatDate } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { useT } from "@/i18n/client";

// PS-a: the pay schedules (groups): name, frequency, anchor date (its weekday is the cut day) and the pay-day rule.

const BOX = "h-11 w-full rounded-lg border bg-card px-3 text-base";

type Draft = { id: number | null; name: string; frequency: Frequency; anchor_on: string; ruleKind: PayDayRule["kind"]; days: number; weekday: number; active: boolean };
const EMPTY: Draft = { id: null, name: "", frequency: "Biweekly", anchor_on: "", ruleKind: "days_after", days: 5, weekday: 5, active: true };
const toDraft = (s: Schedule): Draft => ({ id: s.id, name: s.name, frequency: s.frequency, anchor_on: s.anchor_on, ruleKind: s.pay_day_rule.kind, days: s.pay_day_rule.kind === "days_after" ? s.pay_day_rule.days : 5, weekday: s.pay_day_rule.kind === "weekday" ? s.pay_day_rule.weekday : 5, active: s.active });

export function SchedulesPanel({ schedules, open: openFirst = false }: { schedules: Schedule[]; open?: boolean }) {
  const t = useT();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(openFirst);
  const [draft, setDraft] = useState<Draft | null>(null);

  if (!open)
    return (
      <button type="button" onClick={() => setOpen(true)} className="h-11 rounded-lg border px-3 text-sm hover:bg-muted">
        {t("Pay schedules")}
      </button>
    );

  const save = (d: Draft) => {
    const input: ScheduleInput = { id: d.id, name: d.name, frequency: d.frequency, anchor_on: d.anchor_on, pay_day_rule: d.ruleKind === "days_after" ? { kind: "days_after", days: d.days } : { kind: "weekday", weekday: d.weekday }, active: d.active };
    start(async () => {
      const r = await savePayScheduleAction(input);
      if (!r.ok) return void toast.error(t(r.message));
      toast.success(t("Saved"));
      setDraft(null);
      router.refresh();
    });
  };
  const anchorWeekday = draft?.anchor_on && /^\d{4}-\d{2}-\d{2}$/.test(draft.anchor_on) ? t(WEEKDAYS[weekdayOf(draft.anchor_on)]) : null;

  return (
    <section className="basis-full rounded-2xl border bg-card px-[18px] py-4 shadow-card">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-[15px] font-semibold tracking-tight">{t("Pay schedules")}</h2>
        <div className="flex gap-2">
          {!draft && (
            <button type="button" onClick={() => setDraft(EMPTY)} className="inline-flex h-10 items-center gap-1 rounded-lg border px-3 text-sm hover:bg-muted">
              <Plus className="size-4" aria-hidden /> {t("New schedule")}
            </button>
          )}
          <button type="button" onClick={() => (setOpen(false), setDraft(null))} className="h-10 rounded-lg border px-3 text-sm hover:bg-muted">
            {t("Close")}
          </button>
        </div>
      </div>
      <p className="mb-3 text-xs text-muted-foreground">{t("Each group has its own cycle: periods run 14 or 28 days from the anchor date (the day of the week it falls on is the cut day). The calendar month is also available. Each person is linked to a group on their Employee page.")}</p>

      {schedules.length === 0 && !draft && <p className="text-sm text-text-2">{t("No pay schedule yet.")}</p>}
      <ul className="divide-y rounded-xl border">
        {schedules.map((s) => (
          <li key={s.id} className={cn("flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-[13px]", !s.active && "text-muted-foreground")}>
            <span className="font-semibold">{s.name}</span>
            <span className="text-text-2">{t(s.frequency)}</span>
            <span className="text-text-2">{CYCLE_DAYS[s.frequency] ? t("from {date} ({weekday})", { date: formatDate(s.anchor_on), weekday: t(WEEKDAYS[weekdayOf(s.anchor_on)]) }) : t("calendar months")}</span>
            <span className="text-text-2">{t("paid {rule}", { rule: describeRule(s.pay_day_rule, t) })}</span>
            {!s.active && <span className="rounded bg-muted px-1.5 py-0.5 text-xs">{t("Inactive")}</span>}
            <span className="flex-1" />
            <button type="button" aria-label={t("Edit {name}", { name: s.name })} onClick={() => setDraft(toDraft(s))} className="inline-flex size-9 items-center justify-center rounded-lg hover:bg-muted">
              <Pencil className="size-4" aria-hidden />
            </button>
          </li>
        ))}
      </ul>

      {draft && (
        <form
          className="mt-3 grid gap-3 rounded-xl border bg-muted/40 p-3 sm:grid-cols-2 lg:grid-cols-3"
          onSubmit={(e) => {
            e.preventDefault();
            save(draft);
          }}
        >
          <label className="block text-sm font-medium">
            {t("Name")}
            <input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} className={`${BOX} mt-1`} maxLength={60} required />
          </label>
          <label className="block text-sm font-medium">
            {t("Frequency")}
            <select value={draft.frequency} onChange={(e) => setDraft({ ...draft, frequency: e.target.value as Frequency })} className={`${BOX} mt-1`}>
              {FREQUENCIES.map((f) => (
                <option key={f} value={f}>
                  {t(f)}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm font-medium">
            {CYCLE_DAYS[draft.frequency] ? t("Anchor date (first day of a period)") : t("First month (any day of it)")}
            <input type="date" value={draft.anchor_on} onChange={(e) => setDraft({ ...draft, anchor_on: e.target.value })} className={`${BOX} mt-1`} required />
            {anchorWeekday && CYCLE_DAYS[draft.frequency] && <span className="mt-1 block text-xs font-normal text-text-2">{t("Cut day: {weekday}. Every period starts on a {weekday}.", { weekday: anchorWeekday })}</span>}
          </label>
          <label className="block text-sm font-medium">
            {t("Pay day")}
            <select value={draft.ruleKind} onChange={(e) => setDraft({ ...draft, ruleKind: e.target.value as PayDayRule["kind"] })} className={`${BOX} mt-1`}>
              <option value="days_after">{t("Some days after the period ends")}</option>
              <option value="weekday">{t("The first given weekday after the period ends")}</option>
            </select>
          </label>
          {draft.ruleKind === "days_after" ? (
            <label className="block text-sm font-medium">
              {t("Days after the period ends")}
              <input type="number" inputMode="numeric" min={0} max={31} value={draft.days} onChange={(e) => setDraft({ ...draft, days: Math.max(0, Math.min(31, Number(e.target.value) || 0)) })} className={`${BOX} mt-1`} />
            </label>
          ) : (
            <label className="block text-sm font-medium">
              {t("Weekday")}
              <select value={draft.weekday} onChange={(e) => setDraft({ ...draft, weekday: Number(e.target.value) })} className={`${BOX} mt-1`}>
                {WEEKDAYS.map((w, i) => (
                  <option key={w} value={i}>
                    {t(w)}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className="flex min-h-11 items-center gap-2 self-end text-sm font-medium">
            <input type="checkbox" checked={draft.active} onChange={(e) => setDraft({ ...draft, active: e.target.checked })} className="size-5" />
            {t("Active (shown on Pay periods)")}
          </label>
          <div className="flex gap-2 sm:col-span-2 lg:col-span-3">
            <button type="submit" disabled={pending} className="h-11 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-60">
              {t("Save")}
            </button>
            <button type="button" onClick={() => setDraft(null)} className="h-11 rounded-lg border px-3 text-sm hover:bg-muted">
              {t("Cancel")}
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
